import * as path from "node:path";

import { ConfluencePageDetail } from "../models";

const INVALID_EXPORT_SEGMENT_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/g;
const MARKDOWN_LINK_PATTERN = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?)(?:$|[?#])/i;

export interface MarkdownLinkToken {
  isImage: boolean;
  label: string;
  url: string;
  title?: string;
  raw: string;
}

export interface ConfluenceExportLocation {
  rootDir: string;
  pageDir: string;
  markdownPath: string;
  assetDir: string;
}

export function sanitizeExportPathSegment(value: string | undefined, fallback = "untitled"): string {
  const sanitized = (value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(INVALID_EXPORT_SEGMENT_PATTERN, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized || fallback;
}

export function sanitizeExportFileName(value: string | undefined, fallback = "file"): string {
  const rawValue = (value ?? "").trim();
  if (!rawValue) {
    return fallback;
  }

  const parsed = path.parse(rawValue);
  const name = sanitizeExportPathSegment(parsed.name || rawValue, fallback);
  const extension = parsed.ext
    .replace(/^\./, "")
    .trim()
    .replace(INVALID_EXPORT_SEGMENT_PATTERN, "");

  return extension ? `${name}.${extension}` : name;
}

export function buildConfluenceExportLocation(
  workspaceRoot: string,
  page: Pick<ConfluencePageDetail, "spaceName" | "spaceKey" | "title" | "ancestors">,
): ConfluenceExportLocation {
  const rootDir = path.join(workspaceRoot, ".jira-driver", "confluence");
  const spaceSegment = sanitizeExportPathSegment(
    page.spaceName
      ? `${page.spaceName}${page.spaceKey ? `_${page.spaceKey}` : ""}`
      : page.spaceKey,
    "pages",
  );
  const ancestorSegments = page.ancestors.map((ancestor) => sanitizeExportPathSegment(ancestor.title));
  const fileBaseName = sanitizeExportPathSegment(page.title, "page");
  const pageDir = path.join(rootDir, spaceSegment, ...ancestorSegments);

  return {
    rootDir,
    pageDir,
    markdownPath: path.join(pageDir, `${fileBaseName}.md`),
    assetDir: path.join(pageDir, `${fileBaseName}.assets`),
  };
}

export function extractMarkdownLinks(markdown: string): MarkdownLinkToken[] {
  return [...markdown.matchAll(MARKDOWN_LINK_PATTERN)].map((match) => ({
    raw: match[0],
    isImage: match[1] === "!",
    label: match[2],
    url: match[3],
    title: match[4] || undefined,
  }));
}

export function rewriteMarkdownLinks(markdown: string, rewrites: Map<string, string>): string {
  if (!rewrites.size) {
    return markdown;
  }

  return markdown.replace(
    MARKDOWN_LINK_PATTERN,
    (match, bang: string, label: string, rawUrl: string, title: string | undefined) => {
      const replacement = rewrites.get(rawUrl);
      if (!replacement) {
        return match;
      }

      const titleSuffix = title ? ` "${title}"` : "";
      return `${bang}[${label}](${replacement}${titleSuffix})`;
    },
  );
}

export function isImageLike(
  value: string | undefined,
  fileName?: string,
  mimeType?: string,
  markdownImage = false,
): boolean {
  if (markdownImage) {
    return true;
  }

  if (mimeType?.toLowerCase().startsWith("image/")) {
    return true;
  }

  return IMAGE_FILE_PATTERN.test(fileName ?? value ?? "");
}

export function buildRemoteAssetLookupKeys(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  const keys = new Set<string>([trimmed.toLowerCase()]);

  try {
    const parsedUrl = new URL(trimmed);
    keys.add(parsedUrl.toString().toLowerCase());
    keys.add(`${parsedUrl.origin}${parsedUrl.pathname}`.toLowerCase());

    const fileName = decodeURIComponent(path.posix.basename(parsedUrl.pathname));
    if (fileName) {
      keys.add(`file:${sanitizeExportFileName(fileName).toLowerCase()}`);
    }
  } catch {
    keys.add(`file:${sanitizeExportFileName(trimmed).toLowerCase()}`);
  }

  return [...keys];
}

export function toPosixRelativePath(fromPath: string, toPath: string): string {
  const relativePath = path.relative(fromPath, toPath);
  return relativePath.split(path.sep).join("/");
}
