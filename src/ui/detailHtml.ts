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
        --card: color-mix(in srgb, var(--bg) 88%, white 12%);
        --border: var(--vscode-panel-border);
        --accent: var(--vscode-textLink-foreground);
        --danger: var(--vscode-errorForeground);
      }
      body {
        margin: 0;
        padding: 18px;
        font: 13px/1.5 var(--vscode-font-family);
        color: var(--fg);
        background: radial-gradient(circle at top left, rgba(56,189,248,0.12), transparent 30%), radial-gradient(circle at top right, rgba(245,158,11,0.12), transparent 32%), var(--bg);
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
      button {
        border: 0;
        border-radius: 999px;
        padding: 7px 12px;
        cursor: pointer;
        color: white;
        background: linear-gradient(135deg, #0284c7, #f59e0b);
      }
      button.secondary {
        background: color-mix(in srgb, var(--bg) 82%, white 18%);
        color: var(--fg);
        border: 1px solid var(--border);
      }
      textarea {
        width: 100%;
        min-height: 140px;
        margin-top: 8px;
        border-radius: 10px;
        border: 1px solid var(--border);
        padding: 10px;
        background: color-mix(in srgb, var(--bg) 92%, black 8%);
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
        background: color-mix(in srgb, var(--bg) 88%, black 12%);
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
        </section>

        <section class="card stack">
          <div class="actions">
            <button data-action="scoreIssue">Score Issue</button>
            <button data-action="prepareAiFix">Prepare AI Fix</button>
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
