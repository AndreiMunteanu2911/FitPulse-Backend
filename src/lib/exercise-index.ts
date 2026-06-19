// ── Exercise Index ──────────────────────────────────────────────────────────
// Server-only module. Fetches all exercises (standard + user's custom) and
// builds a compact lookup for the AI prompt. Includes fuzzy name matching.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExerciseEntry {
  id: string;        // "01qpYSe" or "custom_<uuid>"
  name: string;      // "upward facing dog" or "Bent over row (Machine)"
  category: string;  // body_parts[0] or target_muscles[0] or body_part
  isCustom: boolean;
}

// In-memory cache (exercises rarely change)
let cachedIndex: string | null = null;
let cachedUserId: string | null = null;

/**
 * Build a compact text block of ALL exercises (standard + user's custom).
 * Format: "id | name | category" per line.
 * Cached per-user (custom exercises differ by user).
 */
export async function buildExerciseIndexText(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  // Check cache
  if (cachedIndex && cachedUserId === userId) {
    return cachedIndex;
  }

  const entries: ExerciseEntry[] = [];

  // 1. Fetch standard exercises
  const { data: standardData } = await supabase
    .from("exercises")
    .select("exercise_id, name, body_parts, target_muscles");

  if (standardData) {
    for (const e of standardData) {
      const bodyParts = (e.body_parts as string[]) ?? [];
      const muscles = (e.target_muscles as string[]) ?? [];
      const category = bodyParts[0] ?? muscles[0] ?? "";
      entries.push({
        id: e.exercise_id as string,
        name: (e.name as string).toLowerCase(),
        category: category.toLowerCase(),
        isCustom: false,
      });
    }
  }

  // 2. Fetch user's custom exercises
  const { data: customData } = await supabase
    .from("custom_exercises")
    .select("id, name, body_part")
    .eq("user_id", userId);

  if (customData) {
    for (const e of customData) {
      entries.push({
        id: `custom_${e.id as string}`,
        name: (e.name as string).toLowerCase(),
        category: (e.body_part as string)?.toLowerCase() ?? "",
        isCustom: true,
      });
    }
  }

  // 3. Sort: custom exercises first (user's own), then alphabetical
  entries.sort((a, b) => {
    if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // 4. Build compact text block
  const lines = entries.map((e) => {
    const prefix = e.isCustom ? "[custom] " : "";
    return `${e.id} | ${prefix}${e.name}${e.category ? ` (${e.category})` : ""}`;
  });

  const indexText = `EXERCISE ID REFERENCE (use these exact IDs — NEVER invent your own):\n${lines.join("\n")}`;

  // Cache
  cachedIndex = indexText;
  cachedUserId = userId;

  return indexText;
}

/**
 * Clear the cache (e.g., after user adds a custom exercise).
 */
export function clearExerciseIndexCache(): void {
  cachedIndex = null;
  cachedUserId = null;
}

/**
 * Resolve an exercise name or ID to a valid exercise ID.
 * Tries: exact ID match → exact name match → fuzzy substring match.
 */
export function resolveExerciseInput(
  input: string,
  index: ExerciseEntry[],
): string | null {
  if (!input) return null;

  const trimmed = input.trim();

  // 1. Exact ID match
  const exactId = index.find((e) => e.id === trimmed);
  if (exactId) return exactId.id;

  // 2. Case-insensitive exact name match
  const lower = trimmed.toLowerCase();
  const exactName = index.find((e) => e.name === lower);
  if (exactName) return exactName.id;

  // 3. Fuzzy: input is contained in name (handles "bench" → "bench press")
  const contains = index.find((e) => e.name.includes(lower));
  if (contains) return contains.id;

  // 4. Fuzzy: name contains all words from input
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const allWords = index.find((e) =>
      words.every((w) => e.name.includes(w)),
    );
    if (allWords) return allWords.id;
  }

  return null;
}

/**
 * Build the full exercise index as an array (for programmatic resolution).
 * Not cached — call buildExerciseIndexText() for the text prompt version.
 */
export async function buildExerciseIndex(
  supabase: SupabaseClient,
  userId: string,
): Promise<ExerciseEntry[]> {
  const entries: ExerciseEntry[] = [];

  // Standard exercises
  const { data: standardData } = await supabase
    .from("exercises")
    .select("exercise_id, name, body_parts, target_muscles");

  if (standardData) {
    for (const e of standardData) {
      const bodyParts = (e.body_parts as string[]) ?? [];
      const muscles = (e.target_muscles as string[]) ?? [];
      const category = bodyParts[0] ?? muscles[0] ?? "";
      entries.push({
        id: e.exercise_id as string,
        name: (e.name as string).toLowerCase(),
        category: category.toLowerCase(),
        isCustom: false,
      });
    }
  }

  // User's custom exercises
  const { data: customData } = await supabase
    .from("custom_exercises")
    .select("id, name, body_part")
    .eq("user_id", userId);

  if (customData) {
    for (const e of customData) {
      entries.push({
        id: `custom_${e.id as string}`,
        name: (e.name as string).toLowerCase(),
        category: (e.body_part as string)?.toLowerCase() ?? "",
        isCustom: true,
      });
    }
  }

  return entries;
}
