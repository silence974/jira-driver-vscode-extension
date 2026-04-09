import { JiraIssueDetail, RuleScoreResult, ScoreBreakdownItem } from "../models";
import { uniqueNonEmpty } from "../utils/strings";

const ACCEPTANCE_KEYWORDS = [
  "acceptance criteria",
  "done when",
  "验收标准",
  "完成标准",
  "given",
  "when",
  "then",
];

const REPRO_KEYWORDS = [
  "steps to reproduce",
  "reproduce",
  "复现步骤",
  "重现",
  "重现步骤",
];

const EXPECTED_ACTUAL_KEYWORDS = [
  "expected",
  "actual",
  "期望",
  "实际",
  "当前表现",
  "应该",
];

const ENVIRONMENT_KEYWORDS = [
  "version",
  "browser",
  "os",
  "device",
  "environment",
  "版本",
  "环境",
  "系统",
  "设备",
];

const EVIDENCE_KEYWORDS = [
  "log",
  "trace",
  "screenshot",
  "video",
  "stack",
  "截图",
  "日志",
  "录屏",
  "堆栈",
];

const SCOPE_KEYWORDS = [
  "impact",
  "scope",
  "risk",
  "regression",
  "影响",
  "范围",
  "风险",
  "回归",
];

export function scoreIssueByRules(issue: JiraIssueDetail): RuleScoreResult {
  const description = `${issue.descriptionText}\n${issue.comments.map((comment) => comment.bodyText).join("\n")}`;
  const lowerDescription = description.toLowerCase();
  const lowerSummary = issue.summary.toLowerCase();

  const breakdown: ScoreBreakdownItem[] = [
    scoreTitle(lowerSummary, issue.summary),
    scoreDescription(description),
    scoreStructuredSection("reproduction", "复现步骤", 15, issue.reproductionStepsText ?? description, lowerDescription, REPRO_KEYWORDS),
    scoreStructuredSection("expectedActual", "期望/实际行为", 15, description, lowerDescription, EXPECTED_ACTUAL_KEYWORDS),
    scoreStructuredSection("acceptanceCriteria", "验收标准", 15, issue.acceptanceCriteriaText ?? description, lowerDescription, ACCEPTANCE_KEYWORDS),
    scoreStructuredSection("environment", "环境/版本", 10, issue.environmentText ?? description, lowerDescription, ENVIRONMENT_KEYWORDS),
    scoreEvidence(issue, lowerDescription),
    scoreStructuredSection("scopeRisk", "范围/风险", 5, description, lowerDescription, SCOPE_KEYWORDS),
  ];

  const totalScore = breakdown.reduce((total, item) => total + item.score, 0);
  const missingInfo = uniqueNonEmpty(
    breakdown
      .filter((item) => item.score < item.maxScore * 0.6)
      .map((item) => item.label),
  );

  return { totalScore, breakdown, missingInfo };
}

function scoreTitle(lowerSummary: string, originalSummary: string): ScoreBreakdownItem {
  let score = 0;
  const reasons: string[] = [];

  if (originalSummary.trim().length >= 8) {
    score += 3;
    reasons.push("标题长度基本足够");
  }

  if (originalSummary.trim().length >= 16 && originalSummary.trim().length <= 120) {
    score += 4;
    reasons.push("标题长度适中");
  }

  if (!/^(bug|issue|problem|fix|问题|报错)$/i.test(lowerSummary.trim())) {
    score += 3;
    reasons.push("标题不算过于笼统");
  }

  return {
    id: "title",
    label: "标题清晰度",
    maxScore: 10,
    score,
    rationale: reasons.join("；") || "标题过短或过于泛化。",
  };
}

function scoreDescription(description: string): ScoreBreakdownItem {
  let score = 0;
  const normalized = description.trim();
  const lines = normalized.split(/\n+/).filter(Boolean).length;
  const reasons: string[] = [];

  if (normalized.length >= 80) {
    score += 8;
    reasons.push("描述长度足够");
  }

  if (normalized.length >= 220) {
    score += 6;
    reasons.push("问题背景较完整");
  }

  if (lines >= 3) {
    score += 3;
    reasons.push("描述有一定结构");
  }

  if (/[.!?。！？]/.test(normalized)) {
    score += 3;
    reasons.push("描述具有完整语句");
  }

  return {
    id: "description",
    label: "问题描述",
    maxScore: 20,
    score,
    rationale: reasons.join("；") || "缺少足够的问题背景和上下文。",
  };
}

function scoreStructuredSection(
  id: string,
  label: string,
  maxScore: number,
  sourceText: string,
  descriptionLowerText: string,
  keywords: string[],
): ScoreBreakdownItem {
  let score = 0;
  const reasons: string[] = [];
  const lowerSource = sourceText.toLowerCase();

  if (containsAny(descriptionLowerText, keywords)) {
    score += Math.round(maxScore * 0.5);
    reasons.push("包含明显的结构化提示词");
  }

  if (sourceText.trim().length >= 60) {
    score += Math.round(maxScore * 0.3);
    reasons.push("内容长度基本足够");
  }

  if (/[0-9]/.test(sourceText) || /[,/]/.test(sourceText)) {
    score += Math.round(maxScore * 0.2);
    reasons.push("包含具体版本、环境或步骤细节");
  }

  if (/(^|\n)([-*]|\d+\.)\s+/m.test(sourceText) || lowerSource.includes(":\n")) {
    score += maxScore - score;
    reasons.push("具备清晰步骤或条目结构");
  }

  return {
    id,
    label,
    maxScore,
    score: Math.min(maxScore, score),
    rationale: reasons.join("；") || "尚未看到足够清晰的结构化信息。",
  };
}

function scoreEvidence(issue: JiraIssueDetail, lowerDescription: string): ScoreBreakdownItem {
  let score = 0;
  const reasons: string[] = [];

  if (issue.attachments.length > 0) {
    score += 5;
    reasons.push("包含附件");
  }

  if (/https?:\/\//.test(lowerDescription)) {
    score += 3;
    reasons.push("包含链接或外部证据");
  }

  if (containsAny(lowerDescription, EVIDENCE_KEYWORDS)) {
    score += 2;
    reasons.push("提到了日志、截图或堆栈等证据");
  }

  return {
    id: "evidence",
    label: "证据/链接",
    maxScore: 10,
    score: Math.min(10, score),
    rationale: reasons.join("；") || "缺少日志、截图、链接或其他佐证材料。",
  };
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}
