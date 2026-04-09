import { IssueScoringResult, JiraIssueDetail } from "../models";
import { detectLanguage } from "../utils/strings";

export function buildMoreInfoComment(issue: JiraIssueDetail, scoring: IssueScoringResult): string {
  const language = detectLanguage(`${issue.summary}\n${issue.descriptionText}`);
  const missingInfo = scoring.missingInfo.length ? scoring.missingInfo : ["问题描述", "验收标准"];
  const suggestedQuestions = scoring.suggestedQuestions.slice(0, 5);

  if (language === "zh") {
    return [
      `感谢提交 ${issue.key}。为了让自动修复流程准确推进，当前信息完整度评分为 ${scoring.totalScore}/${100}，还需要补充以下内容：`,
      "",
      ...missingInfo.map((item) => `- ${item}`),
      ...(suggestedQuestions.length
        ? [
            "",
            "建议补充回答的问题：",
            ...suggestedQuestions.map((question, index) => `${index + 1}. ${question}`),
          ]
        : []),
      "",
      "补充完成后请更新此 Jira，我们会继续推进后续自动修复流程。",
    ].join("\n");
  }

  return [
    `Thanks for filing ${issue.key}. The current issue quality score is ${scoring.totalScore}/100, and we still need a bit more detail before the automated fix workflow can continue.`,
    "",
    "Please add:",
    ...missingInfo.map((item) => `- ${item}`),
    ...(suggestedQuestions.length
      ? [
          "",
          "Helpful follow-up questions:",
          ...suggestedQuestions.map((question, index) => `${index + 1}. ${question}`),
        ]
      : []),
    "",
    "Once the details are updated, we can continue the AI-assisted fix flow.",
  ].join("\n");
}
