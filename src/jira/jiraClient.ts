import {
  JiraAttachment,
  JiraAuthSession,
  JiraComment,
  JiraIssueDetail,
  JiraIssueSummary,
  JiraProjectSummary,
} from "../models";
import { adfToHtml, adfToText } from "../utils/adf";
import { normalizeSiteUrl } from "../utils/strings";

export interface JiraAuthSessionProvider {
  getSession(): Promise<JiraAuthSession | undefined>;
  getAuthorizationHeader(): Promise<string>;
  getSiteUrl(): Promise<string>;
}

export interface OutputLogger {
  appendLine(value: string): void;
}

interface JiraSearchResponse {
  issues?: JiraIssueApiModel[];
}

interface JiraIssueApiModel {
  id: string;
  key: string;
  fields: Record<string, any>;
}

interface JiraProjectSearchResponse {
  values?: JiraProjectApiModel[];
}

interface JiraProjectApiModel {
  id?: string;
  key?: string;
  name?: string;
}

export class JiraClient {
  public constructor(
    private readonly authProvider: JiraAuthSessionProvider,
    private readonly logger?: OutputLogger,
  ) {}

  public async searchIssues(jql: string, maxResults = 20): Promise<JiraIssueSummary[]> {
    const siteUrl = await this.authProvider.getSiteUrl();
    const response = await this.request<JiraSearchResponse>("/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql,
        maxResults,
        fieldsByKeys: false,
        fields: [
          "summary",
          "description",
          "status",
          "assignee",
          "updated",
          "project",
          "issuetype",
        ],
      }),
    });

    return (response.issues ?? []).map((issue) => mapIssueSummary(issue, siteUrl));
  }

  public async listProjects(maxResults = 100): Promise<JiraProjectSummary[]> {
    const query = new URLSearchParams({
      maxResults: String(maxResults),
      orderBy: "key",
    });
    const response = await this.request<JiraProjectSearchResponse>(`/project/search?${query.toString()}`);

    return (response.values ?? [])
      .map(mapProjectSummary)
      .filter((project): project is JiraProjectSummary => Boolean(project));
  }

  public async getIssue(issueKey: string): Promise<JiraIssueDetail> {
    const siteUrl = await this.authProvider.getSiteUrl();
    const query = new URLSearchParams({
      fields: [
        "summary",
        "description",
        "status",
        "assignee",
        "updated",
        "project",
        "issuetype",
        "priority",
        "labels",
        "attachment",
        "comment",
      ].join(","),
    });

    const issue = await this.request<JiraIssueApiModel>(`/issue/${encodeURIComponent(issueKey)}?${query.toString()}`);
    return mapIssueDetail(issue, siteUrl);
  }

  public async addComment(issueKey: string, body: string): Promise<void> {
    await this.request(`/issue/${encodeURIComponent(issueKey)}/comment`, {
      method: "POST",
      body: JSON.stringify({
        body: buildJiraDocument(body),
      }),
    });
  }

  public async getMyself(): Promise<{ accountId?: string; displayName?: string }> {
    return this.request<{ accountId?: string; displayName?: string }>("/myself");
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const authorization = await this.authProvider.getAuthorizationHeader();
    const siteUrl = await this.authProvider.getSiteUrl();
    const baseUrl = `${siteUrl}/rest/api/3`;

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: authorization,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger?.appendLine(`Jira request failed ${response.status}: ${body}`);
      throw new Error(`Jira request failed: ${response.status} ${body}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

function mapIssueSummary(
  issue: JiraIssueApiModel,
  siteUrl: string,
): JiraIssueSummary {
  const fields = issue.fields ?? {};
  const descriptionText = adfToText(fields.description);

  return {
    id: issue.id,
    key: issue.key,
    summary: fields.summary ?? issue.key,
    status: fields.status?.name ?? "Unknown",
    projectKey: fields.project?.key ?? "UNKNOWN",
    issueType: fields.issuetype?.name,
    assigneeAccountId: fields.assignee?.accountId,
    assigneeDisplayName: fields.assignee?.displayName,
    updated: fields.updated ?? "",
    descriptionText,
    url: buildIssueUrl(siteUrl, issue.key),
  };
}

function mapProjectSummary(project: JiraProjectApiModel): JiraProjectSummary | undefined {
  const key = project.key?.trim();
  if (!key) {
    return undefined;
  }

  return {
    id: String(project.id ?? key),
    key,
    name: project.name?.trim() || key,
  };
}

function mapIssueDetail(
  issue: JiraIssueApiModel,
  siteUrl: string,
): JiraIssueDetail {
  const fields = issue.fields ?? {};
  const descriptionText = adfToText(fields.description);
  const comments = mapComments(fields.comment?.comments ?? []);

  const detail: JiraIssueDetail = {
    ...mapIssueSummary(issue, siteUrl),
    descriptionText,
    descriptionHtml: adfToHtml(fields.description),
    priority: fields.priority?.name,
    labels: Array.isArray(fields.labels) ? fields.labels : [],
    comments,
    attachments: mapAttachments(fields.attachment ?? []),
    acceptanceCriteriaText: extractSection(descriptionText, ["acceptance criteria", "验收标准", "完成标准"]),
    reproductionStepsText: extractSection(descriptionText, ["steps to reproduce", "复现步骤", "重现步骤"]),
    environmentText: extractSection(descriptionText, ["environment", "version", "环境", "版本"]),
  };

  detail.url = buildIssueUrl(siteUrl, issue.key);
  return detail;
}

function mapComments(comments: any[]): JiraComment[] {
  return comments.map((comment) => ({
    id: String(comment.id ?? ""),
    authorDisplayName: comment.author?.displayName ?? "Unknown",
    bodyText: adfToText(comment.body),
    bodyHtml: adfToHtml(comment.body),
    created: comment.created ?? "",
    updated: comment.updated ?? "",
  }));
}

function mapAttachments(attachments: any[]): JiraAttachment[] {
  return attachments.map((attachment) => ({
    id: String(attachment.id ?? ""),
    filename: attachment.filename ?? "attachment",
    mimeType: attachment.mimeType,
    size: attachment.size,
    contentUrl: attachment.content,
  }));
}

function extractSection(text: string, keywords: string[]): string | undefined {
  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    const index = lowerText.indexOf(keyword.toLowerCase());
    if (index < 0) {
      continue;
    }

    const slice = text.slice(index).split(/\n{2,}/)[0]?.trim();
    if (slice) {
      return slice;
    }
  }

  return undefined;
}

function buildIssueUrl(siteUrl: string, issueKey: string): string {
  const normalizedSiteUrl = siteUrl ? normalizeSiteUrl(siteUrl) : "";
  return normalizedSiteUrl ? `${normalizedSiteUrl}/browse/${issueKey}` : issueKey;
}

function buildJiraDocument(body: string): Record<string, unknown> {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      type: "paragraph",
      content: paragraph.split("\n").flatMap((line, index, lines) => {
        const content: Array<Record<string, unknown>> = [{ type: "text", text: line }];
        if (index < lines.length - 1) {
          content.push({ type: "hardBreak" });
        }
        return content;
      }),
    }));

  return {
    type: "doc",
    version: 1,
    content: paragraphs.length
      ? paragraphs
      : [{ type: "paragraph", content: [{ type: "text", text: body.trim() || " " }] }],
  };
}
