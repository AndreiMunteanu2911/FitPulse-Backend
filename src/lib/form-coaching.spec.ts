import { generateFormCoaching } from "./form-coaching";
import { callOpenRouter } from "./ai";
import type { FormCoachingRequestInput } from "./validations";

jest.mock("./ai", () => ({
  callOpenRouter: jest.fn(),
}));

const analysis: FormCoachingRequestInput["analysis"] = {
  score: 72,
  realtime_score: 76,
  postset_score: 72,
  reps: 3,
  duration_ms: 10_000,
  detector_version: "test",
  rules_version: "test",
  rules_confidence: 0.8,
  analysis_status: "local_only",
  feedback_summary: "Depth was inconsistent.",
  feedback_json: {
    topIssues: [{ type: "warning", message: "Reach full depth", source: "rule" }],
    realtime: [],
    postset: [{ type: "warning", message: "Slow down the lowering phase", source: "tempo" }],
    coaching: null,
  },
  rep_metrics_json: [
    {
      repIndex: 1,
      startMs: 0,
      endMs: 1000,
      durationMs: 1000,
      eccentricMs: 300,
      concentricMs: 300,
      topPauseMs: 0,
      bottomPauseMs: 0,
      minAngle: 80,
      maxAngle: 120,
      score: 72,
      feedback: [],
      tempoFlags: ["eccentric_too_fast"],
    },
  ],
  worst_segment_json: null,
  used_cloud_coach: false,
  cloud_model: null,
};

describe("generateFormCoaching", () => {
  beforeEach(() => {
    jest.mocked(callOpenRouter).mockReset();
  });

  it("parses valid fenced JSON from the model", async () => {
    jest.mocked(callOpenRouter).mockResolvedValue(`\`\`\`json
{
  "summary": "Keep the descent controlled and finish each rep at consistent depth.",
  "top_cues": ["Slow down the lowering phase", "Keep each rep depth consistent"],
  "rep_observations": ["The first rep was the cleanest", "Later reps rushed the descent"],
  "confidence": 0.82,
  "needs_human_rule_review": false
}
\`\`\``);

    const result = await generateFormCoaching({
      exerciseName: "Squat",
      formRules: null,
      analysis,
    });

    expect(result).toEqual({
      summary: "Keep the descent controlled and finish each rep at consistent depth.",
      top_cues: ["Slow down the lowering phase", "Keep each rep depth consistent"],
      rep_observations: ["The first rep was the cleanest", "Later reps rushed the descent"],
      confidence: 0.82,
      needs_human_rule_review: false,
    });
    expect(callOpenRouter).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ role: "system" }),
      expect.objectContaining({ role: "user", content: expect.stringContaining("Squat") }),
    ]), expect.objectContaining({
      temperature: 0.2,
      maxTokens: 2200,
      reasoning: { effort: "medium" },
      responseFormat: expect.objectContaining({ type: "json_schema" }),
    }));
  });

  it("normalizes malformed but parseable model JSON into the expected shape", async () => {
    jest.mocked(callOpenRouter).mockResolvedValue(JSON.stringify({
      summary: "x".repeat(700),
      top_cues: ["  Control the rep  ", 123, "y".repeat(200)],
      rep_observations: "not-array",
      confidence: 2,
      needs_human_rule_review: "no",
    }));

    const result = await generateFormCoaching({
      exerciseName: "Bench Press",
      formRules: null,
      analysis,
    });

    expect(result.summary).toHaveLength(500);
    expect(result.top_cues).toHaveLength(3);
    expect(result.top_cues[0]).toBe("Control the rep");
    expect(result.top_cues[2]).toHaveLength(200);
    expect(result.rep_observations).toEqual([]);
    expect(result.confidence).toBe(1);
    expect(result.needs_human_rule_review).toBe(false);
  });
});
