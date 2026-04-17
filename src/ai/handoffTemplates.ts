import { NodeHtmlMarkdown } from "node-html-markdown";

import {
  HandoffArtifacts,
  IssueScoringResult,
  JiraIssueDetail,
  WorkspaceContext,
} from "../models";

const htmlToMarkdown = new NodeHtmlMarkdown({
  bulletMarker: "-",
  codeBlockStyle: "fenced",
  keepDataImages: false,
  textReplace: [[/\u00A0/g, " "]],
});

export interface HandoffLocalAttachment {
  attachmentId: string;
  filename: string;
  relativePath: string;
  mimeType?: string;
  isImage: boolean;
}

export function buildHandoffReadme(
  issue: JiraIssueDetail,
  scoring: IssueScoringResult,
  workspaceContext: WorkspaceContext,
  branchName: string,
  localAttachments: HandoffLocalAttachment[] = [],
): string {
  const localAttachmentsById = new Map(localAttachments.map((attachment) => [attachment.attachmentId, attachment]));
  const imageAttachments = localAttachments.filter((attachment) => attachment.isImage);
  const problemContext = renderMarkdownFromHtml(issue.descriptionHtml, issue.descriptionText, issue.url);

  return [
    `# ${issue.key}: ${issue.summary}`,
    "",
    "## Issue Summary",
    `- Jira Key: ${issue.key}`,
    `- Jira URL: ${issue.url}`,
    `- Status: ${issue.status}`,
    `- Score: ${scoring.totalScore}/100`,
    "",
    "## Problem Context",
    problemContext || "_No description provided._",
    "",
    "## Acceptance Criteria",
    issue.acceptanceCriteriaText || "_No explicit acceptance criteria found in Jira._",
    "",
    "## Reproduction / Environment",
    issue.reproductionStepsText || "_No explicit reproduction steps found._",
    "",
    issue.environmentText || "_No explicit environment details found._",
    "",
    "## Key Comments",
    issue.comments.length
      ? issue.comments.slice(0, 5).map((comment) => [
          `### ${comment.authorDisplayName} (${comment.updated})`,
          renderMarkdownFromHtml(comment.bodyHtml, comment.bodyText, issue.url) || "_Empty comment._",
        ].join("\n")).join("\n\n")
      : "_No comments available._",
    "",
    "## Attachments",
    issue.attachments.length
      ? issue.attachments.map((attachment) => {
          const localAttachment = localAttachmentsById.get(attachment.id);
          const label = localAttachment
            ? `[${attachment.filename}](${localAttachment.relativePath})`
            : attachment.filename;

          return `- ${label}${attachment.mimeType ? ` (${attachment.mimeType})` : ""}`;
        }).join("\n")
      : "_No attachments available._",
    "",
    "## Image Attachments",
    imageAttachments.length
      ? imageAttachments.map((attachment) => `![${attachment.filename}](${attachment.relativePath})`).join("\n\n")
      : "_No image attachments downloaded._",
    "",
    "## Workspace Context",
    `- Repository: ${workspaceContext.repoName}`,
    `- Branch: ${workspaceContext.currentBranch ?? "unknown"}`,
    `- Recent Diff Files: ${workspaceContext.recentDiffFiles.length ? workspaceContext.recentDiffFiles.join(", ") : "none"}`,
    "",
    workspaceContext.readmeExcerpt || "_No README excerpt found._",
    "",
    "## Relevant Code Snippets",
    workspaceContext.codeSnippets.length
      ? workspaceContext.codeSnippets.map((snippet) => [
          `### ${snippet.path} (${snippet.source})`,
          "```",
          snippet.content.trim(),
          "```",
        ].join("\n")).join("\n\n")
      : "_No local code snippets were captured._",
    "",
    "## Branch Plan",
    `- Create and checkout branch: \`${branchName}\``,
    "",
    "## Execution Constraints",
    "- Keep the fix scoped to this Jira.",
    "- Follow the acceptance criteria and the current repository conventions.",
    "- Summarize the implementation and validation steps after the fix is complete.",
  ].join("\n");
}

export function buildHandoffPrompt(issue: JiraIssueDetail, readmePath: string, branchName: string): string {
  return [
    `Read \`${readmePath}\` completely.`,
    `Then create and checkout branch \`${branchName}\`.`,
    `Implement the fix for ${issue.key} based on the README, keep the scope tight, and report the code changes and validation steps when finished.`,
  ].join(" ");
}

export function buildTaskJson(
  issue: JiraIssueDetail,
  scoring: IssueScoringResult,
  workspaceContext: WorkspaceContext,
  artifacts: Omit<HandoffArtifacts, "taskJson">,
): string {
  return JSON.stringify(
    {
      issue: {
        key: issue.key,
        summary: issue.summary,
        url: issue.url,
        status: issue.status,
      },
      scoring: {
        threshold: scoring.threshold,
        ruleScore: scoring.ruleScore,
        totalScore: scoring.totalScore,
        missingInfo: scoring.missingInfo,
        suggestedQuestions: scoring.suggestedQuestions,
      },
      workspaceContext,
      handoff: {
        folderPath: artifacts.folderPath,
        readmePath: artifacts.readmePath,
        promptPath: artifacts.promptPath,
        branchName: artifacts.branchName,
      },
    },
    null,
    2,
  );
}

function renderMarkdownFromHtml(html: string | undefined, fallbackText: string | undefined, baseUrl: string): string {
  const normalizedHtml = absolutizeUrls(html?.trim(), baseUrl);
  if (normalizedHtml) {
    const markdown = normalizeMarkdown(htmlToMarkdown.translate(normalizedHtml));
    if (markdown) {
      return markdown;
    }
  }

  return normalizeMarkdown(fallbackText ?? "");
}

function absolutizeUrls(html: string | undefined, baseUrl: string): string {
  if (!html) {
    return "";
  }

  return html.replace(
    /\b(href|src)=(["'])(.*?)\2/gi,
    (_match, attributeName: string, quote: string, rawValue: string) => {
      const resolved = resolveUrl(rawValue, baseUrl);
      return `${attributeName}=${quote}${resolved}${quote}`;
    },
  );
}

function resolveUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  if (!trimmed || isSkippableUrl(trimmed)) {
    return trimmed;
  }

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

function isSkippableUrl(value: string): boolean {
  return value.startsWith("#")
    || value.startsWith("data:")
    || value.startsWith("mailto:")
    || value.startsWith("tel:")
    || value.startsWith("javascript:");
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}
