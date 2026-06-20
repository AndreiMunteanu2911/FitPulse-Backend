import { callOpenRouter } from "./ai";
import { formCoachingResultSchema } from "./validations";
import type { ExerciseFormRules, FormCoachingResult } from "../types";
import type { FormCoachingRequestInput } from "./validations";

function stripLargePayload(analysis: FormCoachingRequestInput["analysis"]) {
  return {
    score: analysis.score,
    realtime_score: analysis.realtime_score,
    postset_score: analysis.postset_score,
    reps: analysis.reps,
    rules_confidence: analysis.rules_confidence,
    feedback_summary: analysis.feedback_summary,
    feedback_json: {
      topIssues: analysis.feedback_json.topIssues.slice(0, 5),
      postset: analysis.feedback_json.postset.slice(0, 5),
    },
    rep_metrics_json: analysis.rep_metrics_json.slice(0, 8),
    worst_segment_json: analysis.worst_segment_json
      ? {
          ...analysis.worst_segment_json,
          samples: analysis.worst_segment_json.samples.slice(0, 24),
        }
      : null,
  };
}

function truncateText(value: unknown, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function coerceTextArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => truncateText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeCoachingPayload(value: unknown): FormCoachingResult {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    summary: truncateText(object.summary, 500) || "Review complete. Use the main cues above for your next set.",
    top_cues: coerceTextArray(object.top_cues, 5, 140),
    rep_observations: coerceTextArray(object.rep_observations, 5, 160),
    confidence: typeof object.confidence === "number" ? Math.max(0, Math.min(1, object.confidence)) : 0.5,
    needs_human_rule_review: typeof object.needs_human_rule_review === "boolean"
      ? object.needs_human_rule_review
      : false,
  };
}

export async function generateFormCoaching(params: {
  exerciseName: string;
  formRules: ExerciseFormRules | null;
  analysis: FormCoachingRequestInput["analysis"];
}): Promise<FormCoachingResult> {
  const prompt = [
    "You are a biomechanics-focused form coach.",
    "Analyze the structured exercise session data and return JSON only.",
    "Return exactly this shape: {\"summary\": string, \"top_cues\": string[], \"rep_observations\": string[], \"confidence\": number, \"needs_human_rule_review\": boolean}.",
    "Keep summary under 400 characters.",
    "top_cues should be 2-4 concise, prioritized fixes.",
    "rep_observations should be 2-4 short observations grounded in the provided rep metrics and worst segment only.",
    "Do not give generic fitness advice. Every cue must be justified by the metrics or detected issues.",
    "Write for a normal gym user, not an engineer.",
    "Do not mention internal telemetry or implementation terms such as landmarks, keypoints, coordinates, visibility, angles arrays, thresholds, phase logic, rule ids, or model confidence in the user-facing text.",
    "Translate technical signals into plain coaching language about body position and movement, such as elbows, hips, knees, torso, bar path, control, depth, lockout, and tempo.",
    "Do not say that the app measured landmarks or detected thresholds. State the coaching point directly in natural language.",
    "Be slightly more detailed than a one-line coaching note, but stay compact and practical.",
    "Set needs_human_rule_review=true if the rules confidence is low or the signals conflict.",
    "",
    JSON.stringify({
      exerciseName: params.exerciseName,
      formRules: params.formRules,
      analysis: stripLargePayload(params.analysis),
    }),
  ].join("\n");

  const response = await callOpenRouter([
    {
      role: "system",
      content: "You are a strict JSON generator for exercise form coaching. Return JSON only.",
    },
    {
      role: "user",
      content: prompt,
    },
  ], {
    temperature: 0.2,
    maxTokens: 1600,
    reasoning: { effort: "low" },
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "form_coaching",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            top_cues: { type: "array", items: { type: "string" } },
            rep_observations: { type: "array", items: { type: "string" } },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            needs_human_rule_review: { type: "boolean" },
          },
          required: [
            "summary",
            "top_cues",
            "rep_observations",
            "confidence",
            "needs_human_rule_review",
          ],
        },
      },
    },
  });

  const normalized = response
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const json = JSON.parse(normalized);
  const parsed = formCoachingResultSchema.safeParse(json);
  if (parsed.success) return parsed.data;

  return formCoachingResultSchema.parse(normalizeCoachingPayload(json));
}
