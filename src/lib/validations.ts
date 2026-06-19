import { z } from "zod";
import { FORM_PATTERNS } from "./form-rules";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const workoutSchema = z.object({
  name: z.string().min(1, "Workout name is required").max(100, "Name is too long"),
});

export const setSchema = z.object({
  reps: z.number().min(0, "Reps cannot be negative"),
  weight: z.number().min(0, "Weight cannot be negative"),
});

export const setMutationSchema = z.object({
  reps: z.number().int().min(0).max(1000).optional(),
  weight: z.number().min(0).max(100000).optional(),
  is_confirmed: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const profileSchema = z.object({
  display_name: z.string().trim().min(1).max(80).optional(),
  birthday: z.string().date().nullable().optional(),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  height_cm: z.number().min(50).max(300).nullable().optional(),
  onboarding_done: z.boolean().optional(),
});

export const templateMutationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  exercises: z.array(z.object({ exercise_id: z.string().min(1).max(160) })).max(50).default([]),
});

export const aiMessagesSchema = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(z.object({
    clientId: z.string().uuid(),
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(20000),
  })).min(1).max(10),
});

const patternIds = FORM_PATTERNS.map((pattern) => pattern.id) as [string, ...string[]];

export const primaryMetricSchema = z.object({
  kind: z.literal("angle"),
  landmarks: z.tuple([
    z.number().int().min(0).max(32),
    z.number().int().min(0).max(32),
    z.number().int().min(0).max(32),
  ]),
  phaseLogic: z.enum(["flexion_extension", "extension_flexion", "pull_raise_lower", "cyclic"]).optional(),
});

export const formRuleThresholdOverrideSchema = z.object({
  ruleId: z.string().min(1),
  min: z.number().min(0).max(180).optional(),
  max: z.number().min(0).max(180).optional(),
}).refine((value) => value.min !== undefined || value.max !== undefined, {
  message: "At least one threshold value is required",
});

export const formRuleCueOverrideSchema = z.object({
  ruleId: z.string().min(1),
  cue: z.string().min(1).max(80),
});

export const exerciseFormRulesSchema = z.object({
  patternId: z.enum(patternIds),
  applicability: z.enum(["realtime", "post_set_only", "not_applicable"]),
  view: z.enum(["front", "side", "three_quarter"]),
  confidence: z.number().min(0).max(1),
  primaryMetric: primaryMetricSchema,
  overrides: z.object({
    disabledRuleIds: z.array(z.string().min(1)).default([]),
    ruleThresholds: z.array(formRuleThresholdOverrideSchema).default([]),
    cueOverrides: z.array(formRuleCueOverrideSchema).default([]),
  }),
  review: z.object({
    status: z.enum(["ai_generated", "reviewed", "needs_review"]),
    notes: z.string().max(300).optional().default(""),
  }),
});

export const formSessionFeedbackItemSchema = z.object({
  type: z.enum(["error", "warning", "info"]),
  message: z.string().min(1).max(160),
  landmarkIndices: z.array(z.number().int().min(0).max(32)).optional(),
  source: z.enum(["rule", "tempo", "stability", "symmetry", "spine", "coach"]).optional(),
  ruleId: z.string().min(1).optional(),
  timestampMs: z.number().int().min(0).optional(),
  category: z.enum(["range_of_motion", "tempo", "stability", "symmetry", "posture", "tracking", "other"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  effect: z.enum(["score_penalty", "cue_only", "rep_gate"]).optional(),
});

const formScoreBandSchema = z.enum(["excellent", "good", "needs_work", "poor"]);

export const formLandmarkSampleSchema = z.object({
  timestampMs: z.number().int().min(0),
  landmarks: z.array(z.object({
    index: z.number().int().min(0).max(32),
    x: z.number(),
    y: z.number(),
    z: z.number(),
    visibility: z.number().min(0).max(1),
  })).max(20),
});

export const formRepMetricSchema = z.object({
  repIndex: z.number().int().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  eccentricMs: z.number().int().min(0),
  concentricMs: z.number().int().min(0),
  topPauseMs: z.number().int().min(0),
  bottomPauseMs: z.number().int().min(0),
  minAngle: z.number().min(0).max(180),
  maxAngle: z.number().min(0).max(180),
  score: z.number().int().min(0).max(100),
  scoreBand: formScoreBandSchema.optional(),
  trackingConfidence: z.number().min(0).max(1).optional(),
  feedback: z.array(formSessionFeedbackItemSchema).max(12),
  tempoFlags: z.array(z.string().min(1).max(60)).max(8),
});

export const formCoachingResultSchema = z.object({
  summary: z.string().min(1).max(500),
  top_cues: z.array(z.string().min(1).max(140)).max(5),
  rep_observations: z.array(z.string().min(1).max(160)).max(5),
  confidence: z.number().min(0).max(1),
  needs_human_rule_review: z.boolean(),
});

export const formWorstSegmentSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  repIndex: z.number().int().min(1).optional(),
  score: z.number().int().min(0).max(100),
  feedback: z.array(formSessionFeedbackItemSchema).max(12),
  samples: z.array(formLandmarkSampleSchema).max(120),
});

