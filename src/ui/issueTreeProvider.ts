import * as vscode from "vscode";

import { IssueGroup, JiraIssueSummary } from "../models";
import { JiraDriverStore } from "./stateStore";

type TreeNode = IssueGroupNode | IssueNode;

class IssueGroupNode {
  public constructor(public readonly group: IssueGroup) {}
}

class IssueNode {
  public constructor(public readonly issue: JiraIssueSummary) {}
}

export class IssueTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  public readonly onDidChangeTreeData = this.emitter.event;

  public constructor(private readonly store: JiraDriverStore) {
    this.store.onDidChangeState(() => this.emitter.fire(undefined));
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element instanceof IssueGroupNode) {
      const item = new vscode.TreeItem(
        `${element.group.label} (${element.group.issues.length})`,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.contextValue = "jiraDriver.group";
      item.iconPath = new vscode.ThemeIcon("folder-library");
      return item;
    }

    const issue = element.issue;
    const item = new vscode.TreeItem(issue.key, vscode.TreeItemCollapsibleState.None);
    item.description = issue.summary;
    item.tooltip = new vscode.MarkdownString(
      `**${issue.key}**\n\n${issue.summary}\n\nStatus: ${issue.status}${issue.rankingReason ? `\n\nWhy recommended: ${issue.rankingReason}` : ""}`,
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

  public async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      return this.store.getState().groups.map((group) => new IssueGroupNode(group));
    }

    if (element instanceof IssueGroupNode) {
      return element.group.issues.map((issue) => new IssueNode(issue));
    }

    return [];
  }
}
