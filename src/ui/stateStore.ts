import * as vscode from "vscode";

import {
  AppState,
  ConfluencePageDetail,
  ConfluencePageSummary,
  ConfluenceSpaceSummary,
  HandoffArtifacts,
  IssueGroup,
  IssueScoringResult,
  JiraIssueDetail,
  JiraIssueSummary,
  JiraProjectExplorerState,
  JiraProjectFilterSelection,
  JiraProjectSummary,
} from "../models";

export class JiraDriverStore {
  private state: AppState = {
    signedIn: false,
    groups: [],
    jiraProjects: [],
    selectedProjectKeys: [],
    issueExplorerFilters: {},
    issueSearchResults: undefined,
    confluenceSpaces: [],
    confluenceSearchResults: [],
  };

  private readonly emitter = new vscode.EventEmitter<AppState>();
  public readonly onDidChangeState = this.emitter.event;

  public getState(): AppState {
    return this.state;
  }

  public setSignedIn(signedIn: boolean): void {
    this.patch({ signedIn });
  }

  public setGroups(groups: IssueGroup[]): void {
    this.patch({ groups });
  }

  public setIssueExplorerData(
    projects: JiraProjectSummary[],
  ): void {
    const existingProjects = new Map(
      this.state.jiraProjects.map((projectState) => [projectState.project.key, projectState]),
    );

    const jiraProjects = projects.map((project) => {
      const existing = existingProjects.get(project.key);
      if (!existing) {
        return createProjectExplorerState(project);
      }

      return {
        ...existing,
        project,
      };
    });

    const selectedProjectKeys = this.state.selectedProjectKeys.filter((projectKey) => (
      jiraProjects.some((project) => project.project.key === projectKey)
    ));

    this.patch({
      jiraProjects,
      selectedProjectKeys,
      issueExplorerFilters: selectedProjectKeys.length ? this.state.issueExplorerFilters : {},
      issueSearchResults: selectedProjectKeys.length ? this.state.issueSearchResults : undefined,
      groups: [],
    });
  }

  public setSelectedProjects(selectedProjectKeys: string[]): void {
    this.patch({
      selectedProjectKeys,
      issueExplorerFilters: selectedProjectKeys.length ? this.state.issueExplorerFilters : {},
      issueSearchResults: selectedProjectKeys.length ? this.state.issueSearchResults : undefined,
    });
  }

  public setProjectBrowseIssues(projectKey: string, browseIssues: JiraIssueSummary[]): void {
    this.updateProject(projectKey, (project) => ({
      ...project,
      isLoaded: true,
      browseIssues,
    }));
  }

  public setIssueSearchResults(
    query: string | undefined,
    issueSearchResults?: JiraIssueSummary[],
  ): void {
    this.patch({
      issueSearchResults: query ? issueSearchResults ?? [] : undefined,
      issueExplorerFilters: {
        ...this.state.issueExplorerFilters,
        query: query?.trim() || undefined,
      },
    });
  }

  public setIssueExplorerFilters(filters: Partial<JiraProjectFilterSelection>): void {
    this.patch({
      issueExplorerFilters: {
        ...this.state.issueExplorerFilters,
        ...filters,
      },
    });
  }

  public getProject(projectKey: string): JiraProjectExplorerState | undefined {
    return this.state.jiraProjects.find((project) => project.project.key === projectKey);
  }

  public setConfluenceSpaces(confluenceSpaces: ConfluenceSpaceSummary[]): void {
    this.patch({ confluenceSpaces });
  }

  public setConfluenceSearchResults(
    confluenceSearchQuery: string | undefined,
    confluenceSearchResults: ConfluencePageSummary[],
  ): void {
    this.patch({ confluenceSearchQuery, confluenceSearchResults });
  }

  public setSearchResults(issues: IssueGroup["issues"]): void {
    const groups = this.state.groups.length
      ? this.state.groups.map((group) => (group.id === "search" ? { ...group, issues } : group))
      : [{ id: "search" as const, label: "Search Results", issues }];

    this.patch({ groups });
  }

  public setSelectedIssue(issue?: JiraIssueDetail): void {
    this.patch({
      selectedIssue: issue,
      selectedIssueScore: this.state.selectedIssue?.key === issue?.key ? this.state.selectedIssueScore : undefined,
      commentDraft: this.state.selectedIssue?.key === issue?.key ? this.state.commentDraft : undefined,
      handoffArtifacts: this.state.selectedIssue?.key === issue?.key ? this.state.handoffArtifacts : undefined,
    });
  }

  public setSelectedConfluencePage(page?: ConfluencePageDetail): void {
    this.patch({ selectedConfluencePage: page });
  }

  public setScoring(score?: IssueScoringResult): void {
    this.patch({ selectedIssueScore: score });
  }

  public setCommentDraft(commentDraft?: string): void {
    this.patch({ commentDraft });
  }

  public setHandoffArtifacts(handoffArtifacts?: HandoffArtifacts): void {
    this.patch({ handoffArtifacts });
  }

  public setBusyMessage(busyMessage?: string): void {
    this.patch({ busyMessage });
  }

  public setError(lastError?: string): void {
    this.patch({ lastError });
  }

  public reset(): void {
    this.state = {
      signedIn: false,
      groups: [],
      jiraProjects: [],
      selectedProjectKeys: [],
      issueExplorerFilters: {},
      issueSearchResults: undefined,
      confluenceSpaces: [],
      confluenceSearchResults: [],
    };
    this.emitter.fire(this.state);
  }

  private patch(partial: Partial<AppState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };

    this.emitter.fire(this.state);
  }

  private updateProject(
    projectKey: string,
    updater: (project: JiraProjectExplorerState) => JiraProjectExplorerState,
  ): void {
    this.patch({
      jiraProjects: this.state.jiraProjects.map((project) => (
        project.project.key === projectKey ? updater(project) : project
      )),
    });
  }
}

function createProjectExplorerState(project: JiraProjectSummary): JiraProjectExplorerState {
  return {
    project,
    isLoaded: false,
    browseIssues: [],
  };
}
