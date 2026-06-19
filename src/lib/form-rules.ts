import patternsJson from "./form-patterns.json";
import type { NormalizedLandmark } from "../types/mediapipe";
import type {
  ExerciseFormRules,
  ExerciseFormRuleOverrideSet,
  FormCueCategory,
  FormPatternRuleBodyScale,
  FormPatternRuleEffect,
  FormPatternRuleEvaluationTiming,
  FormPatternRuleKind,
  FormPatternRuleRelation,
  FormRuleApplicability,
  FormRulePhase,
  FormRulePrimaryMetric,
  FormRuleSeverity,
  FormRuleView,
} from "../types";
import {
  areLandmarksVisible,
  calculateAngle3D,
  getLandmarkVisibility,
} from "./form-geometry";

export interface FormPatternRule {
  id: string;
  kind?: FormPatternRuleKind;
  landmarks: number[];
  phase: FormRulePhase;
  min: number;
  max: number;
  severity: FormRuleSeverity;
  holdFrames: number;
  visibilityThreshold: number;
  cue: string;
  category?: FormCueCategory;
  effect?: FormPatternRuleEffect;
  evaluationTiming?: FormPatternRuleEvaluationTiming;
  bodyScale?: FormPatternRuleBodyScale;
  relation?: FormPatternRuleRelation;
  absolute?: boolean;
}

export interface FormPatternTempo {
  eccentricSeconds: number;
  pauseSeconds: number;
  concentricSeconds: number;
}

export interface FormPatternDefinition {
  id: string;
  label: string;
  applicability: FormRuleApplicability;
  view: FormRuleView;
  primaryMetric: FormRulePrimaryMetric;
  rules: FormPatternRule[];
  universalChecks: {
    spine: boolean;
    symmetry: boolean;
    stability: boolean;
  };
  tempo?: FormPatternTempo;
}

export interface ResolvedFormRule extends FormPatternRule {
  sourcePatternId: string;
}

export interface ResolvedExerciseFormRules {
  pattern: FormPatternDefinition;
  applicability: FormRuleApplicability;
  view: FormRuleView;
  confidence: number;
  primaryMetric: FormRulePrimaryMetric;
  rules: ResolvedFormRule[];
  review: ExerciseFormRules["review"];
}

export interface FormRuleEvaluationContext {
  currentPhase: Exclude<FormRulePhase, "both"> | "unknown";
  timestampMs: number;
  previousLandmarks?: NormalizedLandmark[] | null;
  previousTimestampMs?: number | null;
  scoringWarmup?: boolean;
}

export interface FormRuleEvaluationResult {
  failed: boolean;
  evaluable: boolean;
  value: number;
  confidence: number;
  landmarkIndices: number[];
  category: FormCueCategory;
  effect: FormPatternRuleEffect;
}

const patternCatalog = patternsJson as FormPatternDefinition[];

export const FORM_PATTERNS = patternCatalog;
export const FORM_PATTERN_IDS = new Set(FORM_PATTERNS.map((pattern) => pattern.id));

function getRuleKind(rule: FormPatternRule): FormPatternRuleKind {
  return rule.kind ?? "angle";
}

export function getRuleEffect(rule: FormPatternRule): FormPatternRuleEffect {
  return rule.effect ?? "score_penalty";
}

function getRuleCategory(rule: FormPatternRule): FormCueCategory {
  if (rule.category) return rule.category;
  if (rule.effect === "rep_gate") return "stability";
  return "range_of_motion";
}

function getPointDistance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z ?? 0) - (b.z ?? 0)) ** 2);
}

function getMidpoint(a: NormalizedLandmark, b: NormalizedLandmark): { x: number; y: number; z: number } {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function getBodyScale(landmarks: NormalizedLandmark[], bodyScale: FormPatternRuleBodyScale = "torso"): number {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const nose = landmarks[0];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  if (bodyScale === "shoulder_width" && leftShoulder && rightShoulder) {
    return Math.max(0.02, getPointDistance(leftShoulder, rightShoulder));
  }
  if (bodyScale === "hip_width" && leftHip && rightHip) {
    return Math.max(0.02, getPointDistance(leftHip, rightHip));
  }
  if (bodyScale === "body_height" && nose && leftAnkle && rightAnkle) {
    const ankleMid = getMidpoint(leftAnkle, rightAnkle);
    return Math.max(0.12, Math.abs(nose.y - ankleMid.y));
  }
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const shoulderMid = getMidpoint(leftShoulder, rightShoulder);
    const hipMid = getMidpoint(leftHip, rightHip);
    return Math.max(0.08, Math.sqrt((shoulderMid.x - hipMid.x) ** 2 + (shoulderMid.y - hipMid.y) ** 2));
  }

  return 0.2;
}

function getTorsoAngleFromVertical(landmarks: NormalizedLandmark[]): number {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return -1;

  const shoulderMid = getMidpoint(leftShoulder, rightShoulder);
  const hipMid = getMidpoint(leftHip, rightHip);
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;
  return Math.abs((Math.atan2(dx, Math.abs(dy)) * 180) / Math.PI);
}

