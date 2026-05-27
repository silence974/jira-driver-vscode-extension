import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { HandoffService } from "../ai/handoffService";
import { IssueScoringResult, JiraIssueDetail, WorkspaceContext } from "../models";

describe("HandoffService", () => {
  it("downloads and rewrites image-looking markdown links in README", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jira-driver-handoff-"));
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];

    globalThis.fetch = (async (input: string | URL | Request) => {
      fetchedUrls.push(String(input));
      return new Response("image-bytes", {
        status: 200,
        headers: {
          "Content-Type": "image/png",
        },
      });
    }) as typeof fetch;

    const issue: JiraIssueDetail = {
      id: "1",
      key: "APP-1",
      summary: "Localize remote image links",
      status: "Open",
      projectKey: "APP",
      updated: "2026-05-01T00:00:00.000Z",
      url: "https://example.atlassian.net/browse/APP-1",
      descriptionText: "See diagram",
      descriptionHtml: "<p><a href=\"https://assets.example.com/diagram.png\">diagram.png</a></p>",
      labels: [],
      comments: [],
      attachments: [],
    };

    const scoring: IssueScoringResult = {
      threshold: 75,
      ruleScore: 80,
      totalScore: 80,
      passesThreshold: true,
      breakdown: [],
      missingInfo: [],
      suggestedQuestions: [],
      semantic: {
        semanticDelta: 0,
        missingInfo: [],
        suggestedQuestions: [],
        confidence: 0.9,
      },
    };

    const workspaceContext: WorkspaceContext = {
      workspaceRoot,
      repoName: "repo",
      readmeExcerpt: "",
      currentBranch: "main",
      recentDiffFiles: [],
      codeSnippets: [],
      searchTerms: [],
    };

    try {
      const service = new HandoffService({
        async getSession() {
          return {
            siteUrl: "https://example.atlassian.net",
            email: "dev@example.com",
          };
        },
        async getAuthorizationHeader() {
          return "Basic token";
        },
        async getSiteUrl() {
          return "https://example.atlassian.net";
        },
      });

      const artifacts = await service.prepare(issue, scoring, workspaceContext);
      const markdown = await fs.readFile(artifacts.readmePath, "utf8");

      assert.deepEqual(fetchedUrls, ["https://assets.example.com/diagram.png"]);
      assert.match(markdown, /\[diagram\.png\]\(assets\/diagram\.png\)/);
      const downloadedImagePath = path.join(path.dirname(artifacts.readmePath), "assets", "diagram.png");
      await fs.access(downloadedImagePath);
    } finally {
      globalThis.fetch = originalFetch;
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
