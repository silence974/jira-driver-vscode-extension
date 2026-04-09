import * as vscode from "vscode";

import {
  DEFAULT_MAX_SNIPPETS,
  DEFAULT_SCORE_THRESHOLD,
} from "./constants";
import { JiraDriverSettings } from "./models";
import { normalizeSiteUrl } from "./utils/strings";

export function getSettings(): JiraDriverSettings {
  const config = vscode.workspace.getConfiguration("jiraDriver");

  return {
    siteUrl: normalizeSiteUrl(config.get<string>("siteUrl", "")),
    authEmail: config.get<string>("auth.email", "").trim(),
    defaultProjects: normalizeArray(config.get<string[]>("discovery.defaultProjects", [])),
    savedJqls: normalizeArray(config.get<string[]>("discovery.savedJqls", [])),
    aiBaseUrl: normalizeBaseUrl(config.get<string>("ai.baseUrl", "https://api.deepseek.com")),
    aiChatModel: config.get<string>("ai.chatModel", "deepseek-chat").trim(),
    aiEmbeddingModel: config.get<string>("ai.embeddingModel", "").trim() || undefined,
    aiIncludeCodeContext: config.get<boolean>("ai.includeCodeContext", true),
    aiMaxSnippetCount: Math.max(
      0,
      config.get<number>("ai.maxSnippetCount", DEFAULT_MAX_SNIPPETS),
    ),
    scoreThreshold: clamp(
      config.get<number>("workflow.scoreThreshold", DEFAULT_SCORE_THRESHOLD),
      0,
      100,
    ),
  };
}

function normalizeArray(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
