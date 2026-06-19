// ── Intent Classifier for RAG Queries ────────────────────────────────────────
// Rule-based classifier that extracts intent from user messages.
// No LLM needed — keyword matching against known exercise/muscle vocab.
// ─────────────────────────────────────────────────────────────────────────────

export type Intent =
  | "progress_check"     // "How's my bench press going?"
  | "advice"             // "How do I break through a plateau?"
  | "comparison"         // "Compare my squat vs deadlift"
  | "recommendation"     // "What should I train today?"
  | "workout_request"    // "Create a push day for me"
  | "general";           // "What is progressive overload?"

export interface ClassifiedIntent {
  intent: Intent;
  detectedExercises: string[];  // normalized exercise IDs
  detectedMuscles: string[];    // muscle group keywords
  detectedMetrics: string[];    // "volume", "pr", "streak", etc.
  needsWorkoutCreation: boolean;
  rawMessage: string;
}

// ── Known exercise name aliases → canonical exercise_id ──────────────────────
// This map covers common aliases. The full exercise library is queried at
// runtime for fuzzy matching.
const EXERCISE_ALIASES: Record<string, string> = {
  "bench": "bench-press",
  "bench press": "bench-press",
  "barbell bench press": "barbell-bench-press",
  "flat bench": "bench-press",
  "incline bench": "incline-bench-press",
  "incline bench press": "incline-bench-press",
  "decline bench": "decline-bench-press",
  "squat": "barbell-squat",
  "back squat": "barbell-squat",
  "front squat": "front-squat",
  "deadlift": "barbell-deadlift",
  "conventional deadlift": "barbell-deadlift",
  "sumo deadlift": "sumo-deadlift",
  "overhead press": "overhead-press",
  "ohp": "overhead-press",
  "military press": "overhead-press",
  "shoulder press": "overhead-press",
  "barbell row": "barbell-row",
  "bent over row": "barbell-row",
  "pull up": "pull-up",
  "pull ups": "pull-up",
  "pull-up": "pull-up",
  "pull-ups": "pull-up",
  "chin up": "chin-up",
  "chin ups": "chin-up",
  "dip": "dip",
  "dips": "dip",
  "leg press": "leg-press",
  "leg curl": "leg-curl",
  "leg extension": "leg-extension",
  "calf raise": "calf-raise",
  "calf raises": "calf-raise",
  "bicep curl": "bicep-curl",
  "bicep curls": "bicep-curl",
  "hammer curl": "hammer-curl",
  "hammer curls": "hammer-curl",
  "tricep extension": "tricep-extension",
  "tricep pushdown": "tricep-pushdown",
  "lateral raise": "lateral-raise",
  "lateral raises": "lateral-raise",
  "cable fly": "cable-crossover",
  "cable flyes": "cable-crossover",
  "dumbbell fly": "dumbbell-fly",
  "dumbbell flyes": "dumbbell-fly",
  "romanian deadlift": "romanian-deadlift",
  "rdl": "romanian-deadlift",
  "lunges": "lunge",
  "lunge": "lunge",
  "bulgarian split squat": "bulgarian-split-squat",
  "hip thrust": "barbell-hip-thrust",
  "hip thrusts": "barbell-hip-thrust",
  "face pull": "face-pull",
  "face pulls": "face-pull",
  "lat pulldown": "lat-pulldown",
  "lat pull down": "lat-pulldown",
  "t-bar row": "t-bar-row",
  "chest press": "chest-press-machine",
  "pec deck": "pec-deck-fly",
};

// ── Muscle group keywords ────────────────────────────────────────────────────
const MUSCLE_KEYWORDS: Record<string, string[]> = {
  "chest": ["chest", "pec", "pectoral"],
  "back": ["back", "lat", "lats", "rhomboid", "trap"],
  "shoulders": ["shoulder", "deltoid", "delt"],
  "biceps": ["bicep", "biceps"],
  "triceps": ["tricep", "triceps"],
  "quads": ["quad", "quads", "quadricep"],
  "hamstrings": ["hamstring", "hamstrings"],
  "glutes": ["glute", "glutes", "gluteal"],
  "calves": ["calf", "calves", "gastrocnemius"],
  "abs": ["abs", "core", "abdominal", "oblique"],
  "forearms": ["forearm", "forearms", "grip"],
  "lower back": ["lower back", "erector", "lumbar"],
};

// ── Workout request triggers ─────────────────────────────────────────────────
const WORKOUT_REQUEST_PATTERNS = [
  /create\s+(a|an|me|the)?\s*(workout|routine|session)/i,
  /make\s+(a|an|me|the)?\s*(workout|routine|session)/i,
  /build\s+(a|an|me|the)?\s*(workout|routine|session)/i,
  /generate\s+(a|an|me|the)?\s*(workout|routine|session)/i,
  /set\s+up\s+(a|an|me|the)?\s*(workout|routine|session)/i,
  /give\s+me\s+(a|an)\s*(workout|routine)/i,
  /(push|pull|leg|legs|upper|lower|full\s*body|chest|back|shoulder|arm)\s*(day|workout|routine)/i,
  /what\s+should\s+i\s+train/i,
  /what\s+should\s+i\s+do\s+today/i,
  /suggest\s+(a|me|an?)\s*(workout|routine)/i,
];

