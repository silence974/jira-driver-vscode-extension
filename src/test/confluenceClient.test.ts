import { strict as assert } from "node:assert";

import { ConfluenceClient } from "../confluence/confluenceClient";

describe("ConfluenceClient", () => {
  it("uses the Confluence content search endpoint with CQL page filters", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          results: [],
          _links: {
            base: "https://example.atlassian.net",
          },
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
      const client = new ConfluenceClient({
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

      await client.searchPages("release notes", ["ENG", "DOCS"]);

      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/wiki\/rest\/api\/content\/search\?/);
      const decodedUrl = decodeURIComponent(calls[0].url).replaceAll("+", " ");
      assert.match(decodedUrl, /type = page/);
      assert.match(decodedUrl, /space in \("ENG", "DOCS"\)/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the root page tree endpoint for space browsing", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          results: [],
          _links: {
            base: "https://example.atlassian.net",
          },
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
      const client = new ConfluenceClient({
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

      await client.listRootPages("42");

      assert.equal(calls.length, 1);
      assert.match(calls[0], /\/wiki\/api\/v2\/spaces\/42\/pages\?/);
      assert.match(calls[0], /depth=root/);
      assert.match(calls[0], /status=current/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("loads page export HTML when fetching page details", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          id: "123",
          title: "Release checklist",
          status: "current",
          space: {
            id: "42",
            key: "ENG",
            name: "Engineering",
          },
          version: {
            number: 7,
            when: "2026-04-16T08:00:00.000Z",
            by: {
              displayName: "Dev User",
            },
          },
          body: {
            export_view: {
              value: "<p>Export body</p>",
            },
            view: {
              value: "<p>Preview body</p>",
            },
          },
          ancestors: [],
          _links: {
            base: "https://example.atlassian.net",
            webui: "/wiki/spaces/ENG/pages/123/Release+checklist",
          },
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
      const client = new ConfluenceClient({
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

      const page = await client.getPage("123");

      assert.equal(calls.length, 1);
      assert.match(decodeURIComponent(calls[0]), /body\.export_view/);
      assert.equal(page.bodyExportHtml, "<p>Export body</p>");
      assert.equal(page.bodyHtml, "<p>Preview body</p>");
      assert.equal(page.bodyText, "Export body");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
