export type IssueGroupId = "recommended" | "assigned" | "projects" | "search";

export interface JiraComment {
  id: string;
  authorDisplayName: string;
  bodyText: string;
  bodyHtml: string;
  created: string;
  updated: string;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType?: string;
  size?: number;
  contentUrl?: string;
}

export interface JiraIssueSummary {
  id: string;
  key: string;
  summary: string;
  status: string;
  projectKey: string;
  issueType?: string;
  assigneeAccountId?: string;
  assigneeDisplayName?: string;
  updated: string;
  descriptionText?: string;
  url: string;
  rankingReason?: string;
  lexicalScore?: number;
  semanticScore?: number;
}

export interface JiraIssueDetail extends JiraIssueSummary {
  descriptionText: string;
  descriptionHtml: string;
  priority?: string;
  labels: string[];
  comments: JiraComment[];
  attachments: JiraAttachment[];
  acceptanceCriteriaText?: string;
  reproductionStepsText?: string;
  environmentText?: string;
}

export interface IssueGroup {
  id: IssueGroupId;
  label: string;
  issues: JiraIssueSummary[];
}

export interface JiraProjectSummary {
  id: string;
  key: string;
  name: string;
}

export interface JiraProjectAssigneeOption {
  accountId: string;
  displayName: string;
}

export interface JiraProjectFilterSelection {
  issueType?: string;
  status?: string;
  assigneeAccountId?: string;
  query?: string;
}

export interface JiraProjectExplorerState {
  project: JiraProjectSummary;
  isLoaded: boolean;
  browseIssues: JiraIssueSummary[];
}

export interface ConfluenceSpaceSummary {
  id: string;
  key: string;
  name: string;
  type?: string;
  category: "project" | "personal";
  homepageId?: string;
  url: string;
}

export interface ConfluencePageSummary {
  id: string;
  title: string;
  spaceId: string;
  spaceKey?: string;
  spaceName?: string;
  contentType?: string;
  status: string;
  updated: string;
  url: string;
  excerpt?: string;
  parentId?: string;
  hasChildren?: boolean;
}

export interface ConfluencePageBreadcrumb {
  id: string;
  title: string;
  url: string;
}

export interface ConfluencePageDetail extends ConfluencePageSummary {
  bodyHtml: string;
  bodyExportHtml?: string;
  bodyText: string;
  versionNumber?: number;
  updatedByDisplayName?: string;
  ancestors: ConfluencePageBreadcrumb[];
}

export interface ScoreBreakdownItem {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  rationale: string;
}

export interface RuleScoreResult {
  totalScore: number;
  missingInfo: string[];
  breakdown: ScoreBreakdownItem[];
}

export interface SemanticScoreResult {
  semanticDelta: number;
  missingInfo: string[];
  suggestedQuestions: string[];
  confidence: number;
  summary?: string;
}

export interface IssueScoringResult {
  threshold: number;
  ruleScore: number;
  totalScore: number;
  passesThreshold: boolean;
  breakdown: ScoreBreakdownItem[];
  missingInfo: string[];
  suggestedQuestions: string[];
  semantic: SemanticScoreResult;
}

export interface CodeSnippet {
  path: string;
  language?: string;
  content: string;
  source: "selection" | "cursor";
}

export interface WorkspaceContext {
  workspaceRoot: string;
  repoName: string;
  readmeExcerpt: string;
  currentBranch?: string;
  recentDiffFiles: string[];
  activeFile?: string;
  codeSnippets: CodeSnippet[];
  searchTerms: string[];
}

export interface HandoffArtifacts {
  folderPath: string;
  readmePath: string;
  promptPath: string;
  taskPath: string;
  readmeMarkdown: string;
  promptText: string;
  taskJson: string;
  branchName: string;
}

export interface JiraAuthSession {
  siteUrl: string;
  email: string;
  accountId?: string;
  accountDisplayName?: string;
}

export interface JiraDriverSettings {
  siteUrl: string;
  authEmail: string;
  defaultProjects: string[];
  savedJqls: string[];
  confluenceSpaceKeys: string[];
  aiBaseUrl: string;
  aiChatModel: string;
  aiEmbeddingModel?: string;
  aiIncludeCodeContext: boolean;
  aiMaxSnippetCount: number;
  scoreThreshold: number;
}

export interface AppState {
  signedIn: boolean;
  groups: IssueGroup[];
  jiraProjects: JiraProjectExplorerState[];
  selectedProjectKeys: string[];
  issueExplorerFilters: JiraProjectFilterSelection;
  issueSearchResults?: JiraIssueSummary[];
  confluenceSpaces: ConfluenceSpaceSummary[];
  selectedConfluenceSpaceKeys: string[];
  confluenceSearchQuery?: string;
  confluenceSearchResults: ConfluencePageSummary[];
  selectedIssue?: JiraIssueDetail;
  selectedConfluencePage?: ConfluencePageDetail;
  selectedIssueScore?: IssueScoringResult;
  commentDraft?: string;
  handoffArtifacts?: HandoffArtifacts;
  busyMessage?: string;
  lastError?: string;
}
