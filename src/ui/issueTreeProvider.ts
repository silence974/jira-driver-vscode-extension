import * as vscode from "vscode";

import { AppState, JiraIssueSummary } from "../models";
import {
  buildVisibleIssueList,
  collectSelectedProjectBrowseIssues,
  getSelectedProjectFilterOptions,
  sanitizeProjectFilters,
  UNASSIGNED_ASSIGNEE_ACCOUNT_ID,
} from "../discovery/projectIssueFilters";
import { JiraDriverStore } from "./stateStore";
import { truncate } from "../utils/strings";

export type IssueFilterKind = "project" | "issueType" | "status" | "assignee";

type IssueTreeNode = FilterNode | IssueNode | MessageNode;

class FilterNode {
  public constructor(public readonly filterKind: IssueFilterKind) {}
}

class IssueNode {
  public constructor(public readonly issue: JiraIssueSummary) {}
}

class MessageNode {
  public constructor(public readonly label: string) {}
}

export class IssueTreeProvider implements vscode.TreeDataProvider<IssueTreeNode> {
  private readonly emitter = new vscode.EventEmitter<IssueTreeNode | undefined>();
  public readonly onDidChangeTreeData = this.emitter.event;

  public constructor(private readonly store: JiraDriverStore) {
    this.store.onDidChangeState(() => this.emitter.fire(undefined));
  }

  public getTreeItem(element: IssueTreeNode): vscode.TreeItem {
    if (element instanceof FilterNode) {
      const item = new vscode.TreeItem(getFilterLabel(element.filterKind), vscode.TreeItemCollapsibleState.None);
      item.description = getFilterValueLabel(this.store.getState(), element.filterKind);
      item.contextValue = `jiraDriver.filter.${element.filterKind}`;
      item.iconPath = new vscode.ThemeIcon(getFilterIcon(element.filterKind));
      item.command = {
        command: "jiraDriver.pickIssueExplorerFilter",
        title: "Pick Jira Explorer Filter",
        arguments: [element.filterKind],
      };
      return item;
    }

    if (element instanceof MessageNode) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = "jiraDriver.message";
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }

    const issue = element.issue;
    const item = new vscode.TreeItem(issue.key, vscode.TreeItemCollapsibleState.None);
    item.description = `${issue.projectKey} · ${issue.summary}`;
    item.tooltip = new vscode.MarkdownString(
      [
        `**${issue.key}**`,
        issue.summary,
        `Project: ${issue.projectKey}`,
        `Status: ${issue.status}`,
        issue.issueType ? `Type: ${issue.issueType}` : undefined,
        issue.assigneeDisplayName ? `Assignee: ${issue.assigneeDisplayName}` : undefined,
      ].filter(Boolean).join("\n\n"),
    );
    item.contextValue = "jiraDriver.issue";
    item.iconPath = new vscode.ThemeIcon("issues");
    item.command = {
      command: "jiraDriver.openIssue",
      title: "Open Jira Issue",
      arguments: [issue.key],
    };
    return item;
  }

  public async getChildren(element?: IssueTreeNode): Promise<IssueTreeNode[]> {
    if (!element) {
      const state = this.store.getState();
      const visibleIssues = getVisibleIssues(state);
      const filters: IssueTreeNode[] = [
        new FilterNode("project"),
        new FilterNode("issueType"),
        new FilterNode("status"),
        new FilterNode("assignee"),
      ];

      if (!state.selectedProjectKeys.length) {
        return [
          ...filters,
          new MessageNode("Select one or more projects to view issues."),
        ];
      }

      if (!visibleIssues.length) {
        return [
          ...filters,
          new MessageNode(buildEmptyMessage(state)),
        ];
      }

      return [
        ...filters,
        ...visibleIssues.map((issue) => new IssueNode(issue)),
      ];
    }

    return [];
  }
}

