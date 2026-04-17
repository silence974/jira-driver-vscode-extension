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
import { JiraClient } from "./jira/jiraClient";
import { buildMoreInfoComment } from "./scoring/commentDraft";
import { LlmScorer, mergeScoringResults } from "./scoring/llmScorer";
import { scoreIssueByRules } from "./scoring/ruleScorer";
import { ConfluenceDetailViewProvider } from "./ui/confluenceDetailViewProvider";
import { ConfluenceTreeProvider } from "./ui/confluenceTreeProvider";
import { IssueDetailViewProvider } from "./ui/issueDetailViewProvider";
import { IssueTreeProvider } from "./ui/issueTreeProvider";
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
    signIn,
    refreshIssues,
    scoreIssue,
    requestMoreInfo,
    prepareAiFix,
    setAiApiKey,
    copyPrompt,
    openPrompt,
  });
  const confluenceTreeProvider = new ConfluenceTreeProvider(store, confluenceExplorerService);
  const confluenceDetailProvider = new ConfluenceDetailViewProvider(store, {
    signIn,
    refreshConfluence,
    searchConfluencePages,
    openSelectedConfluenceInBrowser,
    exportConfluenceMarkdown,
  });

  context.subscriptions.push(
    vscode.window.createTreeView("jiraDriver.issueExplorer", {
      treeDataProvider: issueTreeProvider,
      showCollapseAll: true,
    }),
    vscode.window.createTreeView("jiraDriver.confluenceExplorer", {
      treeDataProvider: confluenceTreeProvider,
      showCollapseAll: true,
    }),
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
    vscode.commands.registerCommand("jiraDriver.openIssue", openIssue),
    vscode.commands.registerCommand("jiraDriver.openConfluencePage", openConfluencePage),
    vscode.commands.registerCommand("jiraDriver.exportConfluenceMarkdown", exportConfluenceMarkdown),
    vscode.commands.registerCommand("jiraDriver.scoreIssue", scoreIssue),
    vscode.commands.registerCommand("jiraDriver.requestMoreInfo", requestMoreInfo),
    vscode.commands.registerCommand("jiraDriver.prepareAiFix", prepareAiFix),
    vscode.commands.registerCommand("jiraDriver.setAiApiKey", setAiApiKey),
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
      const { groups } = await discoveryService.refreshOverview();
      store.setGroups(groups);
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
    const query = await vscode.window.showInputBox({
      title: "Search Jira Issues",
      prompt: "Enter a keyword query for Jira issue search and reranking.",
      ignoreFocusOut: true,
    });

    if (!query?.trim()) {
      return;
    }

    await runAction("Searching Jira issues...", async () => {
      requireSignedIn();
      const result = await discoveryService.search(query.trim());
      store.setSearchResults(result.issues);
    });
  }

  async function searchConfluencePages(): Promise<void> {
    const query = await vscode.window.showInputBox({
      title: "Search Confluence Pages",
      prompt: "Enter a keyword or phrase to search across Confluence pages.",
      ignoreFocusOut: true,
    });

    if (!query?.trim()) {
      return;
    }

    await runAction("Searching Confluence pages...", async () => {
      requireSignedIn();
      const pages = await confluenceClient.searchPages(
        query.trim(),
        getSettings().confluenceSpaceKeys,
      );
      store.setConfluenceSearchResults(query.trim(), pages);
    });
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

  async function getOrLoadSelectedIssue() {
    const selectedIssue = store.getState().selectedIssue;
    if (selectedIssue) {
      return selectedIssue;
    }

    const firstIssue = store.getState().groups.flatMap((group) => group.issues)[0];
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
}

export function deactivate(): void {}
