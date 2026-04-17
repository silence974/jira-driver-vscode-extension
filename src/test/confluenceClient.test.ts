import { strict as assert } from "node:assert";

import { ConfluenceClient } from "../confluence/confluenceClient";

describe("ConfluenceClient", () => {
  it("loads every visible space across paginated responses and prioritizes project spaces", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);

      if (!url.includes("cursor=page-2")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "2",
                key: "~jiaji",
                name: "Jiajia Xu",
                type: "personal",
              },
            ],
            _links: {
              base: "https://example.atlassian.net",
              next: "/wiki/api/v2/spaces?cursor=page-2",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          results: [
            {
              id: "1",
              key: "DOC",
              name: "Documentation",
              type: "global",
            },
          ],
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

      const spaces = await client.listSpaces();

      assert.equal(calls.length, 2);
      assert.equal(spaces.length, 2);
      assert.equal(spaces[0].key, "DOC");
      assert.equal(spaces[0].category, "project");
      assert.equal(spaces[1].category, "personal");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

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

  it("loads mixed direct children so folder nodes like Tools are not dropped", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          results: [
            {
              id: "folder-1",
              type: "folder",
              title: "Tools",
              status: "current",
              spaceId: "42",
              childPosition: 15,
            },
            {
              id: "page-1",
              type: "page",
              title: "Commodity",
              status: "current",
              spaceId: "42",
              childPosition: 20,
            },
          ],
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

      const children = await client.listPageChildren({
        id: "123",
        contentType: "page",
      });

      assert.equal(calls.length, 1);
      assert.match(calls[0], /\/wiki\/api\/v2\/pages\/123\/direct-children\?/);
      assert.equal(children.length, 2);
      assert.equal(children[0].title, "Tools");
      assert.equal(children[0].contentType, "folder");
      assert.equal(children[1].contentType, "page");
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
            webui: "/spaces/ENG/overview",
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
      assert.equal(page.url, "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+checklist");
      assert.equal(page.bodyExportHtml, "<p>Export body</p>");
      assert.equal(page.bodyHtml, "<p>Preview body</p>");
      assert.equal(page.bodyText, "Export body");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
