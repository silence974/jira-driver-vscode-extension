import { escapeHtml } from "./strings";

type AdfNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: AdfNode[];
};

export function adfToText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  return renderText(value as AdfNode).replace(/\n{3,}/g, "\n\n").trim();
}

export function adfToHtml(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  return renderHtml(value as AdfNode).trim();
}

function renderText(node: AdfNode): string {
  switch (node.type) {
    case "doc":
      return joinTextChildren(node, "");
    case "paragraph":
      return `${joinTextChildren(node, "")}\n\n`;
    case "heading":
      return `${joinTextChildren(node, "")}\n\n`;
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "bulletList":
    case "orderedList":
      return `${joinTextChildren(node, "")}\n`;
    case "listItem":
      return `- ${joinTextChildren(node, "").trim()}\n`;
    case "codeBlock":
      return `${joinTextChildren(node, "")}\n\n`;
    case "blockquote":
      return `${joinTextChildren(node, "")}\n\n`;
    case "panel":
      return `${joinTextChildren(node, "")}\n\n`;
    default:
      return joinTextChildren(node, "");
  }
}

function renderHtml(node: AdfNode): string {
  switch (node.type) {
    case "doc":
      return joinHtmlChildren(node, "");
    case "paragraph":
      return `<p>${joinHtmlChildren(node, "")}</p>`;
    case "heading": {
      const level = clampHeading(node.attrs?.level);
      return `<h${level}>${joinHtmlChildren(node, "")}</h${level}>`;
    }
    case "text":
      return applyMarks(escapeHtml(node.text ?? ""), node.marks ?? []);
    case "hardBreak":
      return "<br />";
    case "bulletList":
      return `<ul>${joinHtmlChildren(node, "")}</ul>`;
    case "orderedList":
      return `<ol>${joinHtmlChildren(node, "")}</ol>`;
    case "listItem":
      return `<li>${joinHtmlChildren(node, "")}</li>`;
    case "codeBlock":
      return `<pre><code>${escapeHtml(joinTextChildren(node, ""))}</code></pre>`;
    case "blockquote":
      return `<blockquote>${joinHtmlChildren(node, "")}</blockquote>`;
    case "panel":
      return `<div class="panel">${joinHtmlChildren(node, "")}</div>`;
    case "inlineCard":
      return renderInlineCard(node);
    case "mention":
      return `<span class="mention">@${escapeHtml(String(node.attrs?.text ?? ""))}</span>`;
    default:
      return joinHtmlChildren(node, "");
  }
}

function joinTextChildren(node: AdfNode, separator: string): string {
  return (node.content ?? []).map((child) => renderText(child)).join(separator);
}

function joinHtmlChildren(node: AdfNode, separator: string): string {
  return (node.content ?? []).map((child) => renderHtml(child)).join(separator);
}

function renderInlineCard(node: AdfNode): string {
  const url = String(node.attrs?.url ?? "");
  if (!url) {
    return "";
  }

  const safeUrl = escapeHtml(url);
  return `<a href="${safeUrl}">${safeUrl}</a>`;
}

function clampHeading(level: unknown): number {
  const numericLevel = typeof level === "number" ? level : 2;
  return Math.min(6, Math.max(1, numericLevel));
}

function applyMarks(text: string, marks: Array<{ type: string; attrs?: Record<string, unknown> }>): string {
  return marks.reduce((current, mark) => {
    switch (mark.type) {
      case "strong":
        return `<strong>${current}</strong>`;
      case "em":
        return `<em>${current}</em>`;
      case "code":
        return `<code>${current}</code>`;
      case "link":
        return `<a href="${escapeHtml(String(mark.attrs?.href ?? ""))}">${current}</a>`;
      default:
        return current;
    }
  }, text);
}