function getFilterLabel(filterKind: IssueFilterKind): string {
  switch (filterKind) {
    case "project":
      return "Project";
    case "issueType":
      return "Type";
    case "status":
      return "Status";
    case "assignee":
      return "Assignee";
  }
}

function getFilterIcon(filterKind: IssueFilterKind): string {
  switch (filterKind) {
    case "project":
      return "folder-library";
    case "issueType":
      return "symbol-interface";
    case "status":
      return "pulse";
    case "assignee":
      return "account";
  }
}

function getFilterValueLabel(state: AppState, filterKind: IssueFilterKind): string {
  if (filterKind === "project") {
    if (!state.selectedProjectKeys.length) {
      return "None";
    }

    if (state.selectedProjectKeys.length === 1) {
      const project = state.jiraProjects.find((item) => item.project.key === state.selectedProjectKeys[0]);
      return project ? `${project.project.name}` : state.selectedProjectKeys[0];
    }

    return `${state.selectedProjectKeys.length} selected`;
  }

  const options = getSelectedProjectFilterOptions(state.jiraProjects, state.selectedProjectKeys);
  const filters = sanitizeProjectFilters(
    state.issueExplorerFilters,
    options.assignees,
    options.issueTypes,
    options.statuses,
  );

  switch (filterKind) {
    case "issueType":
      return filters.issueType ?? "Any";
    case "status":
      return filters.status ?? "Any";
    case "assignee":
      return options.assignees.find((assignee) => assignee.accountId === filters.assigneeAccountId)?.displayName
        ?? "Anyone";
  }
}

function getVisibleIssues(state: AppState): JiraIssueSummary[] {
  const browseIssues = collectSelectedProjectBrowseIssues(state.jiraProjects, state.selectedProjectKeys);
  const options = getSelectedProjectFilterOptions(state.jiraProjects, state.selectedProjectKeys);
  const filters = sanitizeProjectFilters(
    state.issueExplorerFilters,
    options.assignees,
    options.issueTypes,
    options.statuses,
  );

  return buildVisibleIssueList(browseIssues, filters, state.issueSearchResults);
}

function buildEmptyMessage(state: AppState): string {
  const browseIssues = collectSelectedProjectBrowseIssues(state.jiraProjects, state.selectedProjectKeys);
  const options = getSelectedProjectFilterOptions(state.jiraProjects, state.selectedProjectKeys);
  const filters = sanitizeProjectFilters(
    state.issueExplorerFilters,
    options.assignees,
    options.issueTypes,
    options.statuses,
  );

  if (!browseIssues.length) {
    return "No open issues found in the selected projects.";
  }

  if (filters.query) {
    return "No issues match the current search and filters.";
  }

  if (filters.issueType || filters.status || filters.assigneeAccountId) {
    return "No issues match the current filters.";
  }

  return "No issues to display.";
}

export function formatProjectSelectionSummary(state: AppState): string {
  if (!state.selectedProjectKeys.length) {
    return "None";
  }

  const selectedProjects = state.selectedProjectKeys
    .map((projectKey) => state.jiraProjects.find((project) => project.project.key === projectKey)?.project.name ?? projectKey);

  if (selectedProjects.length === 1) {
    return truncate(selectedProjects[0], 24);
  }

  const preview = selectedProjects.slice(0, 2).map((name) => truncate(name, 14)).join(", ");
  return selectedProjects.length > 2 ? `${preview} +${selectedProjects.length - 2}` : preview;
}

export function getAssigneeLabel(accountId: string | undefined, state: AppState): string {
  if (!accountId) {
    return "Anyone";
  }

  if (accountId === UNASSIGNED_ASSIGNEE_ACCOUNT_ID) {
    return "Unassigned";
  }

  const options = getSelectedProjectFilterOptions(state.jiraProjects, state.selectedProjectKeys);
  return options.assignees.find((assignee) => assignee.accountId === accountId)?.displayName ?? "Anyone";
}
