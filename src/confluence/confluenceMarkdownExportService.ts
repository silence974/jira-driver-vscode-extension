import { NodeHtmlMarkdown } from "node-html-markdown";

import { ConfluencePageDetail } from "../models";
import { slugify } from "../utils/strings";

const htmlToMarkdown = new NodeHtmlMarkdown({
  bulletMarker: "-",
  codeBlockStyle: "fenced",
  keepDataImages: false,
  textReplace: [[/\u00A0/g, " "]],
});

export class ConfluenceMarkdownExportService {
  public buildMarkdown(page: ConfluencePageDetail): string {
    const title = toSingleLine(page.title) || `Confluence Page ${page.id}`;
    const bodyHtml = absolutizeConfluenceUrls(page.bodyExportHtml ?? page.bodyHtml, page.url);
    const contentMarkdown = normalizeMarkdown(htmlToMarkdown.translate(bodyHtml));
    const breadcrumb = [...page.ancestors.map((ancestor) => toSingleLine(ancestor.title)), title]
      .filter(Boolean)
      .join(" / ");
    const spaceLabel = [page.spaceName, page.spaceKey ? `(${page.spaceKey})` : ""]
      .filter(Boolean)
      .join(" ")
      .trim();

    const lines = [
      `# ${title}`,
      "",
      `- Source: [Open in Confluence](${page.url})`,
      `- Page ID: \`${page.id}\``,
      spaceLabel ? `- Space: ${spaceLabel}` : "",
      page.versionNumber ? `- Version: ${page.versionNumber}` : "",
      page.updated ? `- Updated: ${toSingleLine(page.updated)}` : "",
      page.updatedByDisplayName ? `- Updated By: ${toSingleLine(page.updatedByDisplayName)}` : "",
      breadcrumb ? `- Breadcrumbs: ${breadcrumb}` : "",
      "",
      "---",
      "",
      contentMarkdown || "_No Confluence page body is available for this page._",
      "",
    ];

    return lines.filter((line, index, allLines) => {
      if (line) {
        return true;
      }

      return allLines[index - 1] !== "";
    }).join("\n");
  }

  public buildSuggestedFileName(page: ConfluencePageDetail): string {
    const titleSlug = slugify(page.title);
    const parts = [
      page.spaceKey?.toLowerCase(),
      page.id,
      titleSlug !== "task" ? titleSlug : undefined,
    ].filter(Boolean);

    return `${parts.join("-") || `confluence-${page.id}`}.md`;
  }
}

function absolutizeConfluenceUrls(html: string, pageUrl: string): string {
  return html.replace(
    /\b(href|src)=(["'])(.*?)\2/gi,
    (match, attributeName: string, quote: string, rawValue: string) => {
      const resolved = resolveUrl(rawValue, pageUrl);
      return `${attributeName}=${quote}${resolved}${quote}`;
    },
  );
}

function resolveUrl(value: string, pageUrl: string): string {
  const trimmed = value.trim();
  if (!trimmed || isSkippableUrl(trimmed)) {
    return trimmed;
  }

  try {
    return new URL(trimmed, pageUrl).toString();
  } catch {
    return trimmed;
  }
}

function isSkippableUrl(value: string): boolean {
  return value.startsWith("#")
    || value.startsWith("data:")
    || value.startsWith("mailto:")
    || value.startsWith("tel:")
    || value.startsWith("javascript:");
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function toSingleLine(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
