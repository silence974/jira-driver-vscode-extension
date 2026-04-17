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
} from "../models";

export class JiraDriverStore {
  private state: AppState = {
    signedIn: false,
    groups: [],
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
}
