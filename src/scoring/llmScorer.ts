import {
  IssueScoringResult,
  JiraIssueDetail,
  RuleScoreResult,
  SemanticScoreResult,
  WorkspaceContext,
} from "../models";
import { parseJsonObject } from "../utils/json";
import { OpenAICompatibleClient } from "../ai/openAiCompatibleClient";

export class LlmScorer {
  public constructor(private readonly aiClient: OpenAICompatibleClient) {}

  public async scoreIssue(
    issue: JiraIssueDetail,
    workspaceContext: WorkspaceContext,
  ): Promise<SemanticScoreResult> {
    if (!(await this.aiClient.isConfigured())) {
      return createDefaultSemanticResult();
    }

    const systemPrompt = [
      "You score Jira issue quality for an AI-driven engineering workflow.",
      "Return only JSON.",
      "The JSON schema is:",
      "{\"semantic_delta\": number, \"missing_info\": string[], \"suggested_questions\": string[], \"confidence\": number, \"summary\": string}",
      "semantic_delta must be between -15 and 15.",
      "confidence must be between 0 and 1.",
      "Focus on missing technical detail, clarity, ambiguity, acceptance criteria, and implementation readiness.",
    ].join("\n");

    const userPrompt = JSON.stringify(
      {
        issue: {
          key: issue.key,
          summary: issue.summary,
          description: issue.descriptionText,
          comments: issue.comments.map((comment) => ({
            author: comment.authorDisplayName,
            body: comment.bodyText,
          })),
          attachments: issue.attachments.map((attachment) => attachment.filename),
        },
        workspaceContext,
      },
      null,
      2,
    );

    const response = await this.aiClient.chat(systemPrompt, userPrompt);
    return parseSemanticScoringResponse(response);
  }
}

export function parseSemanticScoringResponse(raw: string): SemanticScoreResult {
  return normalizeSemanticScoreResult(parseJsonObject<unknown>(raw));
}

export function normalizeSemanticScoreResult(raw: unknown): SemanticScoreResult {
  if (!raw || typeof raw !== "object") {
    return createDefaultSemanticResult();
  }

  const source = raw as Record<string, unknown>;
  const semanticDelta = clampNumber(
    pickNumber(source, ["semantic_delta", "semanticDelta", "delta"]),
    -15,
    15,
  );
  const confidence = clampNumber(
    pickNumber(source, ["confidence", "confidence_score"]),
    0,
    1,
  );

  return {
    semanticDelta,
    missingInfo: pickStringArray(source, ["missing_info", "missingInfo"]),
    suggestedQuestions: pickStringArray(source, ["suggested_questions", "suggestedQuestions"]),
    confidence,
    summary: pickString(source, ["summary"]),
  };
}

export function mergeScoringResults(
  ruleScore: RuleScoreResult,
  semantic: SemanticScoreResult,
  threshold: number,
): IssueScoringResult {
  const totalScore = clampNumber(ruleScore.totalScore + semantic.semanticDelta, 0, 100);
  const missingInfo = [...new Set([...ruleScore.missingInfo, ...semantic.missingInfo])];

  return {
    threshold,
    ruleScore: ruleScore.totalScore,
    totalScore,
    passesThreshold: totalScore >= threshold,
    breakdown: ruleScore.breakdown,
    missingInfo,
    suggestedQuestions: semantic.suggestedQuestions,
    semantic,
  };
}

function createDefaultSemanticResult(): SemanticScoreResult {
  return {
    semanticDelta: 0,
    missingInfo: [],
    suggestedQuestions: [],
    confidence: 0,
    summary: "LLM scoring is not configured.",
  };
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function pickStringArray(source: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
  }

  return [];
}

function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
