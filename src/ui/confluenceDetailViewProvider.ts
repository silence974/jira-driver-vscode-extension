import * as crypto from "node:crypto";
import * as vscode from "vscode";

import { JiraDriverStore } from "./stateStore";
import { renderConfluenceDetailHtml } from "./confluenceDetailHtml";

interface ConfluenceDetailActions {
  openSelectedConfluenceInBrowser(): Promise<void>;
  exportConfluenceMarkdown(): Promise<void>;
}

export class ConfluenceDetailViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  public constructor(
    private readonly store: JiraDriverStore,
    private readonly actions: ConfluenceDetailActions,
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
        case "openSelectedConfluenceInBrowser":
          await this.actions.openSelectedConfluenceInBrowser();
          break;
        case "exportConfluenceMarkdown":
          await this.actions.exportConfluenceMarkdown();
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

    this.view.webview.html = renderConfluenceDetailHtml(
      this.store.getState(),
      crypto.randomBytes(16).toString("hex"),
    );
  }
}
