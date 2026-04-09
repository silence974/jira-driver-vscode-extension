# Jira Driver VS Code Extension

Jira Driver is a VS Code extension MVP for a Jira-driven AI workflow:

- Sign in to Jira Cloud with `siteUrl + email + API token`
- Discover relevant Jira issues in a dedicated Activity Bar view
- Score issue readiness with rule-based + LLM semantic analysis
- Send low-quality issues back with a generated comment draft
- Generate AI handoff materials so Codex or another AI plugin can start from a short prompt

## Implemented MVP

- `Jira Driver` Activity Bar with:
  - `Issue Explorer` TreeView
  - `Issue Detail` Webview
- Jira groups:
  - `Recommended`
  - `Assigned to Me`
  - `Project Results`
  - `Search Results`
- Atlassian Cloud auth flow:
  - configurable `jiraDriver.siteUrl`
  - configurable `jiraDriver.auth.email`
  - secure Jira API token/API key stored in VS Code SecretStorage
- Jira discovery:
  - my assigned issues
  - default project filtering
  - saved JQL support
  - keyword search + semantic reranking
- Scoring:
  - fixed rule score out of 100
  - optional OpenAI-compatible semantic delta
  - threshold-based gating for AI handoff
- AI handoff:
  - `.jira-driver/tasks/<ISSUE_KEY>/README.md`
  - `.jira-driver/tasks/<ISSUE_KEY>/prompt.md`
  - `.jira-driver/tasks/<ISSUE_KEY>/task.json`

## Configuration

Set these in VS Code settings:

- `jiraDriver.siteUrl`
- `jiraDriver.auth.email`
- `jiraDriver.discovery.defaultProjects`
- `jiraDriver.discovery.savedJqls`
- `jiraDriver.ai.baseUrl`
- `jiraDriver.ai.chatModel`
- `jiraDriver.ai.embeddingModel`
- `jiraDriver.ai.includeCodeContext`
- `jiraDriver.ai.maxSnippetCount`
- `jiraDriver.workflow.scoreThreshold`

Store the AI API key with the command:

- `Jira Driver: Set AI API Key`

## Commands

- `Jira Driver: Sign In`
- `Jira Driver: Sign Out`
- `Jira Driver: Refresh Issues`
- `Jira Driver: Search Issues`
- `Jira Driver: Score Issue`
- `Jira Driver: Request More Info`
- `Jira Driver: Prepare AI Fix`
- `Jira Driver: Set AI API Key`

## Development

```bash
npm install
npm test
```

The extension is compiled with plain TypeScript into `dist/`.

### Local F5 Debugging

This repo now includes ready-to-use VS Code debug configs in `.vscode/`.

1. Open this repository in VS Code.
2. Run `npm install` once.
3. Press `F5`.
4. Choose `Run Jira Driver Extension`.
5. A new `Extension Development Host` window will open with the extension loaded.

Notes:

- The debug window now opens the current repository as its workspace.
- `F5` starts `npm: watch` automatically, so TypeScript recompiles while you edit.
- If you only want a one-shot build, run the task `npm: compile`.
- If you want to run tests manually, use the task `npm: test` or run `npm test` in the terminal.
- On first sign-in, the extension will prompt for `jiraDriver.siteUrl`, `jiraDriver.auth.email`, and the Jira API token/API key if they are not configured yet.

## Current Limits

- Atlassian Cloud only
- single-root workspace only
- no direct automation of external AI plugins yet
- UI smoke coverage is currently pure-render testing rather than full VS Code integration automation
- Jira authentication now uses a Jira Cloud API token/API key for REST access
