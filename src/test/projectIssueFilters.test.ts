import { strict as assert } from "node:assert";

import {
  applyProjectIssueFilters,
  buildProjectFilterOptions,
  buildVisibleIssueList,
  collectSelectedProjectBrowseIssues,
  sanitizeProjectFilters,
  UNASSIGNED_ASSIGNEE_ACCOUNT_ID,
} from "../discovery/projectIssueFilters";
import { JiraProjectExplorerState } from "../models";

describe("project issue filters", () => {
  const issues = [
    {
      id: "1",
      key: "APP-1",
      summary: "Fix login redirect",
      status: "In Progress",
      projectKey: "APP",
      issueType: "Bug",
      assigneeAccountId: "acct-1",
      assigneeDisplayName: "Alice",
      updated: "",
      descriptionText: "OAuth callback fails after login",
      url: "https://example.atlassian.net/browse/APP-1",
    },
    {
      id: "2",
      key: "APP-2",
      summary: "Document release notes",
      status: "To Do",
      projectKey: "APP",
      issueType: "Task",
      updated: "",
      descriptionText: "Need notes for the next release",
      url: "https://example.atlassian.net/browse/APP-2",
    },
  ];

  it("builds unique project filter options from issues", () => {
    const options = buildProjectFilterOptions(issues);

    assert.deepEqual(options.issueTypes, ["Bug", "Task"]);
    assert.deepEqual(options.statuses, ["In Progress", "To Do"]);
    assert.deepEqual(
      options.assignees.map((assignee) => assignee.accountId),
      ["acct-1", UNASSIGNED_ASSIGNEE_ACCOUNT_ID],
    );
  });

  it("applies assignee and query filters to project issues", () => {
    const filtered = applyProjectIssueFilters(issues, {
      assigneeAccountId: "acct-1",
      query: "oauth",
    });

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].key, "APP-1");
  });

  it("builds visible issues from selected projects and filters", () => {
    const state: JiraProjectExplorerState = {
      project: {
        id: "10000",
        key: "APP",
        name: "App Platform",
      },
      isLoaded: true,
      browseIssues: issues,
    };
    const browseIssues = collectSelectedProjectBrowseIssues([state], ["APP"]);
    const options = buildProjectFilterOptions(browseIssues);
    const filters = sanitizeProjectFilters(
      {
        status: "To Do",
      },
      options.assignees,
      options.issueTypes,
      options.statuses,
    );
    const visibleIssues = buildVisibleIssueList(browseIssues, filters);

    assert.equal(visibleIssues.length, 1);
    assert.equal(visibleIssues[0].key, "APP-2");
  });
});
