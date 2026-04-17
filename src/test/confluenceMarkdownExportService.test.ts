import { strict as assert } from "node:assert";

import { ConfluenceMarkdownExportService } from "../confluence/confluenceMarkdownExportService";

describe("ConfluenceMarkdownExportService", () => {
  it("builds markdown with metadata and absolute resource links", () => {
    const service = new ConfluenceMarkdownExportService();
    const markdown = service.buildMarkdown({
      id: "123",
      title: "Release checklist",
      spaceId: "42",
      spaceKey: "ENG",
      spaceName: "Engineering",
      status: "current",
      updated: "2026-04-16T08:00:00.000Z",
      url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+checklist",
      bodyHtml: "<p>Fallback body</p>",
      bodyExportHtml: `
        <p>Start with the <a href="/wiki/spaces/ENG/pages/456/Release+plan">release plan</a>.</p>
        <p><img src="/wiki/download/attachments/123/diagram.png" alt="diagram" /></p>
      `,
      bodyText: "Fallback body",
      versionNumber: 7,
      updatedByDisplayName: "Dev User",
      ancestors: [
        {
          id: "1",
          title: "Home",
          url: "https://example.atlassian.net/wiki/spaces/ENG/overview",
        },
      ],
    });

    assert.match(markdown, /^# Release checklist/m);
    assert.match(markdown, /\[Open in Confluence\]\(https:\/\/example\.atlassian\.net\/wiki\/spaces\/ENG\/pages\/123\/Release\+checklist\)/);
    assert.match(markdown, /- Space: Engineering \(ENG\)/);
    assert.match(markdown, /- Breadcrumbs: Home \/ Release checklist/);
    assert.match(markdown, /\[release plan\]\(https:\/\/example\.atlassian\.net\/wiki\/spaces\/ENG\/pages\/456\/Release\+plan\)/i);
    assert.match(markdown, /!\[diagram\]\(https:\/\/example\.atlassian\.net\/wiki\/download\/attachments\/123\/diagram\.png\)/);
  });

  it("builds an ASCII-safe suggested file name", () => {
    const service = new ConfluenceMarkdownExportService();
    const fileName = service.buildSuggestedFileName({
      id: "123",
      title: "发布检查清单",
      spaceId: "42",
      spaceKey: "ENG",
      status: "current",
      updated: "",
      url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123",
      bodyHtml: "<p>Body</p>",
      bodyText: "Body",
      ancestors: [],
    });

    assert.equal(fileName, "eng-123.md");
  });
});
