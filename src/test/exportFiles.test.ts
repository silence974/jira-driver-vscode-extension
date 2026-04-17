import { strict as assert } from "node:assert";

import {
  buildConfluenceExportLocation,
  rewriteMarkdownLinks,
  sanitizeExportPathSegment,
} from "../utils/exportFiles";

describe("export file helpers", () => {
  it("builds confluence export paths from space and ancestor tree", () => {
    const location = buildConfluenceExportLocation("/tmp/repo", {
      spaceName: "产品部",
      spaceKey: "PM",
      title: "V3.00.6 需求",
      ancestors: [
        {
          id: "1",
          title: "FICC相关产品",
          url: "",
        },
        {
          id: "2",
          title: "版本规划",
          url: "",
        },
      ],
    });

    assert.equal(
      location.markdownPath,
      "/tmp/repo/.jira-driver/confluence/产品部_PM/FICC相关产品/版本规划/V3.00.6_需求.md",
    );
    assert.equal(
      location.assetDir,
      "/tmp/repo/.jira-driver/confluence/产品部_PM/FICC相关产品/版本规划/V3.00.6_需求.assets",
    );
  });

  it("rewrites markdown links to local asset paths", () => {
    const markdown = [
      "![diagram](https://example.atlassian.net/wiki/download/attachments/123/diagram.png)",
      "[spec](https://example.atlassian.net/wiki/download/attachments/123/spec.pdf)",
    ].join("\n");

    const rewritten = rewriteMarkdownLinks(
      markdown,
      new Map([
        ["https://example.atlassian.net/wiki/download/attachments/123/diagram.png", "Page.assets/diagram.png"],
        ["https://example.atlassian.net/wiki/download/attachments/123/spec.pdf", "Page.assets/spec.pdf"],
      ]),
    );

    assert.match(rewritten, /!\[diagram\]\(Page\.assets\/diagram\.png\)/);
    assert.match(rewritten, /\[spec\]\(Page\.assets\/spec\.pdf\)/);
  });

  it("replaces spaces with underscores in export segments", () => {
    assert.equal(sanitizeExportPathSegment("Release Notes 2026"), "Release_Notes_2026");
  });
});
