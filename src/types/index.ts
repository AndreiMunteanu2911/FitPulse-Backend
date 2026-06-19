export interface User {
  id: string;
  email: string;
  created_at?: string;
  role?: string;
  onboarding_done?: boolean;
  display_name?: string | null;
  birthday?: string | null;
  gender?: "male" | "female" | "other" | null;
  height_cm?: number | null;
}

export interface Exercise {
  exercise_id: string;
  name: string;
  gif_url?: string | null;
  target_muscles?: string[] | null;
  secondary_muscles?: string[] | null;
  body_parts?: string[] | null;
  equipments?: string[] | null;
  instructions?: string[] | null;
  description?: string;
  created_at?: string;
  is_custom?: boolean;
  form_rules?: ExerciseFormRules | null;
}

export type FormRuleApplicability = "realtime" | "post_set_only" | "not_applicable";
export type FormRuleView = "front" | "side" | "three_quarter";
export type FormRulePhase = "eccentric" | "concentric" | "both";
export type FormRuleSeverity = "error" | "warning" | "info";
export type FormPatternRuleKind =
  | "angle"
  | "distance"
  | "vertical_delta"
  | "horizontal_delta"
  | "joint_velocity"
  | "torso_angle"
  | "relative_position";
export type FormPatternRuleEffect = "score_penalty" | "cue_only" | "rep_gate";
export type FormPatternRuleEvaluationTiming = "phase" | "phase_endpoint" | "always";
export type FormPatternRuleBodyScale = "shoulder_width" | "hip_width" | "torso" | "body_height";
export type FormPatternRuleRelation = "above" | "below" | "left_of" | "right_of";
export type FormCueCategory =
  | "range_of_motion"
  | "tempo"
  | "stability"
  | "symmetry"
  | "posture"
  | "tracking"
  | "other";
export type FormScoreBand = "excellent" | "good" | "needs_work" | "poor";
export type PrimaryMetricKind = "angle";
export type PrimaryMetricPhaseLogic =
  | "flexion_extension"
  | "extension_flexion"
  | "pull_raise_lower"
  | "cyclic";

export interface FormRulePrimaryMetric {
  kind: PrimaryMetricKind;
  landmarks: [number, number, number];
  phaseLogic?: PrimaryMetricPhaseLogic;
}

export interface FormRuleThresholdOverride {
  ruleId: string;
  min?: number;
  max?: number;
}

export interface FormRuleCueOverride {
  ruleId: string;
  cue: string;
}

export interface ExerciseFormRuleOverrideSet {
  disabledRuleIds: string[];
  ruleThresholds: FormRuleThresholdOverride[];
  cueOverrides: FormRuleCueOverride[];
}

export interface ExerciseFormRuleReview {
  status: "ai_generated" | "reviewed" | "needs_review";
  notes?: string;
}

export interface ExerciseFormRules {
  patternId: string;
  applicability: FormRuleApplicability;
  view: FormRuleView;
  confidence: number;
  primaryMetric: FormRulePrimaryMetric;
  overrides: ExerciseFormRuleOverrideSet;
  review: ExerciseFormRuleReview;
}

export interface FormSessionFeedbackItem {
  type: FormRuleSeverity;
  message: string;
  landmarkIndices?: number[];
  source?: "rule" | "tempo" | "stability" | "symmetry" | "spine" | "coach";
  ruleId?: string;
  timestampMs?: number;
  category?: FormCueCategory;
  confidence?: number;
  effect?: FormPatternRuleEffect;
}

export interface FormLandmarkSample {
  timestampMs: number;
  landmarks: Array<{
    index: number;
    x: number;
    y: number;
    z: number;
    visibility: number;
  }>;
}

export interface FormMetricSample {
  timestampMs: number;
  angle: number;
  phase: Exclude<FormRulePhase, "both"> | "unknown";
}

export interface FormRepMetric {
  repIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  eccentricMs: number;
  concentricMs: number;
  topPauseMs: number;
  bottomPauseMs: number;
  minAngle: number;
  maxAngle: number;
  score: number;
  scoreBand?: FormScoreBand;
  trackingConfidence?: number;
  feedback: FormSessionFeedbackItem[];
  tempoFlags: string[];
}

export type FormAnalysisStatus = "local_only" | "cloud_pending" | "cloud_complete" | "cloud_failed";

export interface FormCoachingResult {
  summary: string;
  top_cues: string[];
  rep_observations: string[];
  confidence: number;
  needs_human_rule_review: boolean;
}

export interface FormWorstSegment {
  startMs: number;
  endMs: number;
  repIndex?: number;
  score: number;
  feedback: FormSessionFeedbackItem[];
  samples: FormLandmarkSample[];
}

export interface FormSessionAnalysis {
  score: number;
  realtime_score: number;
  postset_score: number;
  reps: number;
  duration_ms: number;
  detector_version: string;
  rules_version: string;
  rules_confidence: number;
  analysis_status: FormAnalysisStatus;
  feedback_summary: string;
  feedback_json: {
    topIssues: FormSessionFeedbackItem[];
    realtime: FormSessionFeedbackItem[];
    postset: FormSessionFeedbackItem[];
    coaching?: FormCoachingResult | null;
    scoring?: {
      scoreBand: FormScoreBand;
      trackingConfidence: number;
      trackingHint?: string | null;
      consistencyPenalty?: number;
      trendPenalty?: number;
    };
  };
  rep_metrics_json: FormRepMetric[];
  landmark_stream_json: FormLandmarkSample[];
  worst_segment_json: FormWorstSegment | null;
  used_cloud_coach: boolean;
  cloud_model?: string | null;
}

