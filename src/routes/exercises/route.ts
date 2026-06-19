import { NextRequest, NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";

const BATCH_SIZE = 20;

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "0");
  const search = searchParams.get("search") ?? "";
  const bodyPart = searchParams.get("bodyPart") ?? "";
  const muscle = searchParams.get("muscle") ?? "";
  const equipment = searchParams.get("equipment") ?? "";
  const favoritesOnly = searchParams.get("favorites") === "true";

  // Get user favorite exercise IDs if filtering by favorites
  let favoriteExerciseIds: string[] = [];
  if (favoritesOnly) {
    const { data: favs } = await supabase
      .from("user_exercises")
      .select("exercise_id")
      .eq("user_id", user.id)
      .eq("is_favorite", true);
    favoriteExerciseIds = favs?.map(f => f.exercise_id) || [];
  }

  let query = supabase.from("exercises").select("*").not("exercise_id", "like", "custom_%");

  // Apply filters (custom exercises don't have these fields)
  if (bodyPart) query = query.ilike("body_parts", "%" + bodyPart + "%");
  if (muscle) query = query.ilike("target_muscles", "%" + muscle + "%");
  if (equipment) query = query.ilike("equipments", "%" + equipment + "%");
  if (favoritesOnly && favoriteExerciseIds.length > 0) {
    query = query.in("exercise_id", favoriteExerciseIds);
  } else if (favoritesOnly) {
    return NextResponse.json({ exercises: [], hasMore: false });
  }

  let data, error;
  if (search.trim() === "") {
    const res = await query.range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);
    data = res.data ?? [];
    error = res.error;
  } else {
    const words = search.trim().split(/\s+/).filter(Boolean);
    for (const word of words) query = query.ilike("name", `%${word}%`);
    const res = await query.range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);
    data = res.data ?? [];
    error = res.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Combine and process standard exercises
  const processed = data.map((e: { name?: string }) => ({
    ...e,
    name: e.name ? e.name.charAt(0).toUpperCase() + e.name.slice(1) : e.name,
    is_custom: false,
  }));

  // Include custom exercises only on page 0 (or when searching) to avoid duplicates during pagination
  let allExercises = processed;
  if (page === 0 || search.trim() !== "") {
    const customExercisesRes = await supabase
      .from("custom_exercises")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    let customExercises = (customExercisesRes.data ?? []).map((e) => ({
      exercise_id: `custom_${e.id}`,
      name: e.name,
      body_parts: e.body_part ? [e.body_part] : null,
      is_custom: true,
      created_at: e.created_at,
    }));

    if (search.trim() !== "") {
      const searchLower = search.toLowerCase();
      customExercises = customExercises.filter((e) =>
        e.name.toLowerCase().includes(searchLower)
      );
      // When searching, show custom exercises first
      allExercises = [...customExercises, ...processed];
    } else {
      // On page 0 (no search), append custom exercises at the end
      allExercises = [...processed, ...customExercises];
    }
  }

  return NextResponse.json({ exercises: allExercises, hasMore: processed.length === BATCH_SIZE });
}
