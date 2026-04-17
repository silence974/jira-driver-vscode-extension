import * as vscode from "vscode";

import { ConfluencePageSummary, ConfluenceSpaceSummary } from "../models";
import { ConfluenceExplorerService } from "../confluence/confluenceExplorerService";
import { JiraDriverStore } from "./stateStore";
import { truncate } from "../utils/strings";

type TreeNode = SpaceFilterNode | SearchGroupNode | SpaceNode | ConfluencePageNode | MessageNode;

class SpaceFilterNode {}

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

class MessageNode {
  public constructor(public readonly label: string) {}
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
    if (element instanceof SpaceFilterNode) {
      const item = new vscode.TreeItem("Space", vscode.TreeItemCollapsibleState.None);
      item.description = formatSelectedSpaceSummary(
        this.store.getState().confluenceSpaces,
        this.store.getState().selectedConfluenceSpaceKeys,
      );
      item.contextValue = "jiraDriver.confluenceSpaceFilter";
      item.iconPath = new vscode.ThemeIcon("folder-library");
      item.command = {
        command: "jiraDriver.pickConfluenceSpaceFilter",
        title: "Pick Confluence Space Filter",
      };
      return item;
    }

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

    if (element instanceof MessageNode) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = "jiraDriver.message";
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }

    if (element instanceof SpaceNode) {
      const item = new vscode.TreeItem(
        element.space.name,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.description = `${element.space.key} · ${formatSpaceCategoryLabel(element.space)}`;
      item.tooltip = new vscode.MarkdownString(
        `**${element.space.name}**\n\nSpace key: ${element.space.key}\n\nCategory: ${formatSpaceCategoryLabel(element.space)}`,
      );
      item.contextValue = "jiraDriver.confluenceSpace";
      item.iconPath = new vscode.ThemeIcon(
        element.space.category === "personal" ? "person" : "folder-library",
      );
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
      const rootNodes: TreeNode[] = [new SpaceFilterNode()];
      const selectedSpaces = getSelectedSpaces(
        this.store.getState().confluenceSpaces,
        this.store.getState().selectedConfluenceSpaceKeys,
      );

      if (!selectedSpaces.length) {
        return [...rootNodes, new MessageNode("Select one or more spaces to browse pages.")];
      }

      if (this.store.getState().confluenceSearchQuery) {
        return [...rootNodes, new SearchGroupNode()];
      }

      return [
        ...rootNodes,
        ...selectedSpaces.map((space) => new SpaceNode(space)),
      ];
    }

    if (element instanceof SearchGroupNode) {
      const searchResults = this.store.getState().confluenceSearchResults;
      return searchResults.length
        ? searchResults.map((page) => new ConfluencePageNode(page, "search"))
        : [new MessageNode("No pages match the current search.")];
    }

    if (element instanceof SpaceNode) {
      const pages = await this.explorerService.getRootPages(element.space);
      return pages.length
        ? pages.map((page) => new ConfluencePageNode(page, "browse"))
        : [new MessageNode("No root pages found in this space.")];
    }

    if (element instanceof ConfluencePageNode) {
      if (element.mode === "search") {
        return [];
      }

      const childPages = await this.explorerService.getChildPages(element.page);
      if (!childPages.length) {
        this.knownLeafPageIds.add(element.page.id);
        this.emitter.fire(element);
        return [];
      }

      return childPages.map((page) => new ConfluencePageNode(page, "browse"));
    }

    return [];
  }
}

function getSelectedSpaces(
  spaces: ConfluenceSpaceSummary[],
  selectedSpaceKeys: string[],
): ConfluenceSpaceSummary[] {
  const selectedKeys = new Set(selectedSpaceKeys);
  return spaces.filter((space) => selectedKeys.has(space.key));
}

function formatSelectedSpaceSummary(
  spaces: ConfluenceSpaceSummary[],
  selectedSpaceKeys: string[],
): string {
  if (!selectedSpaceKeys.length) {
    return "None";
  }

  const selectedSpaces = getSelectedSpaces(spaces, selectedSpaceKeys);
  if (selectedSpaces.length === 1) {
    return truncate(selectedSpaces[0].name, 24);
  }

  const preview = selectedSpaces
    .slice(0, 2)
    .map((space) => truncate(space.name, 14))
    .join(", ");
  return selectedSpaces.length > 2 ? `${preview} +${selectedSpaces.length - 2}` : preview;
}

function formatSpaceCategoryLabel(space: ConfluenceSpaceSummary): string {
  return space.category === "personal" ? "Personal" : "Project";
}