function getRelativePositionValue(rule: FormPatternRule, landmarks: NormalizedLandmark[], scale: number): number {
  const first = landmarks[rule.landmarks[0]];
  const second = landmarks[rule.landmarks[1]];
  if (!first || !second) return Number.NaN;

  switch (rule.relation) {
    case "above":
      return (second.y - first.y) / scale;
    case "below":
      return (first.y - second.y) / scale;
    case "left_of":
      return (second.x - first.x) / scale;
    case "right_of":
      return (first.x - second.x) / scale;
    default:
      return 0;
  }
}

export function evaluateFormRule(
  rule: ResolvedFormRule,
  landmarks: NormalizedLandmark[],
  context: FormRuleEvaluationContext,
): FormRuleEvaluationResult {
  const kind = getRuleKind(rule);
  const landmarkIndices = kind === "torso_angle" ? [11, 12, 23, 24] : rule.landmarks;
  const category = getRuleCategory(rule);
  const effect = getRuleEffect(rule);
  const confidence = getLandmarkVisibility(landmarks, landmarkIndices);

  if (!areLandmarksVisible(landmarks, landmarkIndices, rule.visibilityThreshold)) {
    return { failed: false, evaluable: false, value: Number.NaN, confidence, landmarkIndices, category, effect };
  }

  let value = Number.NaN;
  const scale = getBodyScale(landmarks, rule.bodyScale);

  if (kind === "angle") {
    if (rule.landmarks.length < 3) {
      return { failed: false, evaluable: false, value, confidence, landmarkIndices, category, effect };
    }
    value = calculateAngle3D(landmarks, rule.landmarks[0], rule.landmarks[1], rule.landmarks[2]);
  } else if (kind === "distance") {
    const first = landmarks[rule.landmarks[0]];
    const second = landmarks[rule.landmarks[1]];
    if (first && second) value = getPointDistance(first, second) / scale;
  } else if (kind === "horizontal_delta") {
    const first = landmarks[rule.landmarks[0]];
    const second = landmarks[rule.landmarks[1]];
    if (first && second) {
      const delta = (first.x - second.x) / scale;
      value = rule.absolute === false ? delta : Math.abs(delta);
    }
  } else if (kind === "vertical_delta") {
    const first = landmarks[rule.landmarks[0]];
    const second = landmarks[rule.landmarks[1]];
    if (first && second) {
      const delta = (first.y - second.y) / scale;
      value = rule.absolute === false ? delta : Math.abs(delta);
    }
  } else if (kind === "joint_velocity") {
    const previous = context.previousLandmarks;
    const previousTimestampMs = context.previousTimestampMs;
    if (previous && previousTimestampMs !== null && previousTimestampMs !== undefined && context.timestampMs > previousTimestampMs) {
      const deltaSeconds = Math.max(0.016, (context.timestampMs - previousTimestampMs) / 1000);
      value = Math.max(...rule.landmarks.map((index) => {
        const current = landmarks[index];
        const last = previous[index];
        if (!current || !last) return 0;
        return (getPointDistance(current, last) / scale) / deltaSeconds;
      }));
    }
  } else if (kind === "torso_angle") {
    value = getTorsoAngleFromVertical(landmarks);
  } else if (kind === "relative_position") {
    value = getRelativePositionValue(rule, landmarks, scale);
  }

  if (!Number.isFinite(value) || value < 0) {
    return { failed: false, evaluable: false, value, confidence, landmarkIndices, category, effect };
  }

  const failed = !context.scoringWarmup && (value < rule.min || value > rule.max);
  return { failed, evaluable: true, value, confidence, landmarkIndices, category, effect };
}

export function getFormPatternById(patternId: string): FormPatternDefinition | null {
  return FORM_PATTERNS.find((pattern) => pattern.id === patternId) ?? null;
}

export function createEmptyOverrides(): ExerciseFormRuleOverrideSet {
  return {
    disabledRuleIds: [],
    ruleThresholds: [],
    cueOverrides: [],
  };
}

export function resolveExerciseFormRules(
  formRules: ExerciseFormRules | null | undefined,
): ResolvedExerciseFormRules | null {
  if (!formRules) return null;

  const pattern = getFormPatternById(formRules.patternId);
  if (!pattern) return null;

  const thresholdOverrides = new Map(
    formRules.overrides.ruleThresholds.map((override) => [override.ruleId, override]),
  );
  const cueOverrides = new Map(
    formRules.overrides.cueOverrides.map((override) => [override.ruleId, override.cue]),
  );
  const disabledRuleIds = new Set(formRules.overrides.disabledRuleIds);

  const rules = pattern.rules
    .filter((rule) => !disabledRuleIds.has(rule.id))
    .map((rule) => {
      const thresholdOverride = thresholdOverrides.get(rule.id);
      return {
        ...rule,
        min: thresholdOverride?.min ?? rule.min,
        max: thresholdOverride?.max ?? rule.max,
        cue: cueOverrides.get(rule.id) ?? rule.cue,
        sourcePatternId: pattern.id,
      };
    });

  return {
    pattern,
    applicability: formRules.applicability,
    view: formRules.view,
    confidence: formRules.confidence,
    primaryMetric: formRules.primaryMetric,
    rules,
    review: formRules.review,
  };
}
