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
        --border: var(--vscode-panel-border);
        --card: color-mix(in srgb, var(--bg) 88%, white 12%);
        --accent: var(--vscode-textLink-foreground);
        --danger: var(--vscode-errorForeground);
      }
      body {
        margin: 0;
        padding: 18px;
        font: 13px/1.6 var(--vscode-font-family);
        color: var(--fg);
        background: radial-gradient(circle at top left, rgba(34,197,94,0.12), transparent 32%), radial-gradient(circle at top right, rgba(59,130,246,0.12), transparent 34%), var(--bg);
      }
      .stack { display: grid; gap: 14px; }
      .card {
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--card) 92%, transparent);
        border-radius: 12px;
        padding: 14px;
      }
      h1, h2, h3 { margin: 0 0 10px; }
      h1 { font-size: 18px; }
      h2 { font-size: 14px; color: var(--accent); }
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
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--bg) 92%, white 8%);
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
        background: linear-gradient(135deg, #059669, #2563eb);
      }
      button.compact {
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.2;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
      }
      button.icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        padding: 0;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
      }
      button.secondary {
        background: color-mix(in srgb, var(--bg) 82%, white 18%);
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
        background: color-mix(in srgb, var(--bg) 88%, black 12%);
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
    ? `${state.confluenceSpaces.length} configured spaces`
    : "your visible spaces";

  return `
    <section class="card stack">
      <h1>Select a Confluence page</h1>
      <p class="muted">Use the Confluence Explorer toolbar to refresh ${escapeHtml(scope)} or search for a page, then open one result here for preview and export.</p>
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
