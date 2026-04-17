import {
  JiraDriverSettings,
  JiraIssueSummary,
  JiraProjectSummary,
  WorkspaceContext,
} from "../models";
import { OpenAICompatibleClient, OutputLogger } from "../ai/openAiCompatibleClient";
import { JiraClient } from "../jira/jiraClient";
import {
  buildKeywordSearchJql,
  buildProjectIssuesJql,
} from "./jql";
import { WorkspaceContextCollector } from "../workspace/contextCollector";
import { uniqueNonEmpty } from "../utils/strings";

export class DiscoveryService {
  public constructor(
    private readonly jiraClient: JiraClient,
    private readonly aiClient: OpenAICompatibleClient,
    private readonly contextCollector: WorkspaceContextCollector,
    private readonly getSettings: () => JiraDriverSettings,
    private readonly logger?: OutputLogger,
  ) {}

  public async refreshOverview(): Promise<{
    projects: JiraProjectSummary[];
    workspaceContext: WorkspaceContext;
  }> {
    const settings = this.getSettings();
    const workspaceContext = await this.contextCollector.collect(settings);
    const projects = await this.getProjectOptions(settings);

    return {
      workspaceContext,
      projects,
    };
  }

  public async search(
    query: string,
    projectKeys: string[] = this.getSettings().defaultProjects,
  ): Promise<{ issues: JiraIssueSummary[]; workspaceContext: WorkspaceContext }> {
    const settings = this.getSettings();
    const workspaceContext = await this.contextCollector.collect(settings);
    const jql = buildKeywordSearchJql(query, projectKeys);
    const candidates = await this.jiraClient.searchIssues(jql);
    const ranked = await this.aiClient.rerankIssues(query, workspaceContext, candidates);

    return { issues: ranked, workspaceContext };
  }

  public async loadProjectIssues(projectKey: string, maxResults = 50): Promise<JiraIssueSummary[]> {
    return dedupeIssues(await this.jiraClient.searchIssues(buildProjectIssuesJql([projectKey]), maxResults));
  }

  public async getProjectOptions(
    settings: JiraDriverSettings,
  ): Promise<JiraProjectSummary[]> {
    try {
      const projects = await this.jiraClient.listProjects();
      if (settings.defaultProjects.length) {
        return mapConfiguredProjects(settings.defaultProjects, projects);
      }

      return projects;
    } catch (error) {
      this.logger?.appendLine(`Project list failed: ${String(error)}`);
      const fallbackProjects = uniqueNonEmpty(settings.defaultProjects).map((key) => ({
        id: key,
        key,
        name: key,
      }));
      if (fallbackProjects.length) {
        return fallbackProjects;
      }

      throw error;
    }
  }
}

function dedupeIssues(issues: JiraIssueSummary[]): JiraIssueSummary[] {
  const seenKeys = new Set<string>();
  return issues.filter((issue) => {
    if (seenKeys.has(issue.key)) {
      return false;
    }

    seenKeys.add(issue.key);
    return true;
  });
}

function mapConfiguredProjects(
  configuredProjectKeys: string[],
  projects: JiraProjectSummary[],
): JiraProjectSummary[] {
  const projectMap = new Map(projects.map((project) => [project.key, project]));

  return uniqueNonEmpty(configuredProjectKeys).map((projectKey) => (
    projectMap.get(projectKey) ?? {
      id: projectKey,
      key: projectKey,
      name: projectKey,
    }
  ));
}
