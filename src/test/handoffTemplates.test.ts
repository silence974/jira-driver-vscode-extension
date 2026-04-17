import { strict as assert } from "node:assert";

import {
  buildHandoffPrompt,
  buildHandoffReadme,
  buildTaskJson,
} from "../ai/handoffTemplates";
import { HandoffArtifacts, IssueScoringResult, JiraIssueDetail, WorkspaceContext } from "../models";

describe("handoff templates", () => {
  const issue: JiraIssueDetail = {
    id: "1",
    key: "APP-123",
    summary: "Fix OAuth callback flow",
    status: "Ready",
    projectKey: "APP",
    updated: "2026-04-08T10:00:00.000Z",
    url: "https://acme.atlassian.net/browse/APP-123",
    descriptionText: "Detailed description",
    descriptionHtml: "<p>Detailed description</p>",
    labels: ["jira-auth"],
    comments: [
      {
        id: "c1",
        authorDisplayName: "Reporter",
        bodyText: "Please keep the callback stable.",
        bodyHtml: "<p>Please keep the callback stable.</p>",
        created: "",
        updated: "",
      },
    ],
    attachments: [
      {
        id: "a1",
        filename: "jira-auth.png",
      },
    ],
    acceptanceCriteriaText: "Callback works",
    reproductionStepsText: "Click sign in",
    environmentText: "VS Code desktop",
  };

  const scoring: IssueScoringResult = {
    threshold: 75,
    ruleScore: 80,
    totalScore: 84,
    passesThreshold: true,
    breakdown: [],
    missingInfo: [],
    suggestedQuestions: [],
    semantic: {
      semanticDelta: 4,
      missingInfo: [],
      suggestedQuestions: [],
      confidence: 0.8,
    },
  };

  const workspaceContext: WorkspaceContext = {
    workspaceRoot: "/tmp/repo",
    repoName: "jira-driver-vscode-extension",
    readmeExcerpt: "README excerpt",
    currentBranch: "main",
    recentDiffFiles: ["src/auth/jiraAuthProvider.ts"],
    codeSnippets: [
      {
        path: "src/auth/jiraAuthProvider.ts",
        content: "const redirectUri = callbackUri.toString();",
        source: "cursor",
      },
    ],
    searchTerms: ["jira", "auth"],
  };

  it("renders a full README and prompt", () => {
    const readme = buildHandoffReadme(
      issue,
      scoring,
      workspaceContext,
      "jira/app-123-fix-auth",
      [
        {
          attachmentId: "a1",
          filename: "jira-auth.png",
          relativePath: "assets/jira-auth.png",
          isImage: true,
        },
      ],
    );
    const prompt = buildHandoffPrompt(issue, ".jira-driver/tasks/APP-123/README.md", "jira/app-123-fix-auth");

    assert.match(readme, /## Acceptance Criteria/);
    assert.match(readme, /jira\/app-123-fix-auth/);
    assert.match(readme, /\[jira-auth\.png\]\(assets\/jira-auth\.png\)/);
    assert.match(readme, /!\[jira-auth\.png\]\(assets\/jira-auth\.png\)/);
    assert.match(prompt, /Read `\.jira-driver\/tasks\/APP-123\/README.md` completely\./);
  });

  it("serializes task metadata", () => {
    const artifacts: Omit<HandoffArtifacts, "taskJson"> = {
      folderPath: "/tmp/repo/.jira-driver/tasks/APP-123",
      readmePath: "/tmp/repo/.jira-driver/tasks/APP-123/README.md",
      promptPath: "/tmp/repo/.jira-driver/tasks/APP-123/prompt.md",
      taskPath: "/tmp/repo/.jira-driver/tasks/APP-123/task.json",
      readmeMarkdown: "# README",
      promptText: "Read README",
      branchName: "jira/app-123-fix-auth",
    };

    const taskJson = JSON.parse(buildTaskJson(issue, scoring, workspaceContext, artifacts));
    assert.equal(taskJson.issue.key, "APP-123");
    assert.equal(taskJson.handoff.branchName, "jira/app-123-fix-auth");
  });
});
