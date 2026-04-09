import { strict as assert } from "node:assert";

import { mergeScoringResults, parseSemanticScoringResponse } from "../scoring/llmScorer";

describe("LLM scoring helpers", () => {
  it("parses semantic scoring JSON", () => {
    const parsed = parseSemanticScoringResponse(`{
      "semantic_delta": 7,
      "missing_info": ["复现步骤"],
      "suggested_questions": ["能否提供触发路径？"],
      "confidence": 0.82,
      "summary": "结构较完整但缺少复现路径"
    }`);

    assert.equal(parsed.semanticDelta, 7);
    assert.deepEqual(parsed.missingInfo, ["复现步骤"]);
    assert.deepEqual(parsed.suggestedQuestions, ["能否提供触发路径？"]);
    assert.equal(parsed.confidence, 0.82);
  });

  it("merges rule and semantic scores with clamping", () => {
    const merged = mergeScoringResults(
      {
        totalScore: 95,
        missingInfo: ["环境/版本"],
        breakdown: [],
      },
      {
        semanticDelta: 10,
        missingInfo: ["验收标准"],
        suggestedQuestions: ["版本号是多少？"],
        confidence: 1,
      },
      75,
    );

    assert.equal(merged.totalScore, 100);
    assert.equal(merged.passesThreshold, true);
    assert.deepEqual(merged.missingInfo.sort(), ["环境/版本", "验收标准"].sort());
  });
});
