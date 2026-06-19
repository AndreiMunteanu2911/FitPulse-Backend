import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";
import { resolveExercises } from "../../../helper/resolveExercises";

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function generateWorkoutSummary(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, workoutId: string): Promise<string | null> {
  const { data: workout } = await supabase
    .from("workouts")
    .select("*, workout_exercises(*, sets(*))")
    .eq("id", workoutId)
    .single();

  if (!workout || !workout.workout_exercises?.length) return null;

  const exerciseIds = workout.workout_exercises.map((we: { exercise_id: string }) => we.exercise_id);
  const exerciseMap = await resolveExercises(supabase, exerciseIds);

  const lines: string[] = [];
  lines.push(`🏋️ ${capitalize(workout.name)}`);

  for (const we of workout.workout_exercises) {
    const exercise = exerciseMap.get(we.exercise_id);
    const name = exercise ? capitalize(exercise.name) : we.exercise_id;
    const setsCount = we.sets?.length || 0;
    const topSet = we.sets?.reduce((best: { reps: number; weight: number } | null, s: { reps: number; weight: number }) =>
      !s ? s : !best ? s : s.reps * s.weight > best.reps * best.weight ? s : best, null as { reps: number; weight: number } | null);

    if (setsCount > 0 && topSet) {
      lines.push(`• ${name}  ${setsCount}×${topSet.reps}  ${topSet.weight}kg`);
    } else {
      lines.push(`• ${name}  ${setsCount} sets`);
    }
  }

  const totalVolume = workout.workout_exercises.reduce((sum: number, we: { sets: { reps: number; weight: number }[] }) =>
    sum + (we.sets || []).reduce((s: number, set: { reps: number; weight: number }) => s + set.reps * set.weight, 0), 0);

  if (totalVolume > 0) {
    const volLabel = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume.toString();
    lines.push(`📊 Total Volume: ${volLabel} kg`);
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";
  let content: string | null = null;
  let workout_id: string | null = null;
  let image_url: string | null = null;
  let uploadedPath: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    content = (formData.get("content") as string) || null;
    workout_id = (formData.get("workout_id") as string) || null;
    const imageFile = formData.get("image") as File | null;

    if (imageFile) {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("post-images")
        .upload(`${user.id}/${Date.now()}-${imageFile.name}`, imageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from("post-images")
        .getPublicUrl(uploadData.path);

      image_url = urlData.publicUrl;
      uploadedPath = uploadData.path;
    }
  } else {
    const body = await req.json();
    content = body.content ?? null;
    workout_id = body.workout_id ?? null;
  }

  if (!content && !image_url && !workout_id) {
    return NextResponse.json({ error: "Post must have content, image, or workout" }, { status: 400 });
  }

  let workout_summary: string | null = null;
  if (workout_id) {
    workout_summary = await generateWorkoutSummary(supabase, workout_id);
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({ user_id: user.id, content, image_url, workout_id, workout_summary })
    .select("*")
    .single();

  if (error) {
    if (uploadedPath) await supabase.storage.from("post-images").remove([uploadedPath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: userStats } = await supabase
    .from("user_stats")
    .select("display_name")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    post: {
      ...data,
      user_stats: userStats ?? { display_name: null },
      likes_count: 0,
      comments_count: 0,
      liked_by_me: false,
    },
  });
}
