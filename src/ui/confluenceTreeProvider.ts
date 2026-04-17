import * as vscode from "vscode";

import { ConfluencePageSummary, ConfluenceSpaceSummary } from "../models";
import { ConfluenceExplorerService } from "../confluence/confluenceExplorerService";
import { JiraDriverStore } from "./stateStore";

type TreeNode = SearchGroupNode | SpaceNode | ConfluencePageNode;

class SearchGroupNode {}

class SpaceNode {
  public constructor(public readonly space: ConfluenceSpaceSummary) {}
}

class ConfluencePageNode {
  public constructor(
    public readonly page: ConfluencePageSummary,
    public readonly mode: "browse" | "search",
  ) {}
}

export class ConfluenceTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  public readonly onDidChangeTreeData = this.emitter.event;

  private readonly knownLeafPageIds = new Set<string>();

  public constructor(
    private readonly store: JiraDriverStore,
    private readonly explorerService: ConfluenceExplorerService,
  ) {
    this.store.onDidChangeState(() => this.emitter.fire(undefined));
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element instanceof SearchGroupNode) {
      const results = this.store.getState().confluenceSearchResults;
      const item = new vscode.TreeItem(
        `Search Results (${results.length})`,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.contextValue = "jiraDriver.confluenceSearchGroup";
      item.iconPath = new vscode.ThemeIcon("search");
      return item;
    }

    if (element instanceof SpaceNode) {
      const item = new vscode.TreeItem(
        element.space.name,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.description = element.space.key;
      item.tooltip = new vscode.MarkdownString(
        `**${element.space.name}**\n\nSpace key: ${element.space.key}`,
      );
      item.contextValue = "jiraDriver.confluenceSpace";
      item.iconPath = new vscode.ThemeIcon("folder-library");
      return item;
    }

    const page = element.page;
    const item = new vscode.TreeItem(
      page.title,
      element.mode === "search" || this.knownLeafPageIds.has(page.id)
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.description = element.mode === "search" ? page.spaceKey ?? page.spaceName : undefined;
    item.tooltip = new vscode.MarkdownString(
      [
        `**${page.title}**`,
        page.spaceName ? `\n\nSpace: ${page.spaceName}` : "",
        page.excerpt ? `\n\n${page.excerpt}` : "",
      ].join(""),
    );
    item.contextValue = "jiraDriver.confluencePage";
    item.iconPath = new vscode.ThemeIcon("book");
    item.command = {
      command: "jiraDriver.openConfluencePage",
      title: "Open Confluence Page",
      arguments: [page.id],
    };
    return item;
  }

  public async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      const rootNodes: TreeNode[] = [];
      if (this.store.getState().confluenceSearchQuery) {
        rootNodes.push(new SearchGroupNode());
      }

      rootNodes.push(
        ...this.store.getState().confluenceSpaces.map((space) => new SpaceNode(space)),
      );
      return rootNodes;
    }

    if (element instanceof SearchGroupNode) {
      return this.store.getState().confluenceSearchResults.map(
        (page) => new ConfluencePageNode(page, "search"),
      );
    }

    if (element instanceof SpaceNode) {
      return (await this.explorerService.getRootPages(element.space)).map(
        (page) => new ConfluencePageNode(page, "browse"),
      );
    }

    if (element.mode === "search") {
      return [];
    }

    const childPages = await this.explorerService.getChildPages(element.page);
    if (!childPages.length) {
      this.knownLeafPageIds.add(element.page.id);
      this.emitter.fire(element);
    }

    return childPages.map((page) => new ConfluencePageNode(page, "browse"));
  }
}
