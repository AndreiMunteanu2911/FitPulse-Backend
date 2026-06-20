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
    top_cues: coerceTextArray(object.top_cues, 5, 260),
    rep_observations: coerceTextArray(object.rep_observations, 5, 240),
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
    "Write a useful 3-5 sentence summary under 500 characters. State what was done well, what deteriorated, and the single most important priority for the next set.",
    "Never claim the form was excellent or consistent throughout unless every scored rep supports that claim. A high overall score does not erase specific detected faults.",
    "Address the user directly as 'you' and 'your', or use neutral impersonal phrasing. Never refer to the user as 'the athlete', 'the lifter', or 'they'.",
    "top_cues must contain 2-4 detailed, prioritized coaching instructions. Each item must name the body part or movement, describe the observed problem, and give a concrete correction the user can perform on the next rep.",
    "Use this cue style: 'Elbow position — Your elbows drifted forward near the top of several reps. Keep the upper arms pinned beside your torso and stop the curl before the shoulders roll forward.'",
    "Do not return category labels or fragments such as 'elbow position', 'torso alignment', or 'concentric control' by themselves.",
    "rep_observations must contain 2-4 specific observations grounded in the provided rep metrics and worst segment. Mention rep numbers, score changes, phase timing, repeated faults, or range changes when those values are available.",
    "If the data does not support a precise claim, explicitly say what could not be assessed instead of filling space with generic advice.",
    "Every cue must be traceable to the metrics or detected issues. Do not add generic fitness advice.",
    "Do not claim injury, joint strain, or medical risk. Describe control, consistency, and technique without unsupported health consequences.",
    "Write for a normal gym user, not an engineer.",
    "Do not mention internal telemetry or implementation terms such as landmarks, keypoints, coordinates, visibility, angle arrays, thresholds, phase logic, rule ids, model confidence, raw flag names, or millisecond timestamps.",
    "Translate internal values such as eccentric_too_fast into natural language such as 'you lowered the weight too quickly'. Never copy raw enum or flag values into the response.",
    "Translate technical signals into plain coaching language about body position and movement, such as elbows, hips, knees, torso, bar path, control, depth, lockout, and tempo.",
    "Do not say that the app measured landmarks or detected thresholds. State the coaching point directly in natural language.",
    "Prefer concrete language: identify when in the rep the issue occurred, how often it appeared, and what the athlete should feel or change.",
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
      content: "You are a direct personal form coach speaking to the user as 'you'. Never call them an athlete or lifter. Return strict JSON only.",
    },
    {
      role: "user",
      content: prompt,
    },
  ], {
    temperature: 0.2,
    maxTokens: 2200,
    reasoning: { effort: "medium" },
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "form_coaching",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string", minLength: 80, maxLength: 500 },
            top_cues: { type: "array", minItems: 2, maxItems: 4, items: { type: "string", minLength: 50, maxLength: 260 } },
            rep_observations: { type: "array", minItems: 2, maxItems: 4, items: { type: "string", minLength: 35, maxLength: 240 } },
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
