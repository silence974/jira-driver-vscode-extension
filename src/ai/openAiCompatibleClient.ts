import { AI_API_KEY_SECRET_KEY } from "../constants";
import { JiraDriverSettings, JiraIssueSummary, WorkspaceContext } from "../models";
import { parseJsonObject } from "../utils/json";

export interface SecretStore {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
  store(key: string, value: string): Thenable<void> | Promise<void>;
  delete(key: string): Thenable<void> | Promise<void>;
}

export interface OutputLogger {
  appendLine(value: string): void;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type: string; text?: string }>;
    };
  }>;
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

export class OpenAICompatibleClient {
  public constructor(
    private readonly getSettings: () => JiraDriverSettings,
    private readonly secrets: SecretStore,
    private readonly logger?: OutputLogger,
  ) {}

  public async setApiKey(apiKey: string): Promise<void> {
    await this.secrets.store(AI_API_KEY_SECRET_KEY, apiKey.trim());
  }

  public async deleteApiKey(): Promise<void> {
    await this.secrets.delete(AI_API_KEY_SECRET_KEY);
  }

  public async isConfigured(): Promise<boolean> {
    const settings = this.getSettings();
    const apiKey = await this.secrets.get(AI_API_KEY_SECRET_KEY);
    return Boolean(settings.aiBaseUrl && settings.aiChatModel && apiKey);
  }

  public async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const settings = this.getSettings();
    const apiKey = await this.requireApiKey();
    const endpoint = `${settings.aiBaseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: settings.aiChatModel,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI chat request failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content.map((part) => part.text ?? "").join("\n").trim();
    }

    throw new Error("AI response did not include message content.");
  }

  public async chatJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    return parseJsonObject<T>(await this.chat(systemPrompt, userPrompt));
  }

  public async embed(texts: string[]): Promise<number[][]> {
    const settings = this.getSettings();
    if (!settings.aiEmbeddingModel) {
      return [];
    }

    const apiKey = await this.requireApiKey();
    const endpoint = `${settings.aiBaseUrl}/embeddings`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: settings.aiEmbeddingModel,
        input: texts,
      }),
    });

    if (!response.ok) {
      this.logger?.appendLine(`Embedding request failed: ${response.status} ${await response.text()}`);
      return [];
    }

    const payload = (await response.json()) as EmbeddingResponse;
    return (payload.data ?? []).map((item) => item.embedding ?? []);
  }

  public async rerankIssues(
    query: string,
    workspaceContext: WorkspaceContext,
    candidates: JiraIssueSummary[],
  ): Promise<JiraIssueSummary[]> {
    if (!candidates.length || !(await this.isConfigured())) {
      return candidates;
    }

    const withEmbeddingOrder = await this.applyEmbeddingSimilarity(query, workspaceContext, candidates);
    const trimmedCandidates = withEmbeddingOrder.slice(0, 10);

    try {
      const result = await this.chatJson<{
        ordered_ids?: string[];
        reasons?: Record<string, string>;
        scores?: Record<string, number>;
      }>(
        [
          "You rerank Jira issues for engineering relevance.",
          "Return only JSON.",
          "Schema:",
          "{\"ordered_ids\": string[], \"reasons\": {\"issueKey\": string}, \"scores\": {\"issueKey\": number}}",
          "Scores must be between 0 and 1 and reasons must be short.",
        ].join("\n"),
        JSON.stringify(
          {
            query,
            workspaceContext,
            candidates: trimmedCandidates.map((candidate) => ({
              key: candidate.key,
              summary: candidate.summary,
              description: candidate.descriptionText,
              status: candidate.status,
              projectKey: candidate.projectKey,
            })),
          },
          null,
          2,
        ),
      );

      const candidateMap = new Map(trimmedCandidates.map((candidate) => [candidate.key, candidate]));
      const ordered: JiraIssueSummary[] = [];

      for (const key of result.ordered_ids ?? []) {
        const candidate = candidateMap.get(key);
        if (!candidate) {
          continue;
        }

        ordered.push({
          ...candidate,
          rankingReason: result.reasons?.[key],
          semanticScore: clamp01(result.scores?.[key] ?? candidate.semanticScore ?? 0),
        });
        candidateMap.delete(key);
      }

      return [
        ...ordered,
        ...[...candidateMap.values()],
        ...withEmbeddingOrder.slice(trimmedCandidates.length),
      ];
    } catch (error) {
      this.logger?.appendLine(`Chat rerank failed: ${String(error)}`);
      return withEmbeddingOrder;
    }
  }

  private async applyEmbeddingSimilarity(
    query: string,
    workspaceContext: WorkspaceContext,
    candidates: JiraIssueSummary[],
  ): Promise<JiraIssueSummary[]> {
    const settings = this.getSettings();
    if (!settings.aiEmbeddingModel) {
      return candidates;
    }

    const embeddings = await this.embed([
      [query, workspaceContext.repoName, workspaceContext.currentBranch, workspaceContext.readmeExcerpt]
        .filter(Boolean)
        .join("\n"),
      ...candidates.map((candidate) => `${candidate.summary}\n${candidate.descriptionText ?? ""}`),
    ]);

    if (embeddings.length !== candidates.length + 1) {
      return candidates;
    }

    const queryEmbedding = embeddings[0];
    return candidates
      .map((candidate, index) => ({
        ...candidate,
        semanticScore: cosineSimilarity(queryEmbedding, embeddings[index + 1]),
      }))
      .sort((left, right) => (right.semanticScore ?? 0) - (left.semanticScore ?? 0));
  }

  private async requireApiKey(): Promise<string> {
    const apiKey = (await this.secrets.get(AI_API_KEY_SECRET_KEY))?.trim();
    if (!apiKey) {
      throw new Error("Missing AI API key. Run 'Jira Driver: Set AI API Key' first.");
    }

    return apiKey;
  }
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return clamp01(dotProduct / Math.sqrt(leftMagnitude * rightMagnitude));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