// ── Intent detection patterns ────────────────────────────────────────────────
const PROGRESS_PATTERNS = [
  /how\s*(am|i'm|is)\s*(my|i|me|doing|progress)/i,
  /how\s*(is|are|'s)\s*(my|the)/i,
  /progress\s*(on|with|for)/i,
  /how\s*(am|i'm)\s*doing\s*(on|with|for)/i,
  /my\s*(progress|improvement|gains)/i,
  /track\s*(my|the)\s*progress/i,
  /am\s*i\s*(getting|improving|stronger|better)/i,
];

const COMPARISON_PATTERNS = [
  /compare\s*(my\s*)?(.+)/i,
  /vs\.?\s*(.+)/i,
  /versus\s*(.+)/i,
  /difference\s*between/i,
  /which\s*is\s*(better|stronger|more)/i,
];

const ADVICE_PATTERNS = [
  /how\s*(do|i|to|should|can)\s*(i|you)\s*(break|overcome|fix|improve|increase|build)/i,
  /what\s*(should|i|can|to)\s*(i|you)\s*do\s*(for|about|if)/i,
  /tips?\s*(for|on|about)/i,
  /advice\s*(for|on|about)/i,
  /how\s*to\s*(break|overcome|fix|improve|increase|build)/i,
  /plateau/i,
  /stuck\s*(at|on)/i,
];

const RECOMMENDATION_PATTERNS = [
  /what\s*(should|can|do)\s*(i|you)\s*(train|workout|do|exercise)/i,
  /what\s*(should|can)\s*i\s*train\s*(today|this\s*week|next)/i,
  /recommend/i,
  /suggest\s*(exercises?|workouts?|muscles?)/i,
  /what\s*(muscle|exercise|workout)\s*(should|to)/i,
  /haven'?t\s*trained/i,
  /muscle\s*gap/i,
  /overtrain/i,
  /undertrain/i,
  /recovery/i,
  /rest\s*(day|days)/i,
];

// ── Main classifier ──────────────────────────────────────────────────────────
export function classifyIntent(rawMessage: string): ClassifiedIntent {
  const msg = rawMessage.trim();
  const lower = msg.toLowerCase();

  // 1. Detect workout creation requests
  const needsWorkoutCreation = WORKOUT_REQUEST_PATTERNS.some((p) =>
    p.test(msg),
  );

  // 2. Detect exercise names
  const detectedExercises = detectExercises(lower);

  // 3. Detect muscle groups
  const detectedMuscles = detectMuscles(lower);

  // 4. Detect metrics
  const detectedMetrics = detectMetrics(lower);

  // 5. Classify intent (priority order)
  let intent: Intent;

  if (needsWorkoutCreation) {
    intent = "workout_request";
  } else if (COMPARISON_PATTERNS.some((p) => p.test(msg))) {
    intent = "comparison";
  } else if (PROGRESS_PATTERNS.some((p) => p.test(msg))) {
    intent = "progress_check";
  } else if (RECOMMENDATION_PATTERNS.some((p) => p.test(msg))) {
    intent = "recommendation";
  } else if (ADVICE_PATTERNS.some((p) => p.test(msg))) {
    intent = "advice";
  } else {
    intent = "general";
  }

  return {
    intent,
    detectedExercises,
    detectedMuscles,
    detectedMetrics,
    needsWorkoutCreation,
    rawMessage: msg,
  };
}

// ── Exercise detection ───────────────────────────────────────────────────────
function detectExercises(lower: string): string[] {
  const found: string[] = [];

  // Sort aliases by length (longest first) to prefer "bench press" over "bench"
  const sortedAliases = Object.entries(EXERCISE_ALIASES).sort(
    (a, b) => b[0].length - a[0].length,
  );

  for (const [alias, id] of sortedAliases) {
    if (lower.includes(alias) && !found.includes(id)) {
      found.push(id);
    }
  }

  return found;
}

// ── Muscle detection ─────────────────────────────────────────────────────────
function detectMuscles(lower: string): string[] {
  const found: string[] = [];

  for (const [muscle, keywords] of Object.entries(MUSCLE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      found.push(muscle);
    }
  }

  return found;
}

// ── Metric detection ─────────────────────────────────────────────────────────
function detectMetrics(lower: string): string[] {
  const metrics: string[] = [];
  const metricKeywords = [
    "volume", "pr", "personal record", "streak", "level", "xp",
    "weight", "reps", "sets", "tonnage", "one rep max", "1rm",
    "bodyweight", "body weight", "body fat",
  ];

  for (const kw of metricKeywords) {
    if (lower.includes(kw)) {
      metrics.push(kw);
    }
  }

  return metrics;
}

// ── Helper: extract muscle group from a "push/pull/leg" request ──────────────
export function extractWorkoutType(message: string): string | null {
  const lower = message.toLowerCase();

  if (/\bpush\b/.test(lower)) return "push";
  if (/\bpull\b/.test(lower)) return "pull";
  if (/\bleg\b/.test(lower)) return "legs";
  if (/\bupper\b/.test(lower)) return "upper";
  if (/\blower\b/.test(lower)) return "lower";
  if (/full\s*body/.test(lower)) return "full_body";
  if (/\bchest\b/.test(lower)) return "chest";
  if (/\bback\b/.test(lower)) return "back";
  if (/\bshoulder\b/.test(lower)) return "shoulders";
  if (/\barm\b/.test(lower)) return "arms";

  return null;
}
