import { strict as assert } from "node:assert";

import { JiraClient } from "../jira/jiraClient";

describe("JiraClient", () => {
  it("uses the new /search/jql endpoint for issue search", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          issues: [],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }) as typeof fetch;

    try {
      const client = new JiraClient({
        async getSession() {
          return {
            siteUrl: "https://example.atlassian.net",
            email: "dev@example.com",
          };
        },
        async getAuthorizationHeader() {
          return "Basic ZGV2QGV4YW1wbGUuY29tOnRva2Vu";
        },
        async getSiteUrl() {
          return "https://example.atlassian.net";
        },
      });

      await client.searchIssues('project = "APP"');

      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/rest\/api\/3\/search\/jql$/);
      assert.match(String(calls[0].init?.body ?? ""), /"fieldsByKeys":false/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
