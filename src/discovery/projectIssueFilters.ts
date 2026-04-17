import {
  JiraIssueSummary,
  JiraProjectAssigneeOption,
  JiraProjectExplorerState,
  JiraProjectFilterSelection,
} from "../models";
import { uniqueNonEmpty } from "../utils/strings";

export const UNASSIGNED_ASSIGNEE_ACCOUNT_ID = "__unassigned__";

export function buildProjectFilterOptions(issues: JiraIssueSummary[]): {
  issueTypes: string[];
  statuses: string[];
  assignees: JiraProjectAssigneeOption[];
} {
  const issueTypes = uniqueNonEmpty(issues.map((issue) => issue.issueType ?? ""));
  const statuses = uniqueNonEmpty(issues.map((issue) => issue.status ?? ""));
  const assignees = new Map<string, JiraProjectAssigneeOption>();

  for (const issue of issues) {
    if (issue.assigneeAccountId && issue.assigneeDisplayName) {
      assignees.set(issue.assigneeAccountId, {
        accountId: issue.assigneeAccountId,
        displayName: issue.assigneeDisplayName,
      });
      continue;
    }

    if (!issue.assigneeAccountId && !issue.assigneeDisplayName) {
      assignees.set(UNASSIGNED_ASSIGNEE_ACCOUNT_ID, {
        accountId: UNASSIGNED_ASSIGNEE_ACCOUNT_ID,
        displayName: "Unassigned",
      });
    }
  }

  return {
    issueTypes,
    statuses,
    assignees: [...assignees.values()].sort((left, right) => left.displayName.localeCompare(right.displayName)),
  };
}

export function collectSelectedProjectBrowseIssues(
  projects: JiraProjectExplorerState[],
  selectedProjectKeys: string[],
): JiraIssueSummary[] {
  const selectedKeys = new Set(selectedProjectKeys);
  const issues = projects
    .filter((project) => selectedKeys.has(project.project.key))
    .flatMap((project) => project.browseIssues);

  return sortIssuesByUpdated(dedupeIssues(issues));
}

export function getSelectedProjectFilterOptions(
  projects: JiraProjectExplorerState[],
  selectedProjectKeys: string[],
): {
  issueTypes: string[];
  statuses: string[];
  assignees: JiraProjectAssigneeOption[];
} {
  return buildProjectFilterOptions(collectSelectedProjectBrowseIssues(projects, selectedProjectKeys));
}

export function buildVisibleIssueList(
  browseIssues: JiraIssueSummary[],
  filters: JiraProjectFilterSelection,
  searchIssues?: JiraIssueSummary[],
): JiraIssueSummary[] {
  const sourceIssues = filters.query?.trim() ? (searchIssues ?? []) : browseIssues;
  return applyProjectIssueFilters(sourceIssues, filters);
}

export function applyProjectIssueFilters(
  issues: JiraIssueSummary[],
  filters: JiraProjectFilterSelection,
): JiraIssueSummary[] {
  const query = filters.query?.trim().toLowerCase();

  return issues.filter((issue) => {
    if (filters.issueType && issue.issueType !== filters.issueType) {
      return false;
    }

    if (filters.status && issue.status !== filters.status) {
      return false;
    }

    if (filters.assigneeAccountId) {
      if (filters.assigneeAccountId === UNASSIGNED_ASSIGNEE_ACCOUNT_ID) {
        if (issue.assigneeAccountId || issue.assigneeDisplayName) {
          return false;
        }
      } else if (issue.assigneeAccountId !== filters.assigneeAccountId) {
        return false;
      }
    }

    if (!query) {
      return true;
    }

    const haystack = [
      issue.key,
      issue.summary,
      issue.status,
      issue.issueType,
      issue.assigneeDisplayName,
      issue.descriptionText,
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function sanitizeProjectFilters(
  filters: JiraProjectFilterSelection,
  assignees: JiraProjectAssigneeOption[],
  issueTypes: string[],
  statuses: string[],
): JiraProjectFilterSelection {
  return {
    issueType: filters.issueType && issueTypes.includes(filters.issueType) ? filters.issueType : undefined,
    status: filters.status && statuses.includes(filters.status) ? filters.status : undefined,
    assigneeAccountId: filters.assigneeAccountId
      && assignees.some((assignee) => assignee.accountId === filters.assigneeAccountId)
      ? filters.assigneeAccountId
      : undefined,
    query: filters.query?.trim() || undefined,
  };
}

function dedupeIssues(issues: JiraIssueSummary[]): JiraIssueSummary[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.key)) {
      return false;
    }

    seen.add(issue.key);
    return true;
  });
}

function sortIssuesByUpdated(issues: JiraIssueSummary[]): JiraIssueSummary[] {
  return [...issues].sort((left, right) => {
    const leftTime = Date.parse(left.updated || "");
    const rightTime = Date.parse(right.updated || "");

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    if (left.projectKey !== right.projectKey) {
      return left.projectKey.localeCompare(right.projectKey);
    }

    return left.key.localeCompare(right.key);
  });
}
