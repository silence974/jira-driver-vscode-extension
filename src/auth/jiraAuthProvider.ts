import * as vscode from "vscode";

import {
  AUTH_SESSION_SECRET_KEY,
  EXTENSION_CONTEXT_SIGNED_IN,
  JIRA_API_TOKEN_SECRET_KEY,
} from "../constants";
import { JiraAuthSession, JiraDriverSettings } from "../models";
import { buildBasicAuthorizationHeader } from "./basic";

export interface OutputLogger {
  appendLine(value: string): void;
}

export class JiraAuthProvider implements vscode.Disposable {
  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getSettings: () => JiraDriverSettings,
    private readonly logger?: OutputLogger,
  ) {}

  public dispose(): void {}

  public async initialize(): Promise<void> {
    const signedIn = Boolean((await this.getSession()) && (await this.getApiToken()));
    await vscode.commands.executeCommand("setContext", EXTENSION_CONTEXT_SIGNED_IN, signedIn);
  }

  public async signIn(): Promise<JiraAuthSession> {
    const settings = this.getSettings();
    this.ensureConfigured(settings);

    let apiToken = await this.getApiToken();
    if (!apiToken) {
      apiToken = await this.promptForApiToken();
    }

    try {
      const session = await this.verifyAndCreateSession(settings.siteUrl, settings.authEmail, apiToken);
      await this.context.secrets.store(JIRA_API_TOKEN_SECRET_KEY, apiToken);
      await this.storeSession(session);
      return session;
    } catch (error) {
      this.logger?.appendLine(`Stored Jira API token failed: ${String(error)}`);
      apiToken = await this.promptForApiToken(true);
      const session = await this.verifyAndCreateSession(settings.siteUrl, settings.authEmail, apiToken);
      await this.context.secrets.store(JIRA_API_TOKEN_SECRET_KEY, apiToken);
      await this.storeSession(session);
      return session;
    }
  }

  public async signOut(): Promise<void> {
    await Promise.all([
      this.context.secrets.delete(AUTH_SESSION_SECRET_KEY),
      this.context.secrets.delete(JIRA_API_TOKEN_SECRET_KEY),
    ]);
    await vscode.commands.executeCommand("setContext", EXTENSION_CONTEXT_SIGNED_IN, false);
  }

  public async getSession(): Promise<JiraAuthSession | undefined> {
    const raw = await this.context.secrets.get(AUTH_SESSION_SECRET_KEY);
    if (!raw) {
      return undefined;
    }

    return JSON.parse(raw) as JiraAuthSession;
  }

  public async getAuthorizationHeader(): Promise<string> {
    const session = await this.ensureSession();
    const apiToken = await this.getApiToken();
    if (!apiToken) {
      throw new Error("Missing Jira API token. Sign in again to update the stored credential.");
    }

    return buildBasicAuthorizationHeader(session.email, apiToken);
  }

  public async getSiteUrl(): Promise<string> {
    return (await this.ensureSession()).siteUrl;
  }

  private async ensureSession(): Promise<JiraAuthSession> {
    const session = await this.getSession();
    if (!session) {
      throw new Error("Not signed in to Jira. Run 'Jira Driver: Sign In' first.");
    }

    return session;
  }

  private async getApiToken(): Promise<string | undefined> {
    return this.context.secrets.get(JIRA_API_TOKEN_SECRET_KEY);
  }

  private async promptForApiToken(isRetry = false): Promise<string> {
    const apiToken = await vscode.window.showInputBox({
      title: isRetry ? "Update Jira API Token" : "Configure Jira API Token",
      prompt: "Enter your Jira Cloud API token/API key for REST access.",
      password: true,
      ignoreFocusOut: true,
    });

    if (!apiToken?.trim()) {
      throw new Error("Missing Jira API token.");
    }

    return apiToken.trim();
  }

  private async verifyAndCreateSession(
    siteUrl: string,
    email: string,
    apiToken: string,
  ): Promise<JiraAuthSession> {
    const response = await fetch(`${siteUrl}/rest/api/3/myself`, {
      headers: {
        Authorization: buildBasicAuthorizationHeader(email, apiToken),
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger?.appendLine(`Jira sign-in failed: ${response.status} ${body}`);
      throw new Error(`Jira sign-in failed: ${response.status} ${body}`);
    }

    const profile = (await response.json()) as { accountId?: string; displayName?: string };
    return {
      siteUrl,
      email,
      accountId: profile.accountId,
      accountDisplayName: profile.displayName,
    };
  }

  private async storeSession(session: JiraAuthSession): Promise<void> {
    await this.context.secrets.store(AUTH_SESSION_SECRET_KEY, JSON.stringify(session));
    await vscode.commands.executeCommand("setContext", EXTENSION_CONTEXT_SIGNED_IN, true);
  }

  private ensureConfigured(settings: JiraDriverSettings): void {
    if (!settings.siteUrl) {
      throw new Error("Missing jiraDriver.siteUrl setting.");
    }

    if (!settings.authEmail) {
      throw new Error("Missing jiraDriver.auth.email setting.");
    }
  }
}
