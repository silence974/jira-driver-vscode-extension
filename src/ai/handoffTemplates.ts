import {
  HandoffArtifacts,
  IssueScoringResult,
  JiraIssueDetail,
  WorkspaceContext,
} from "../models";

export function buildHandoffReadme(
  issue: JiraIssueDetail,
  scoring: IssueScoringResult,
  workspaceContext: WorkspaceContext,
  branchName: string,
): string {
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
    issue.descriptionText || "_No description provided._",
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
          comment.bodyText || "_Empty comment._",
        ].join("\n")).join("\n\n")
      : "_No comments available._",
    "",
    "## Attachments",
    issue.attachments.length
      ? issue.attachments.map((attachment) => `- ${attachment.filename}${attachment.mimeType ? ` (${attachment.mimeType})` : ""}`).join("\n")
      : "_No attachments available._",
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
