import { strict as assert } from "node:assert";

import { renderIssueDetailHtml } from "../ui/detailHtml";

describe("renderIssueDetailHtml", () => {
  it("renders selected issue information and actions", () => {
    const html = renderIssueDetailHtml(
      {
        signedIn: true,
        groups: [],
        confluenceSpaces: [],
        confluenceSearchResults: [],
        selectedIssue: {
          id: "1",
          key: "APP-123",
          summary: "Fix OAuth callback",
          status: "Ready",
          projectKey: "APP",
          updated: "",
          url: "https://acme.atlassian.net/browse/APP-123",
          descriptionText: "Description",
          descriptionHtml: "<p>Description</p>",
          labels: [],
          comments: [],
          attachments: [],
        },
        selectedIssueScore: {
          threshold: 75,
          ruleScore: 70,
          totalScore: 78,
          passesThreshold: true,
          breakdown: [],
          missingInfo: [],
          suggestedQuestions: [],
          semantic: {
            semanticDelta: 8,
            missingInfo: [],
            suggestedQuestions: [],
            confidence: 0.8,
          },
        },
        handoffArtifacts: {
          folderPath: "/tmp/repo/.jira-driver/tasks/APP-123",
          readmePath: "/tmp/repo/.jira-driver/tasks/APP-123/README.md",
          promptPath: "/tmp/repo/.jira-driver/tasks/APP-123/prompt.md",
          taskPath: "/tmp/repo/.jira-driver/tasks/APP-123/task.json",
          readmeMarkdown: "# README",
          promptText: "Read README",
          taskJson: "{}",
          branchName: "jira/app-123-fix-auth",
        },
      },
      "nonce123",
    );

    assert.match(html, /Fix OAuth callback/);
    assert.match(html, /Prepare AI Fix/);
    assert.match(html, /Copy Prompt/);
  });
});
