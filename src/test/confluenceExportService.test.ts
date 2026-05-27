import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { ConfluenceExportService } from "../confluence/confluenceExportService";
import { ConfluenceMarkdownExportService } from "../confluence/confluenceMarkdownExportService";
import { ConfluencePageDetail } from "../models";

describe("ConfluenceExportService", () => {
  it("downloads and rewrites normal markdown links when they point to images", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jira-driver-confluence-"));
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

    const page: ConfluencePageDetail = {
      id: "123",
      title: "Release Notes",
      spaceId: "42",
      spaceKey: "ENG",
      spaceName: "Engineering",
      status: "current",
      updated: "2026-05-01T00:00:00.000Z",
      url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
      bodyHtml: "<p>fallback</p>",
      bodyExportHtml: "<p><a href=\"https://assets.example.com/diagram.png\">diagram.png</a></p>",
      bodyText: "fallback",
      ancestors: [],
      attachments: [],
    };

    try {
      const service = new ConfluenceExportService(
        {
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
        },
        new ConfluenceMarkdownExportService(),
      );

      const result = await service.exportPage(page, workspaceRoot, {
        downloadAttachments: false,
      });
      const markdown = await fs.readFile(result.markdownPath, "utf8");

      assert.deepEqual(fetchedUrls, ["https://assets.example.com/diagram.png"]);
      assert.match(markdown, /\[diagram\.png\]\(assets\/Release_Notes\/diagram\.png\)/);
      assert.match(result.assetDirectory, /assets\/Release_Notes$/);
      assert.equal(result.assetCount, 1);
      const downloadedImagePath = path.join(path.dirname(result.markdownPath), "assets", "Release_Notes", "diagram.png");
      await fs.access(downloadedImagePath);
    } finally {
      globalThis.fetch = originalFetch;
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