export interface FormLog extends FormSessionAnalysis {
  id: string;
  user_id: string;
  exercise_id: string;
  created_at: string;
}

export interface Set {
  id: string;
  client_key?: string;
  workout_exercise_id?: string;
  set_number: number;
  reps: number;
  weight: number;
  is_confirmed: boolean;
  created_at?: string;
}

export interface WorkoutExercise {
  id: string;
  client_key?: string;
  workout_id?: string;
  exercise_id: string;
  order_index: number;
  exercise: Exercise;
  sets: Set[];
  previousSets?: { reps: number; weight: number }[]; // last session's sets for "Previous" column
  previousSetsLoaded?: boolean; // whether last-session data has been fetched yet
  created_at?: string;
}

export interface Workout {
  id: string;
  user_id?: string;
  name: string;
  workout_date: string;
  status: "draft" | "completed" | "cancelled";
  workout_exercises: WorkoutExercise[];
  created_at?: string;
  updated_at?: string;
  finished_at?: string;
}

export interface WeightLog {
  id: string;
  user_id: string;
  weight: number;
  log_date: string;
  created_at?: string;
}

export interface WorkoutStats {
  totalWorkouts: number;
  workoutsThisWeek: number;
  workoutsThisMonth: number;
  totalVolume: number;
  weekVolume: number;
  currentStreak: number;
  longestStreak: number;
  prCount: number;
  weeklyHistogram: { weekLabel: string; count: number }[];
}

export interface APIResponse<T> {
  data?: T;
  error?: string;
}

export interface AuthResponse {
  user?: User;
  error?: string;
}

export interface WorkoutTemplate {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  template_exercises?: TemplateExercise[];
  created_at?: string;
  updated_at?: string;
}

export interface TemplateExercise {
  id: string;
  template_id: string;
  exercise_id: string;
  order_index: number;
  exercise?: Exercise;
  created_at?: string;
}

export interface UserExercise {
  id: string;
  user_id: string;
  exercise_id: string;
  is_favorite: boolean;
  exercise?: Exercise;
  created_at?: string;
}

export interface ProgressPhoto {
  id: string;
  user_id: string;
  photo_url: string;
  log_date: string;
  notes?: string;
  body_part?: string;
  created_at?: string;
}

export interface PersonalRecord {
  id: string;
  user_id: string;
  exercise_id: string;
  max_weight: number;
  max_reps: number;
  workout_date: string;
  exercise?: Exercise;
  created_at?: string;
  updated_at?: string;
}

// ── Gamification ──────────────────────────────────────────────────────────────

export interface GamificationStats {
  totalXP: number;
  level: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpProgress: number; // 0–100 %
  achievements: Achievement[];
  currentStreak: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Lucide icon component name, e.g. "Trophy", "Flame" */
  icon: string;
  xpReward: number;
  category: "workouts" | "streaks" | "records" | "volume";
  /** Non-null when workout conditions are met */
  unlockedAt?: string | null;
  /** Non-null when the user has clicked "Claim" and the XP has been banked */
  claimedAt?: string | null;
}

// ── Shop ───────────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price_usd: number | null;
  image_url: string | null;
  stock_quantity: number;
  is_physical: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id: string;
  user_id: string;
  product_id: string | null;
  amount_usd: number | null;
  status: 'pending' | 'completed' | 'cancelled' | 'shipped';
  stripe_session_id: string | null;
  shipping_address: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  product?: Product;
}


// ── Social ────────────────────────────────────────────────────────────────────

export interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted";
  created_at?: string;
  updated_at?: string;
  user_stats?: { display_name: string | null };
  friend_stats?: { display_name: string | null };
}

export interface Post {
  id: string;
  user_id: string;
  workout_id?: string | null;
  content?: string | null;
  image_url?: string | null;
  workout_summary?: string | null;
  created_at?: string;
  updated_at?: string;
  user_stats?: { display_name: string | null };
  post_likes?: PostLike[];
  post_comments?: PostComment[];
  likes_count?: number;
  comments_count?: number;
  liked_by_me?: boolean;
  workout?: Workout | null;
}

export interface PostLike {
  id: string;
  post_id: string;
  user_id: string;
  created_at?: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at?: string;
  updated_at?: string;
  user_stats?: { display_name: string | null };
}

export interface UserSearchResult {
  user_id: string;
  display_name: string | null;
  friendship_status?: "none" | "pending_sent" | "pending_received" | "accepted";
}

// ── Blog ───────────────────────────────────────────────────────────────────────

export interface BlogPost {
  id: string;
  title: string;
  content: string;
  image_url?: string | null;
  author_id: string;
  created_at?: string;
  updated_at?: string;
  likes_count?: number;
  comments_count?: number;
  liked_by_me?: boolean;
}

export interface BlogComment {
  id: string;
  blog_post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: {
    display_name: string;
    avatar_url: string | null;
  };
}
