import { JiraDriverSettings, IssueGroup, JiraIssueSummary, WorkspaceContext } from "../models";
import { OpenAICompatibleClient, OutputLogger } from "../ai/openAiCompatibleClient";
import { JiraClient } from "../jira/jiraClient";
import {
  buildAssignedIssuesJql,
  buildKeywordSearchJql,
  buildProjectIssuesJql,
  deriveWorkspaceSearchTerms,
} from "./jql";
import { WorkspaceContextCollector } from "../workspace/contextCollector";

export class DiscoveryService {
  public constructor(
    private readonly jiraClient: JiraClient,
    private readonly aiClient: OpenAICompatibleClient,
    private readonly contextCollector: WorkspaceContextCollector,
    private readonly getSettings: () => JiraDriverSettings,
    private readonly logger?: OutputLogger,
  ) {}

  public async refreshOverview(): Promise<{ groups: IssueGroup[]; workspaceContext: WorkspaceContext }> {
    const settings = this.getSettings();
    const workspaceContext = await this.contextCollector.collect(settings);

    const [assignedIssues, projectIssues, recommendedIssues] = await Promise.all([
      this.jiraClient.searchIssues(buildAssignedIssuesJql()),
      this.getProjectResults(settings),
      this.getRecommendedIssues(workspaceContext, settings),
    ]);

    return {
      workspaceContext,
      groups: [
        { id: "recommended", label: "Recommended", issues: dedupeIssues(recommendedIssues) },
        { id: "assigned", label: "Assigned to Me", issues: dedupeIssues(assignedIssues) },
        { id: "projects", label: "Project Results", issues: dedupeIssues(projectIssues) },
        { id: "search", label: "Search Results", issues: [] },
      ],
    };
  }

  public async search(query: string): Promise<{ issues: JiraIssueSummary[]; workspaceContext: WorkspaceContext }> {
    const settings = this.getSettings();
    const workspaceContext = await this.contextCollector.collect(settings);
    const jql = buildKeywordSearchJql(query, settings.defaultProjects);
    const candidates = await this.jiraClient.searchIssues(jql);
    const ranked = await this.aiClient.rerankIssues(query, workspaceContext, candidates);

    return { issues: ranked, workspaceContext };
  }

  private async getProjectResults(settings: JiraDriverSettings): Promise<JiraIssueSummary[]> {
    const results: JiraIssueSummary[] = [];

    if (settings.defaultProjects.length) {
      results.push(...(await this.jiraClient.searchIssues(buildProjectIssuesJql(settings.defaultProjects))));
    }

    for (const savedJql of settings.savedJqls.slice(0, 3)) {
      try {
        results.push(...(await this.jiraClient.searchIssues(savedJql, 10)));
      } catch (error) {
        this.logger?.appendLine(`Saved JQL failed: ${savedJql} -> ${String(error)}`);
      }
    }

    return dedupeIssues(results);
  }

  private async getRecommendedIssues(
    workspaceContext: WorkspaceContext,
    settings: JiraDriverSettings,
  ): Promise<JiraIssueSummary[]> {
    const terms = deriveWorkspaceSearchTerms(workspaceContext).slice(0, 6);
    if (!terms.length) {
      return [];
    }

    const query = terms.join(" ");
    const candidates = await this.jiraClient.searchIssues(buildKeywordSearchJql(query, settings.defaultProjects));
    return this.aiClient.rerankIssues(query, workspaceContext, candidates);
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
