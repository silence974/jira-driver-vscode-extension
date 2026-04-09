import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

import { JiraDriverSettings, WorkspaceContext } from "../models";
import { runGitCommand } from "../utils/git";
import { uniqueNonEmpty } from "../utils/strings";

export class WorkspaceContextCollector {
  public async collect(settings: JiraDriverSettings): Promise<WorkspaceContext> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error("Jira Driver requires an open workspace folder.");
    }

    const workspaceRoot = folder.uri.fsPath;
    const repoName = path.basename(workspaceRoot);
    const readmeExcerpt = await this.readReadmeExcerpt(workspaceRoot);
    const currentBranch = await this.safeGit(workspaceRoot, ["branch", "--show-current"]);
    const recentDiffFiles = uniqueNonEmpty(
      (await this.safeGit(workspaceRoot, ["diff", "--name-only", "HEAD"]))
        .split(/\n+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ).slice(0, 10);
    const codeSnippets = settings.aiIncludeCodeContext
      ? await this.captureEditorSnippets(settings.aiMaxSnippetCount)
      : [];
    const searchTerms = uniqueNonEmpty([
      repoName,
      currentBranch,
      ...recentDiffFiles.map((file) => path.basename(file, path.extname(file))),
    ]);

    return {
      workspaceRoot,
      repoName,
      readmeExcerpt,
      currentBranch: currentBranch || undefined,
      recentDiffFiles,
      activeFile: vscode.window.activeTextEditor?.document.uri.fsPath,
      codeSnippets,
      searchTerms,
    };
  }

  private async readReadmeExcerpt(workspaceRoot: string): Promise<string> {
    const candidates = ["README.md", "Readme.md", "readme.md"];

    for (const candidate of candidates) {
      const candidatePath = path.join(workspaceRoot, candidate);
      try {
        const content = await fs.readFile(candidatePath, "utf8");
        return extractFirstTwoSections(content);
      } catch {
        continue;
      }
    }

    return "";
  }

  private async captureEditorSnippets(maxCount: number): Promise<WorkspaceContext["codeSnippets"]> {
    if (!maxCount) {
      return [];
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [];
    }

    const document = editor.document;
    const snippets: WorkspaceContext["codeSnippets"] = [];

    if (!editor.selection.isEmpty) {
      snippets.push({
        path: vscode.workspace.asRelativePath(document.uri),
        language: document.languageId,
        content: document.getText(editor.selection).slice(0, 3000),
        source: "selection",
      });
    } else {
      const anchorLine = editor.selection.active.line;
      const startLine = Math.max(0, anchorLine - 12);
      const endLine = Math.min(document.lineCount - 1, anchorLine + 12);
      const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
      snippets.push({
        path: vscode.workspace.asRelativePath(document.uri),
        language: document.languageId,
        content: document.getText(range).slice(0, 3000),
        source: "cursor",
      });
    }

    return snippets.slice(0, maxCount);
  }

  private async safeGit(workspaceRoot: string, args: string[]): Promise<string> {
    try {
      return await runGitCommand(args, workspaceRoot);
    } catch {
      return "";
    }
  }
}

function extractFirstTwoSections(markdown: string): string {
  const sections = markdown
    .split(/^##\s+/m)
    .slice(0, 3)
    .join("## ")
    .trim();

  return sections.slice(0, 4000);
}
