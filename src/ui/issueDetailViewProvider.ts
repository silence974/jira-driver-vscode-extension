import * as crypto from "node:crypto";
import * as vscode from "vscode";

import { JiraDriverStore } from "./stateStore";
import { renderIssueDetailHtml } from "./detailHtml";

interface IssueDetailActions {
  signIn(): Promise<void>;
  refreshIssues(): Promise<void>;
  scoreIssue(): Promise<void>;
  requestMoreInfo(draft?: string): Promise<void>;
  prepareAiFix(): Promise<void>;
  setAiApiKey(): Promise<void>;
  copyPrompt(): Promise<void>;
  openPrompt(): Promise<void>;
}

export class IssueDetailViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  public constructor(
    private readonly store: JiraDriverStore,
    private readonly actions: IssueDetailActions,
  ) {
    this.store.onDidChangeState(() => this.render());
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.action) {
        case "signIn":
          await this.actions.signIn();
          break;
        case "refreshIssues":
          await this.actions.refreshIssues();
          break;
        case "scoreIssue":
          await this.actions.scoreIssue();
          break;
        case "requestMoreInfo":
          await this.actions.requestMoreInfo(message.draft);
          break;
        case "prepareAiFix":
          await this.actions.prepareAiFix();
          break;
        case "setAiApiKey":
          await this.actions.setAiApiKey();
          break;
        case "copyPrompt":
          await this.actions.copyPrompt();
          break;
        case "openPrompt":
          await this.actions.openPrompt();
          break;
        default:
          break;
      }
    });

    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }

    this.view.webview.html = renderIssueDetailHtml(
      this.store.getState(),
      crypto.randomBytes(16).toString("hex"),
    );
  }
}
