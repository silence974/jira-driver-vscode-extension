import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import { HandoffService } from "./ai/handoffService";
import { OpenAICompatibleClient } from "./ai/openAiCompatibleClient";
import { JiraAuthProvider } from "./auth/jiraAuthProvider";
import { ConfluenceClient } from "./confluence/confluenceClient";
import { ConfluenceExplorerService } from "./confluence/confluenceExplorerService";
import { ConfluenceMarkdownExportService } from "./confluence/confluenceMarkdownExportService";
import { getSettings } from "./config";
import { DiscoveryService } from "./discovery/discoveryService";
import {
  buildVisibleIssueList,
  collectSelectedProjectBrowseIssues,
  getSelectedProjectFilterOptions,
  sanitizeProjectFilters,
  UNASSIGNED_ASSIGNEE_ACCOUNT_ID,
} from "./discovery/projectIssueFilters";
import { JiraClient } from "./jira/jiraClient";
import { AppState } from "./models";
import { buildMoreInfoComment } from "./scoring/commentDraft";
import { LlmScorer, mergeScoringResults } from "./scoring/llmScorer";
import { scoreIssueByRules } from "./scoring/ruleScorer";
import { ConfluenceDetailViewProvider } from "./ui/confluenceDetailViewProvider";
import { ConfluenceTreeProvider } from "./ui/confluenceTreeProvider";
import { IssueDetailViewProvider } from "./ui/issueDetailViewProvider";
import {
  formatProjectSelectionSummary,
  IssueFilterKind,
  IssueTreeProvider,
} from "./ui/issueTreeProvider";
import { JiraDriverStore } from "./ui/stateStore";
import { WorkspaceContextCollector } from "./workspace/contextCollector";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Jira Driver");
  context.subscriptions.push(output);

  const store = new JiraDriverStore();
  const settingsProvider = () => getSettings();
  const aiClient = new OpenAICompatibleClient(settingsProvider, context.secrets, output);
  const authProvider = new JiraAuthProvider(context, settingsProvider, output);
  const jiraClient = new JiraClient(authProvider, output);
  const confluenceClient = new ConfluenceClient(authProvider, output);
  const confluenceExplorerService = new ConfluenceExplorerService(confluenceClient, settingsProvider);
  const confluenceMarkdownExportService = new ConfluenceMarkdownExportService();
  const workspaceContextCollector = new WorkspaceContextCollector();
  const discoveryService = new DiscoveryService(
    jiraClient,
    aiClient,
    workspaceContextCollector,
    settingsProvider,
    output,
  );
  const llmScorer = new LlmScorer(aiClient);
  const handoffService = new HandoffService();

  await authProvider.initialize();
  store.setSignedIn(Boolean(await authProvider.getSession()));

  const issueTreeProvider = new IssueTreeProvider(store);
  const issueDetailProvider = new IssueDetailViewProvider(store, {
    scoreIssue,
    requestMoreInfo,
    prepareAiFix,
    openPrompt,
  });
  const confluenceTreeProvider = new ConfluenceTreeProvider(store, confluenceExplorerService);
  const confluenceDetailProvider = new ConfluenceDetailViewProvider(store, {
    openSelectedConfluenceInBrowser,
    exportConfluenceMarkdown,
  });

  const issueTreeView = vscode.window.createTreeView("jiraDriver.issueExplorer", {
    treeDataProvider: issueTreeProvider,
    showCollapseAll: true,
  });
  const confluenceTreeView = vscode.window.createTreeView("jiraDriver.confluenceExplorer", {
    treeDataProvider: confluenceTreeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(
    issueTreeView,
    confluenceTreeView,
    vscode.window.registerWebviewViewProvider("jiraDriver.issueDetail", issueDetailProvider),
    vscode.window.registerWebviewViewProvider("jiraDriver.confluenceDetail", confluenceDetailProvider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("jiraDriver.signIn", signIn),
    vscode.commands.registerCommand("jiraDriver.signOut", signOut),
    vscode.commands.registerCommand("jiraDriver.refreshIssues", refreshIssues),
    vscode.commands.registerCommand("jiraDriver.searchIssues", searchIssues),
    vscode.commands.registerCommand("jiraDriver.refreshConfluence", refreshConfluence),
    vscode.commands.registerCommand("jiraDriver.searchConfluencePages", searchConfluencePages),
    vscode.commands.registerCommand("jiraDriver.pickConfluenceSpaceFilter", pickConfluenceSpaceFilter),
    vscode.commands.registerCommand("jiraDriver.openIssue", openIssue),
    vscode.commands.registerCommand("jiraDriver.openConfluencePage", openConfluencePage),
    vscode.commands.registerCommand("jiraDriver.exportConfluenceMarkdown", exportConfluenceMarkdown),
    vscode.commands.registerCommand("jiraDriver.scoreIssue", scoreIssue),
    vscode.commands.registerCommand("jiraDriver.requestMoreInfo", requestMoreInfo),
    vscode.commands.registerCommand("jiraDriver.prepareAiFix", prepareAiFix),
    vscode.commands.registerCommand("jiraDriver.setAiApiKey", setAiApiKey),
    vscode.commands.registerCommand("jiraDriver.pickIssueExplorerFilter", pickIssueExplorerFilter),
    vscode.commands.registerCommand("jiraDriver.copyPrompt", copyPrompt),
    vscode.commands.registerCommand("jiraDriver.openPrompt", openPrompt),
  );

  if (store.getState().signedIn) {
    void refreshIssues();
    void refreshConfluence();
  }

  async function signIn(): Promise<void> {
    await runAction("Signing in to Jira...", async () => {
      await ensureConnectionSettings();
      const session = await authProvider.signIn();
      store.setSignedIn(true);
      vscode.window.showInformationMessage(
        `Connected to ${session.accountDisplayName ?? session.email}.`,
      );
      await refreshIssues();
      void refreshConfluence();
    });
  }

  async function signOut(): Promise<void> {
    await runAction("Signing out from Jira...", async () => {
      await authProvider.signOut();
      store.reset();
    });
  }

  async function refreshIssues(): Promise<void> {
    await runAction("Refreshing Jira issues...", async () => {
      requireSignedIn();
      const { projects } = await discoveryService.refreshOverview();
      store.setIssueExplorerData(projects);
      store.setSignedIn(true);
    });
  }

  async function refreshConfluence(): Promise<void> {
    await runAction("Refreshing Confluence spaces...", async () => {
      requireSignedIn();
      const spaces = await confluenceExplorerService.refreshSpaces();
      store.setConfluenceSpaces(spaces);
    });
  }

  async function searchIssues(): Promise<void> {
    const projectKeys = store.getState().selectedProjectKeys;
    if (!projectKeys.length) {
      vscode.window.showWarningMessage("Select one or more Jira projects first.");
      return;
    }

    await ensureSelectedProjectsLoaded(projectKeys);
    const filters = store.getState().issueExplorerFilters;
    const query = await vscode.window.showInputBox({
      title: `Search ${formatProjectSelectionSummary(store.getState())} Issues`,
      prompt: "Enter keywords for Jira issue search. Submit an empty value to clear the current search.",
      ignoreFocusOut: true,
      value: filters.query ?? "",
    });

    if (query === undefined) {
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      store.setIssueSearchResults(undefined);
      return;
    }

    await runAction(`Searching ${projectKeys.join(", ")} issues...`, async () => {
      requireSignedIn();
      const result = await discoveryService.search(trimmedQuery, projectKeys);
      store.setIssueSearchResults(trimmedQuery, result.issues);
    });
  }

  async function searchConfluencePages(): Promise<void> {
    const selectedSpaceKeys = store.getState().selectedConfluenceSpaceKeys;
    if (!selectedSpaceKeys.length) {
      vscode.window.showWarningMessage("Select one or more Confluence spaces first.");
      return;
    }

    const query = await vscode.window.showInputBox({
      title: "Search Confluence Pages",
      prompt: "Enter a keyword or phrase to search across the selected Confluence spaces. Submit an empty value to clear the current search.",
      ignoreFocusOut: true,
      value: store.getState().confluenceSearchQuery ?? "",
    });

    if (query === undefined) {
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      store.setConfluenceSearchResults(undefined, []);
      return;
    }

    await runAction("Searching Confluence pages...", async () => {
      requireSignedIn();
      const pages = await confluenceClient.searchPages(
        trimmedQuery,
        selectedSpaceKeys,
      );
      store.setConfluenceSearchResults(trimmedQuery, pages);
    });
  }

  async function pickConfluenceSpaceFilter(): Promise<void> {
    const selection = await vscode.window.showQuickPick(
      buildConfluenceSpaceQuickPickItems(
        store.getState().confluenceSpaces,
        store.getState().selectedConfluenceSpaceKeys,
      ),
      {
        title: "Select Confluence Spaces",
        ignoreFocusOut: true,
        canPickMany: true,
      },
    );

    if (!selection) {
      return;
    }

    store.setSelectedConfluenceSpaces(
      selection
        .map((item) => item.value)
        .filter((value): value is string => Boolean(value)),
    );
    store.setConfluenceSearchResults(undefined, []);
  }

  async function openIssue(issueKey?: string): Promise<void> {
    const key = issueKey ?? store.getState().selectedIssue?.key;
    if (!key) {
      vscode.window.showWarningMessage("Select a Jira issue first.");
      return;
    }

    await runAction(`Loading ${key}...`, async () => {
      requireSignedIn();
      const issue = await jiraClient.getIssue(key);
      store.setSelectedIssue(issue);
    });
  }

  async function openConfluencePage(pageId?: string): Promise<void> {
    const id = pageId ?? store.getState().selectedConfluencePage?.id;
    if (!id) {
      vscode.window.showWarningMessage("Select a Confluence page first.");
      return;
    }

    await runAction("Loading Confluence page...", async () => {
      requireSignedIn();
      const page = await confluenceClient.getPage(id);
      store.setSelectedConfluencePage(page);
    });
  }

  async function exportConfluenceMarkdown(target?: unknown): Promise<void> {
    await runAction("Exporting Confluence page as Markdown...", async () => {
      requireSignedIn();
      const page = await getOrLoadSelectedConfluencePage(resolveConfluencePageId(target));
      const defaultUri = buildDefaultConfluenceMarkdownUri(
        page.spaceKey,
        confluenceMarkdownExportService.buildSuggestedFileName(page),
      );
      const destination = await vscode.window.showSaveDialog({
        title: "Export Confluence Page as Markdown",
        defaultUri,
        filters: {
          Markdown: ["md"],
        },
        saveLabel: "Export Markdown",
      });

      if (!destination) {
        return;
      }

      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(destination.fsPath)));
      const markdown = confluenceMarkdownExportService.buildMarkdown(page);
      await vscode.workspace.fs.writeFile(destination, Buffer.from(markdown, "utf8"));

      void vscode.window.showInformationMessage(
        `Exported ${page.title} to ${destination.fsPath}.`,
        "Open File",
        "Reveal in Explorer",
      ).then(async (followUp) => {
        if (followUp === "Open File") {
          const document = await vscode.workspace.openTextDocument(destination);
          await vscode.window.showTextDocument(document, { preview: false });
        } else if (followUp === "Reveal in Explorer") {
          await vscode.commands.executeCommand("revealFileInOS", destination);
        }
      });
    });
  }

  async function scoreIssue(): Promise<void> {
    await runAction("Scoring Jira issue...", async () => {
      requireSignedIn();
      const issue = await getOrLoadSelectedIssue();
      const workspaceContext = await workspaceContextCollector.collect(getSettings());
      const ruleScore = scoreIssueByRules(issue);
      const semanticScore = await llmScorer.scoreIssue(issue, workspaceContext);
      const merged = mergeScoringResults(ruleScore, semanticScore, getSettings().scoreThreshold);
      store.setScoring(merged);
      store.setCommentDraft(merged.passesThreshold ? undefined : buildMoreInfoComment(issue, merged));
    });
  }

  async function requestMoreInfo(draft?: string): Promise<void> {
    await runAction("Posting Jira comment...", async () => {
      requireSignedIn();
      const issue = await getOrLoadSelectedIssue();
      let scoring = store.getState().selectedIssueScore;
      if (!scoring) {
        const workspaceContext = await workspaceContextCollector.collect(getSettings());
        scoring = mergeScoringResults(
          scoreIssueByRules(issue),
          await llmScorer.scoreIssue(issue, workspaceContext),
          getSettings().scoreThreshold,
        );
        store.setScoring(scoring);
      }

      const commentDraft = draft?.trim() || store.getState().commentDraft || buildMoreInfoComment(issue, scoring);
      const confirmed = await vscode.window.showWarningMessage(
        `Post this follow-up comment to ${issue.key}?`,
        { modal: true },
        "Post Comment",
      );

      if (confirmed !== "Post Comment") {
        return;
      }

      await jiraClient.addComment(issue.key, commentDraft);
      store.setCommentDraft(commentDraft);
      const refreshedIssue = await jiraClient.getIssue(issue.key);
      store.setSelectedIssue(refreshedIssue);
      vscode.window.showInformationMessage(`Posted comment to ${issue.key}.`);
    });
  }

  async function prepareAiFix(): Promise<void> {
    await runAction("Preparing AI handoff...", async () => {
      requireSignedIn();
      const issue = await getOrLoadSelectedIssue();
      let scoring = store.getState().selectedIssueScore;
      if (!scoring) {
        const workspaceContextForScoring = await workspaceContextCollector.collect(getSettings());
        scoring = mergeScoringResults(
          scoreIssueByRules(issue),
          await llmScorer.scoreIssue(issue, workspaceContextForScoring),
          getSettings().scoreThreshold,
        );
        store.setScoring(scoring);
      }

      if (!scoring.passesThreshold) {
        store.setCommentDraft(buildMoreInfoComment(issue, scoring));
        throw new Error(`Issue score ${scoring.totalScore} is below the threshold ${scoring.threshold}.`);
      }

      const workspaceContext = await workspaceContextCollector.collect(getSettings());
      const artifacts = await handoffService.prepare(issue, scoring, workspaceContext);
      store.setHandoffArtifacts(artifacts);
      await vscode.env.clipboard.writeText(artifacts.promptText);
      vscode.window.showInformationMessage(`AI handoff generated for ${issue.key}. Prompt copied to clipboard.`);
    });
  }

  async function setAiApiKey(): Promise<void> {
    const value = await vscode.window.showInputBox({
      title: "Set AI API Key",
      prompt: "Enter the OpenAI-compatible API key used for reranking and semantic scoring.",
      password: true,
      ignoreFocusOut: true,
    });

    if (!value?.trim()) {
      return;
    }

    await aiClient.setApiKey(value);
    vscode.window.showInformationMessage("Jira Driver AI API key saved.");
  }

  async function copyPrompt(): Promise<void> {
    const prompt = store.getState().handoffArtifacts?.promptText;
    if (!prompt) {
      vscode.window.showWarningMessage("Prepare AI Fix first.");
      return;
    }

    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage("AI handoff prompt copied to clipboard.");
  }

  async function openPrompt(): Promise<void> {
    const promptPath = store.getState().handoffArtifacts?.promptPath;
    if (!promptPath) {
      vscode.window.showWarningMessage("Prepare AI Fix first.");
      return;
    }

    const document = await vscode.workspace.openTextDocument(promptPath);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  async function openSelectedConfluenceInBrowser(): Promise<void> {
    const url = store.getState().selectedConfluencePage?.url;
    if (!url) {
      vscode.window.showWarningMessage("Select a Confluence page first.");
      return;
    }

    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  async function pickIssueExplorerFilter(
    filterKind: IssueFilterKind,
  ): Promise<void> {
    if (filterKind === "project") {
      const selection = await vscode.window.showQuickPick(
        store.getState().jiraProjects.map((project) => ({
          label: project.project.name,
          description: project.project.key,
          picked: store.getState().selectedProjectKeys.includes(project.project.key),
          value: project.project.key,
        })),
        {
          title: "Select Jira Projects",
          ignoreFocusOut: true,
          canPickMany: true,
        },
      );

      if (!selection) {
        return;
      }

      const selectedProjectKeys = selection.map((item) => item.value);
      store.setSelectedProjects(selectedProjectKeys);
      store.setIssueExplorerFilters({
        issueType: undefined,
        status: undefined,
        assigneeAccountId: undefined,
        query: undefined,
      });
      store.setIssueSearchResults(undefined);

      if (!selectedProjectKeys.length) {
        return;
      }

      await runAction("Loading selected Jira projects...", async () => {
        requireSignedIn();
        await ensureSelectedProjectsLoaded(selectedProjectKeys);
      });
      return;
    }

    const selectedProjectKeys = store.getState().selectedProjectKeys;
    if (!selectedProjectKeys.length) {
      vscode.window.showWarningMessage("Select one or more Jira projects first.");
      return;
    }

    await ensureSelectedProjectsLoaded(selectedProjectKeys);
    const selection = await vscode.window.showQuickPick(
      buildExplorerFilterQuickPickItems(store.getState(), filterKind),
      {
        title: `${formatProjectSelectionSummary(store.getState())} · ${getExplorerFilterTitle(filterKind)}`,
        ignoreFocusOut: true,
      },
    );

    if (!selection) {
      return;
    }

    switch (filterKind) {
      case "issueType":
        store.setIssueExplorerFilters({ issueType: selection.value || undefined });
        break;
      case "status":
        store.setIssueExplorerFilters({ status: selection.value || undefined });
        break;
      case "assignee":
        store.setIssueExplorerFilters({ assigneeAccountId: selection.value || undefined });
        break;
    }
  }

  async function getOrLoadSelectedIssue() {
    const selectedIssue = store.getState().selectedIssue;
    if (selectedIssue) {
      return selectedIssue;
    }

    const firstIssue = getVisibleIssues(store.getState())[0];
    if (!firstIssue) {
      throw new Error("No Jira issue is selected.");
    }

    const issue = await jiraClient.getIssue(firstIssue.key);
    store.setSelectedIssue(issue);
    return issue;
  }

  async function getOrLoadSelectedConfluencePage(pageId?: string) {
    const selectedPage = store.getState().selectedConfluencePage;
    if (selectedPage && (!pageId || selectedPage.id === pageId)) {
      return selectedPage;
    }

    const id = pageId ?? selectedPage?.id ?? store.getState().confluenceSearchResults[0]?.id;
    if (!id) {
      throw new Error("No Confluence page is selected.");
    }

    const page = await confluenceClient.getPage(id);
    store.setSelectedConfluencePage(page);
    return page;
  }

  function requireSignedIn(): void {
    if (!store.getState().signedIn) {
      throw new Error("Sign in to Jira first.");
    }
  }

  async function ensureConnectionSettings(): Promise<void> {
    let settings = getSettings();
    const config = vscode.workspace.getConfiguration("jiraDriver");
    const configTarget = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;

    if (!settings.siteUrl) {
      const siteUrl = await vscode.window.showInputBox({
        title: "Configure Jira Site URL",
        prompt: "Enter your Atlassian Cloud site URL.",
        placeHolder: "https://your-domain.atlassian.net",
        ignoreFocusOut: true,
      });

      if (!siteUrl?.trim()) {
        throw new Error("Missing jiraDriver.siteUrl setting.");
      }

      await config.update("siteUrl", siteUrl.trim(), configTarget);
    }

    settings = getSettings();
    if (!settings.authEmail) {
      const authEmail = await vscode.window.showInputBox({
        title: "Configure Jira Email",
        prompt: "Enter the email address used with your Atlassian Cloud API token/API key.",
        ignoreFocusOut: true,
      });

      if (!authEmail?.trim()) {
        throw new Error("Missing jiraDriver.auth.email setting.");
      }

      await config.update("auth.email", authEmail.trim(), configTarget);
    }
  }

  function buildDefaultConfluenceMarkdownUri(
    spaceKey: string | undefined,
    fileName: string,
  ): vscode.Uri {
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (workspaceUri) {
      return vscode.Uri.joinPath(
        workspaceUri,
        ".jira-driver",
        "confluence",
        (spaceKey ?? "pages").toLowerCase(),
        fileName,
      );
    }

    return vscode.Uri.joinPath(vscode.Uri.file(os.homedir()), fileName);
  }

  function resolveConfluencePageId(target?: unknown): string | undefined {
    if (typeof target === "string") {
      return target;
    }

    if (!target || typeof target !== "object") {
      return undefined;
    }

    const candidate = target as {
      id?: unknown;
      page?: {
        id?: unknown;
      };
    };

    if (typeof candidate.id === "string") {
      return candidate.id;
    }

    if (typeof candidate.page?.id === "string") {
      return candidate.page.id;
    }

    return undefined;
  }

  async function runAction(title: string, action: () => Promise<void>): Promise<void> {
    store.setBusyMessage(title);
    store.setError(undefined);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title,
        },
        action,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(message);
      store.setError(message);
      vscode.window.showErrorMessage(message);
    } finally {
      store.setBusyMessage(undefined);
    }
  }

  async function ensureProjectLoaded(projectKey: string): Promise<void> {
    const projectState = store.getProject(projectKey);
    if (projectState?.isLoaded) {
      return;
    }

    requireSignedIn();
    const issues = await discoveryService.loadProjectIssues(projectKey);
    store.setProjectBrowseIssues(projectKey, issues);
  }

  async function ensureSelectedProjectsLoaded(projectKeys: string[]): Promise<void> {
    for (const projectKey of projectKeys) {
      await ensureProjectLoaded(projectKey);
    }
  }
}

