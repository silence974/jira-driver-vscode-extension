import { AppState } from "../models";
import { escapeHtml } from "../utils/strings";

export function renderConfluenceDetailHtml(state: AppState, nonce: string): string {
  const page = state.selectedConfluencePage;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light dark;
        --bg: var(--vscode-editor-background);
        --fg: var(--vscode-editor-foreground);
        --muted: var(--vscode-descriptionForeground);
        --card: color-mix(in srgb, var(--bg) 88%, white 12%);
        --border: var(--vscode-panel-border);
        --accent: var(--vscode-textLink-foreground);
        --danger: var(--vscode-errorForeground);
        --glow-a: rgba(2,132,199,0.12);
        --glow-b: rgba(245,158,11,0.12);
        --button-start: #0284c7;
        --button-end: #f59e0b;
        --surface: color-mix(in srgb, var(--card) 94%, transparent);
        --surface-alt: color-mix(in srgb, var(--bg) 92%, white 8%);
        --surface-deep: color-mix(in srgb, var(--bg) 88%, black 12%);
      }
      body {
        margin: 0;
        padding: 18px;
        font: 13px/1.5 var(--vscode-font-family);
        color: var(--fg);
        background:
          radial-gradient(circle at top left, var(--glow-a), transparent 30%),
          radial-gradient(circle at top right, var(--glow-b), transparent 32%),
          linear-gradient(180deg, color-mix(in srgb, var(--bg) 96%, white 4%), var(--bg));
      }
      .stack { display: grid; gap: 14px; }
      .card {
        border: 1px solid var(--border);
        background: var(--surface);
        border-radius: 14px;
        padding: 16px;
        box-shadow: 0 10px 28px color-mix(in srgb, var(--bg) 88%, transparent);
      }
      h1, h2, h3 { margin: 0 0 10px; }
      h1 { font-size: 17px; line-height: 1.35; }
      h2 { font-size: 14px; color: var(--accent); letter-spacing: 0.01em; }
      p { margin: 0; }
      .muted { color: var(--muted); }
      .danger { color: var(--danger); }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        margin-top: 8px;
      }
      .pill {
        display: inline-flex;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface-alt);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .actions.compact {
        margin-top: 10px;
        gap: 6px;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 7px 12px;
        cursor: pointer;
        color: white;
        background: linear-gradient(135deg, var(--button-start), var(--button-end));
      }
      button.icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
      }
      button.secondary {
        background: var(--surface-alt);
        color: var(--fg);
        border: 1px solid var(--border);
      }
      button:hover {
        filter: brightness(1.04);
      }
      button:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--accent) 72%, white 28%);
        outline-offset: 2px;
      }
      .icon-svg {
        width: 14px;
        height: 14px;
        display: block;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .breadcrumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        color: var(--muted);
      }
      .content {
        overflow-wrap: anywhere;
      }
      .content img, .content video, .content iframe {
        max-width: 100%;
      }
      .content pre {
        white-space: pre-wrap;
        word-break: break-word;
        border-radius: 10px;
        padding: 12px;
        border: 1px solid var(--border);
        background: var(--surface-deep);
      }
      a { color: var(--accent); }
    </style>
  </head>
  <body>
    <div class="stack">
      ${state.lastError ? `<div class="card danger">${escapeHtml(state.lastError)}</div>` : ""}
      ${state.busyMessage ? `<div class="card muted">${escapeHtml(state.busyMessage)}</div>` : ""}
      ${!state.signedIn ? renderSignedOut() : ""}
      ${state.signedIn && !page ? renderEmptyState(state) : ""}
      ${state.signedIn && page ? `
        <section class="card stack">
          <div>
            <h1>${escapeHtml(page.title)}</h1>
            <p class="muted">${escapeHtml(page.url)}</p>
          </div>
          <div class="breadcrumbs">
            ${page.ancestors.length
              ? `${page.ancestors.map((ancestor) => `<span>${escapeHtml(ancestor.title)}</span>`).join("<span>/</span>")}<span>/</span><span>${escapeHtml(page.title)}</span>`
              : `<span>${escapeHtml(page.spaceName ?? page.spaceKey ?? "Confluence")}</span>`}
          </div>
          <div class="meta">
            ${page.spaceName ? `<span class="pill">${escapeHtml(page.spaceName)}</span>` : ""}
            ${page.spaceKey ? `<span class="pill">${escapeHtml(page.spaceKey)}</span>` : ""}
            ${page.versionNumber ? `<span class="pill">v${page.versionNumber}</span>` : ""}
            ${page.updated ? `<span class="pill">${escapeHtml(page.updated)}</span>` : ""}
            ${page.updatedByDisplayName ? `<span class="pill">${escapeHtml(page.updatedByDisplayName)}</span>` : ""}
          </div>
          <div class="actions compact">
            <button
              data-action="exportConfluenceMarkdown"
              class="icon"
              title="Export Markdown"
              aria-label="Export Markdown"
            >${renderExportIcon()}</button>
            <button
              data-action="openSelectedConfluenceInBrowser"
              class="secondary icon"
              title="Open in Browser"
              aria-label="Open in Browser"
            >${renderOpenInBrowserIcon()}</button>
          </div>
        </section>

        <section class="card stack">
          <h2>Preview</h2>
          <p class="muted">This preview renders Confluence HTML directly in the webview. Markdown export uses Confluence export HTML when available, then falls back to the preview body.</p>
          <div class="content">${page.bodyHtml}</div>
        </section>
      ` : ""}
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      for (const element of document.querySelectorAll("[data-action]")) {
        element.addEventListener("click", () => {
          vscode.postMessage({ action: element.getAttribute("data-action") });
        });
      }
    </script>
  </body>
</html>`;
}

function renderSignedOut(): string {
  return `
    <section class="card stack">
      <h1>Connect Atlassian</h1>
      <p class="muted">Use the Sign In button in the Issue Explorer toolbar to configure your Jira Cloud site, email, and API token before browsing Jira and Confluence content.</p>
    </section>
  `;
}

function renderEmptyState(state: AppState): string {
  const scope = state.confluenceSpaces.length
    ? `${state.confluenceSpaces.length} visible spaces`
    : "your visible spaces";

  return `
    <section class="card stack">
      <h1>Select a Confluence page</h1>
      <p class="muted">Use the Space filter in Confluence Explorer to choose from ${escapeHtml(scope)}, then browse or search within the selected spaces and open one page here for preview and export.</p>
    </section>
  `;
}

function renderExportIcon(): string {
  return `
    <svg class="icon-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.5v6"></path>
      <path d="M5.5 6.5 8 9l2.5-2.5"></path>
      <path d="M3 10.5v1A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5v-1"></path>
    </svg>
  `;
}

function renderOpenInBrowserIcon(): string {
  return `
    <svg class="icon-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 3.5H4.5A1.5 1.5 0 0 0 3 5v6A1.5 1.5 0 0 0 4.5 12.5h6A1.5 1.5 0 0 0 12 11V9.5"></path>
      <path d="M8 3.5h4.5V8"></path>
      <path d="M12.5 3.5 7 9"></path>
    </svg>
  `;
}
