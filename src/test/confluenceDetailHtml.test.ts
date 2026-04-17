import { strict as assert } from "node:assert";

import { renderConfluenceDetailHtml } from "../ui/confluenceDetailHtml";

describe("renderConfluenceDetailHtml", () => {
  it("renders selected Confluence page information and actions", () => {
    const html = renderConfluenceDetailHtml(
      {
        signedIn: true,
        groups: [],
        jiraProjects: [],
        selectedProjectKeys: [],
        issueExplorerFilters: {},
        issueSearchResults: undefined,
        confluenceSpaces: [],
        confluenceSearchResults: [],
        selectedConfluencePage: {
          id: "123",
          title: "Release checklist",
          spaceId: "42",
          spaceKey: "ENG",
          spaceName: "Engineering",
          status: "current",
          updated: "2026-04-16T08:00:00.000Z",
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+checklist",
          bodyHtml: "<p>Step 1</p>",
          bodyText: "Step 1",
          versionNumber: 7,
          updatedByDisplayName: "Dev User",
          ancestors: [
            {
              id: "1",
              title: "Home",
              url: "https://example.atlassian.net/wiki/spaces/ENG/overview",
            },
          ],
        },
      },
      "nonce123",
    );

    assert.match(html, /Release checklist/);
    assert.match(html, /aria-label="Export Markdown"/);
    assert.match(html, /aria-label="Open in Browser"/);
    assert.match(html, /data-action="exportConfluenceMarkdown"/);
    assert.match(html, /data-action="openSelectedConfluenceInBrowser"/);
    assert.doesNotMatch(html, /Search Pages/);
    assert.doesNotMatch(html, /Refresh Spaces/);
  });
});