export function deactivate(): void {}

function buildExplorerFilterQuickPickItems(
  state: AppState,
  filterKind: Exclude<IssueFilterKind, "project">,
): Array<vscode.QuickPickItem & { value: string }> {
  const { assignees, issueTypes, statuses } = getExplorerFilterOptions(state);
  switch (filterKind) {
    case "issueType":
      return [
        { label: "All Types", value: "" },
        ...issueTypes.map((issueType) => ({
          label: issueType,
          value: issueType,
        })),
      ];
    case "status":
      return [
        { label: "All Statuses", value: "" },
        ...statuses.map((status) => ({
          label: status,
          value: status,
        })),
      ];
    case "assignee":
      return [
        { label: "Anyone", value: "" },
        ...assignees.map((assignee) => ({
          label: assignee.displayName,
          value: assignee.accountId,
          description: assignee.accountId === UNASSIGNED_ASSIGNEE_ACCOUNT_ID ? "No assignee" : undefined,
        })),
      ];
  }
}

function getExplorerFilterTitle(filterKind: Exclude<IssueFilterKind, "project">): string {
  switch (filterKind) {
    case "issueType":
      return "Filter by Type";
    case "status":
      return "Filter by Status";
    case "assignee":
      return "Filter by Assignee";
  }
}

function getExplorerFilterOptions(state: AppState) {
  return getSelectedProjectFilterOptions(state.jiraProjects, state.selectedProjectKeys);
}

