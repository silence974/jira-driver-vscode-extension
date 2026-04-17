import { AppState } from "../models";
import { escapeHtml } from "../utils/strings";

export function renderIssueDetailHtml(state: AppState, nonce: string): string {
  const issue = state.selectedIssue;
  const score = state.selectedIssueScore;
  const promptPreview = state.handoffArtifacts?.promptText ?? "";

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
        --glow-a: rgba(2,132,199,0.12);
        --glow-b: rgba(245,158,11,0.12);
        --button-start: #0284c7;
        --button-end: #f59e0b;
        --surface: color-mix(in srgb, var(--card) 94%, transparent);
        --surface-alt: color-mix(in srgb, var(--bg) 92%, white 8%);
        --surface-deep: color-mix(in srgb, var(--bg) 88%, black 12%);
      }
      html {
        min-height: 100%;
        background: var(--bg);
      }
      body {
        margin: 0;
        padding: 18px;
        min-height: 100vh;
        box-sizing: border-box;
        position: relative;
        isolation: isolate;
        font: 13px/1.5 var(--vscode-font-family);
        color: var(--fg);
        background: transparent;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background:
          radial-gradient(circle at top left, var(--glow-a), transparent 30%),
          radial-gradient(circle at top right, var(--glow-b), transparent 32%),
          linear-gradient(180deg, color-mix(in srgb, var(--bg) 96%, white 4%), var(--bg));
        background-repeat: no-repeat;
        background-size: 140% 140%, 140% 140%, 100% 100%;
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
      textarea {
        width: 100%;
        min-height: 140px;
        margin-top: 8px;
        border-radius: 10px;
        border: 1px solid var(--border);
        padding: 10px;
        background: var(--surface-alt);
        color: var(--fg);
        resize: vertical;
        box-sizing: border-box;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        border-radius: 10px;
        padding: 12px;
        border: 1px solid var(--border);
        background: var(--surface-deep);
        margin: 0;
      }
      ul, ol { margin: 0; padding-left: 20px; }
      .score {
        font-size: 28px;
        font-weight: 700;
      }
      .danger { color: var(--danger); }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 6px 0;
        border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
      }
    </style>
  </head>
  <body>
    <div class="stack">
      ${state.lastError ? `<div class="card danger">${escapeHtml(state.lastError)}</div>` : ""}
      ${state.busyMessage ? `<div class="card muted">${escapeHtml(state.busyMessage)}</div>` : ""}
      ${!state.signedIn ? renderSignedOut() : ""}
      ${state.signedIn && !issue ? renderEmptyState() : ""}
      ${state.signedIn && issue ? `
        <section class="card">
          <h1>${escapeHtml(issue.key)} · ${escapeHtml(issue.summary)}</h1>
          <p class="muted">${escapeHtml(issue.url)}</p>
          <div class="meta">
            <span class="pill">${escapeHtml(issue.status)}</span>
            <span class="pill">${escapeHtml(issue.projectKey)}</span>
            ${issue.assigneeDisplayName ? `<span class="pill">${escapeHtml(issue.assigneeDisplayName)}</span>` : ""}
            ${issue.priority ? `<span class="pill">${escapeHtml(issue.priority)}</span>` : ""}
          </div>
          <div class="actions compact">
            <button
              data-action="scoreIssue"
              class="icon"
              title="Score Issue"
              aria-label="Score Issue"
            >${renderScoreIcon()}</button>
            <button
              data-action="prepareAiFix"
              class="icon"
              title="Prepare AI Fix"
              aria-label="Prepare AI Fix"
            >${renderPrepareAiFixIcon()}</button>
          </div>
        </section>

        <section class="card stack">
          <h2>Description</h2>
          <div>${issue.descriptionHtml || `<p class="muted">No description available.</p>`}</div>
        </section>

        <section class="card stack">
          <h2>Score</h2>
          ${score ? `
            <div class="score">${score.totalScore}/100</div>
            <p class="muted">Rule score ${score.ruleScore}/100 · Semantic delta ${score.semantic.semanticDelta >= 0 ? "+" : ""}${score.semantic.semanticDelta}</p>
            <table>
              <thead>
                <tr><th>Category</th><th>Score</th><th>Notes</th></tr>
              </thead>
              <tbody>
                ${score.breakdown.map((item) => `
                  <tr>
                    <td>${escapeHtml(item.label)}</td>
                    <td>${item.score}/${item.maxScore}</td>
                    <td>${escapeHtml(item.rationale)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
            <div class="stack">
              <div>
                <h3>Missing Info</h3>
                ${score.missingInfo.length ? `<ul>${score.missingInfo.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">No major gaps detected.</p>`}
              </div>
              <div>
                <h3>Suggested Questions</h3>
                ${score.suggestedQuestions.length ? `<ol>${score.suggestedQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : `<p class="muted">No follow-up questions generated.</p>`}
              </div>
            </div>
          ` : `<p class="muted">Run “Score Issue” to evaluate whether this Jira is ready for AI automation.</p>`}
        </section>

        <section class="card stack">
          <h2>Request More Info</h2>
          <p class="muted">Low-score issues should be sent back with a clear comment draft before AI handoff starts.</p>
          <textarea id="commentDraft" placeholder="The draft comment will appear here...">${escapeHtml(state.commentDraft ?? "")}</textarea>
          <div class="actions">
            <button data-action="requestMoreInfo">Post Comment to Jira</button>
          </div>
        </section>

        <section class="card stack">
          <h2>AI Handoff</h2>
          ${state.handoffArtifacts ? `
            <p class="muted">${escapeHtml(state.handoffArtifacts.readmePath)}</p>
            <p class="muted">The startup prompt is copied to your clipboard automatically when handoff files are generated.</p>
            <pre>${escapeHtml(promptPreview)}</pre>
            <div class="actions">
              <button data-action="openPrompt" class="secondary">Open Prompt</button>
            </div>
          ` : `<p class="muted">Prepare AI Fix to generate README, prompt, and task metadata under <code>.jira-driver/tasks/&lt;ISSUE_KEY&gt;</code>.</p>`}
        </section>
      ` : ""}
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const readDraft = () => {
        const draft = document.getElementById("commentDraft");
        return draft ? draft.value : undefined;
      };
      for (const element of document.querySelectorAll("[data-action]")) {
        element.addEventListener("click", () => {
          const action = element.getAttribute("data-action");
          vscode.postMessage({ action, draft: action === "requestMoreInfo" ? readDraft() : undefined });
        });
      }
    </script>
  </body>
</html>`;
}

function renderSignedOut(): string {
  return `
    <section class="card stack">
      <h1>Connect Jira</h1>
      <p class="muted">Use the Sign In button in the Issue Explorer toolbar to configure jiraDriver.siteUrl, jiraDriver.auth.email, and your Jira API token/API key.</p>
    </section>
  `;
}

function renderEmptyState(): string {
  return `
    <section class="card stack">
      <h1>Select a Jira issue</h1>
      <p class="muted">Use Issue Explorer to refresh, search, and select a Jira issue. Its detail, score, comment draft, and AI handoff preview will appear here.</p>
    </section>
  `;
}

function renderScoreIcon(): string {
  return `
    <svg class="icon-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 12.5h10"></path>
      <path d="M5 10V7.5"></path>
      <path d="M8 10V4.5"></path>
      <path d="M11 10V6"></path>
    </svg>
  `;
}

function renderPrepareAiFixIcon(): string {
  return `
    <svg class="icon-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.5v11"></path>
      <path d="M2.5 8h11"></path>
      <path d="M4.5 4.5 6 6"></path>
      <path d="M10 10l1.5 1.5"></path>
    </svg>
  `;
}
