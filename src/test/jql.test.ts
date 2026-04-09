import { strict as assert } from "node:assert";

import {
  buildAssignedIssuesJql,
  buildKeywordSearchJql,
  buildProjectIssuesJql,
  deriveWorkspaceSearchTerms,
} from "../discovery/jql";

describe("JQL builders", () => {
  it("builds the assigned issues query", () => {
    assert.equal(
      buildAssignedIssuesJql(),
      "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
    );
  });

  it("builds project query with escaped keys", () => {
    assert.equal(
      buildProjectIssuesJql(["TEAM", "OPS"]),
      'project in ("TEAM", "OPS") AND statusCategory != Done ORDER BY updated DESC',
    );
  });

  it("builds keyword query against text and projects", () => {
    const jql = buildKeywordSearchJql("login bug", ["APP"]);
    assert.match(jql, /project in \("APP"\)/);
    assert.match(jql, /text ~/);
    assert.match(jql, /ORDER BY updated DESC$/);
  });

  it("derives search terms from workspace context", () => {
    const terms = deriveWorkspaceSearchTerms({
      workspaceRoot: "/tmp/repo",
      repoName: "jira-driver-extension",
      readmeExcerpt: "OAuth callback handling for Jira issue workflow",
      currentBranch: "feature/jira-auth-flow",
      recentDiffFiles: ["src/auth/jiraAuthProvider.ts"],
      codeSnippets: [],
      searchTerms: ["jira", "auth"],
    });

    assert.ok(terms.includes("auth"));
    assert.ok(terms.includes("jira"));
    assert.ok(terms.includes("feature"));
  });
});