function getVisibleIssues(state: AppState) {
  const browseIssues = collectSelectedProjectBrowseIssues(state.jiraProjects, state.selectedProjectKeys);
  const options = getExplorerFilterOptions(state);
  const filters = sanitizeProjectFilters(
    state.issueExplorerFilters,
    options.assignees,
    options.issueTypes,
    options.statuses,
  );

  return buildVisibleIssueList(browseIssues, filters, state.issueSearchResults);
}

function buildConfluenceSpaceQuickPickItems(
  spaces: AppState["confluenceSpaces"],
  selectedSpaceKeys: string[],
): Array<(vscode.QuickPickItem & { value?: string })> {
  const projectSpaces = spaces.filter((space) => space.category === "project");
  const personalSpaces = spaces.filter((space) => space.category === "personal");
  const items: Array<(vscode.QuickPickItem & { value?: string })> = [];

  if (projectSpaces.length) {
    items.push({
      label: "Project Spaces",
      kind: vscode.QuickPickItemKind.Separator,
    });
    items.push(...projectSpaces.map((space) => ({
      label: space.name,
      description: space.key,
      detail: space.type && space.type !== "global" ? space.type : "Shared space",
      picked: selectedSpaceKeys.includes(space.key),
      value: space.key,
    })));
  }

  if (personalSpaces.length) {
    items.push({
      label: "Personal Spaces",
      kind: vscode.QuickPickItemKind.Separator,
    });
    items.push(...personalSpaces.map((space) => ({
      label: space.name,
      description: space.key,
      detail: "Personal space",
      picked: selectedSpaceKeys.includes(space.key),
      value: space.key,
    })));
  }

  return items;
}
