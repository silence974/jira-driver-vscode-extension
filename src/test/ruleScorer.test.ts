import { strict as assert } from "node:assert";

import { JiraIssueDetail } from "../models";
import { scoreIssueByRules } from "../scoring/ruleScorer";

describe("scoreIssueByRules", () => {
  it("awards a high score to a detailed issue", () => {
    const issue: JiraIssueDetail = {
      id: "1",
      key: "APP-123",
      summary: "Login form crashes after OAuth callback in desktop flow",
      status: "To Do",
      projectKey: "APP",
      updated: "2026-04-08T10:00:00.000Z",
      url: "https://acme.atlassian.net/browse/APP-123",
      descriptionText: [
        "Problem description:",
        "After the browser returns from Atlassian OAuth, the login form crashes in VS Code.",
        "",
        "Steps to reproduce:",
        "1. Click Sign In",
        "2. Complete OAuth in browser",
        "3. VS Code returns to the extension and throws",
        "",
        "Expected:",
        "The issue list should load normally.",
        "",
        "Actual:",
        "The extension throws a callback state error.",
        "",
        "Acceptance Criteria:",
        "- OAuth callback is handled correctly",
        "- User lands in Issue Explorer",
        "",
        "Environment:",
        "VS Code 1.100, macOS, extension 0.0.1",
        "",
        "Impact / Risk:",
        "Blocks all Jira automation users.",
      ].join("\n"),
      descriptionHtml: "<p>Detailed issue</p>",
      labels: ["jira-auth"],
      comments: [
        {
          id: "c1",
          authorDisplayName: "Reporter",
          bodyText: "Attached logs and screenshot.",
          bodyHtml: "<p>Attached logs and screenshot.</p>",
          created: "",
          updated: "",
        },
      ],
      attachments: [
        {
          id: "a1",
          filename: "jira-auth-error.log",
          mimeType: "text/plain",
        },
      ],
      acceptanceCriteriaText: "Acceptance Criteria:\n- OAuth callback is handled correctly",
      reproductionStepsText: "Steps to reproduce:\n1. Click Sign In",
      environmentText: "Environment: VS Code 1.100, macOS",
    };

    const result = scoreIssueByRules(issue);
    assert.ok(result.totalScore >= 75);
    assert.equal(result.missingInfo.length, 0);
  });

  it("flags vague issues as incomplete", () => {
    const issue: JiraIssueDetail = {
      id: "2",
      key: "APP-124",
      summary: "Bug",
      status: "To Do",
      projectKey: "APP",
      updated: "2026-04-08T10:00:00.000Z",
      url: "https://acme.atlassian.net/browse/APP-124",
      descriptionText: "Does not work",
      descriptionHtml: "<p>Does not work</p>",
      labels: [],
      comments: [],
      attachments: [],
    };

    const result = scoreIssueByRules(issue);
    assert.ok(result.totalScore < 40);
    assert.ok(result.missingInfo.length > 0);
  });
});
