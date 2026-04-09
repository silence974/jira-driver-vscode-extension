import { WorkspaceContext } from "../models";
import { uniqueNonEmpty } from "../utils/strings";

export function buildAssignedIssuesJql(): string {
  return "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
}

export function buildProjectIssuesJql(projects: string[]): string {
  const escapedProjects = uniqueNonEmpty(projects).map((project) => `"${escapeJqlValue(project)}"`);
  if (!escapedProjects.length) {
    return "statusCategory != Done ORDER BY updated DESC";
  }

  return `project in (${escapedProjects.join(", ")}) AND statusCategory != Done ORDER BY updated DESC`;
}

export function buildKeywordSearchJql(query: string, projects: string[] = []): string {
  const tokens = uniqueNonEmpty(tokenizeQuery(query));
  const textClauses = tokens.length
    ? tokens.map((token) => `text ~ "\\\"${escapeJqlValue(token)}\\\""`).join(" OR ")
    : `text ~ "\\\"${escapeJqlValue(query.trim())}\\\""`;

  const clauses = ["statusCategory != Done"];
  if (projects.length) {
    const projectClause = buildProjectClause(projects);
    if (projectClause) {
      clauses.push(projectClause);
    }
  }
  clauses.push(`(${textClauses})`);

  return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}

export function deriveWorkspaceSearchTerms(context: WorkspaceContext): string[] {
  const repoTerms = tokenizeQuery(context.repoName);
  const branchTerms = tokenizeQuery(context.currentBranch ?? "");
  const fileTerms = context.recentDiffFiles.flatMap((file) => tokenizeQuery(file));
  const readmeTerms = tokenizeQuery(context.readmeExcerpt);

  return uniqueNonEmpty([
    ...context.searchTerms,
    ...repoTerms,
    ...branchTerms,
    ...fileTerms,
    ...readmeTerms,
  ]).filter((term) => term.length > 2).slice(0, 12);
}

function buildProjectClause(projects: string[]): string | undefined {
  const escapedProjects = uniqueNonEmpty(projects).map((project) => `"${escapeJqlValue(project)}"`);
  if (!escapedProjects.length) {
    return undefined;
  }

  return `project in (${escapedProjects.join(", ")})`;
}

function tokenizeQuery(value: string): string[] {
  return value
    .split(/[^a-zA-Z0-9\u3400-\u9FBF]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function escapeJqlValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