export const formSessionAnalysisSchema = z.object({
  exercise_id: z.string().min(1),
  score: z.number().int().min(0).max(100),
  realtime_score: z.number().int().min(0).max(100),
  postset_score: z.number().int().min(0).max(100),
  reps: z.number().int().min(0),
  duration_ms: z.number().int().min(0),
  detector_version: z.string().min(1).max(80),
  rules_version: z.string().min(1).max(80),
  rules_confidence: z.number().min(0).max(1),
  analysis_status: z.enum(["local_only", "cloud_pending", "cloud_complete", "cloud_failed"]),
  feedback_summary: z.string().max(500),
  feedback_json: z.object({
    topIssues: z.array(formSessionFeedbackItemSchema).max(10),
    realtime: z.array(formSessionFeedbackItemSchema).max(20),
    postset: z.array(formSessionFeedbackItemSchema).max(20),
    coaching: formCoachingResultSchema.nullish(),
    scoring: z.object({
      scoreBand: formScoreBandSchema,
      trackingConfidence: z.number().min(0).max(1),
      trackingHint: z.string().max(160).nullable().optional(),
      consistencyPenalty: z.number().int().min(0).max(100).optional(),
      trendPenalty: z.number().int().min(0).max(100).optional(),
    }).optional(),
  }),
  rep_metrics_json: z.array(formRepMetricSchema).max(100),
  landmark_stream_json: z.array(formLandmarkSampleSchema).max(1200),
  worst_segment_json: formWorstSegmentSchema.nullable(),
  used_cloud_coach: z.boolean(),
  cloud_model: z.string().max(120).nullable().optional(),
});

export const formCoachingAnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  realtime_score: z.number().int().min(0).max(100),
  postset_score: z.number().int().min(0).max(100),
  reps: z.number().int().min(0),
  duration_ms: z.number().int().min(0),
  detector_version: z.string().min(1).max(80),
  rules_version: z.string().min(1).max(80),
  rules_confidence: z.number().min(0).max(1),
  analysis_status: z.enum(["local_only", "cloud_pending", "cloud_complete", "cloud_failed"]),
  feedback_summary: z.string().max(500),
  feedback_json: z.object({
    topIssues: z.array(formSessionFeedbackItemSchema).max(10),
    realtime: z.array(formSessionFeedbackItemSchema).max(20),
    postset: z.array(formSessionFeedbackItemSchema).max(20),
    coaching: formCoachingResultSchema.nullish(),
    scoring: z.object({
      scoreBand: formScoreBandSchema,
      trackingConfidence: z.number().min(0).max(1),
      trackingHint: z.string().max(160).nullable().optional(),
      consistencyPenalty: z.number().int().min(0).max(100).optional(),
      trendPenalty: z.number().int().min(0).max(100).optional(),
    }).optional(),
  }),
  rep_metrics_json: z.array(formRepMetricSchema).max(20),
  worst_segment_json: formWorstSegmentSchema.nullable(),
  used_cloud_coach: z.boolean(),
  cloud_model: z.string().max(120).nullable().optional(),
});

export const formCoachingRequestSchema = z.object({
  exerciseName: z.string().min(1).max(160),
  formRules: exerciseFormRulesSchema.nullable(),
  analysis: formCoachingAnalysisSchema,
});

export type ExerciseFormRulesInput = z.infer<typeof exerciseFormRulesSchema>;
export type FormSessionAnalysisInput = z.infer<typeof formSessionAnalysisSchema>;
export type FormCoachingRequestInput = z.infer<typeof formCoachingRequestSchema>;
export type FormCoachingResultInput = z.infer<typeof formCoachingResultSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type WorkoutInput = z.infer<typeof workoutSchema>;
export type SetInput = z.infer<typeof setSchema>;
