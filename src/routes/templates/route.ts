import { NextRequest, NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";
import { resolveExercises } from "../../helper/resolveExercises";
import { templateMutationSchema } from "../../lib/validations";

interface TemplateExercise {
  exercise_id: string;
  order_index: number;
}

interface Template {
  template_exercises?: TemplateExercise[];
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const templateId = searchParams.get("templateId");

  if (templateId) {
    // Get single template with exercises
    const { data, error } = await supabase
      .from("workout_templates")
      .select("*, template_exercises (*)")
      .eq("id", templateId)
      .eq("user_id", user.id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const exerciseIds = (data?.template_exercises ?? []).map((te: TemplateExercise) => te.exercise_id);
    const exerciseMap = await resolveExercises(supabase, exerciseIds);

    const enriched = {
      ...data,
      template_exercises: (data?.template_exercises ?? [])
        .sort((a: TemplateExercise, b: TemplateExercise) => a.order_index - b.order_index)
        .map((te: TemplateExercise) => ({
          ...te,
          exercise: exerciseMap.get(te.exercise_id) ?? {
            exercise_id: te.exercise_id,
            name: te.exercise_id,
            is_custom: false,
          },
        })),
    };

    return NextResponse.json({ template: enriched });
  }

  // Get all templates
  const { data, error } = await supabase
    .from("workout_templates")
    .select("*, template_exercises (*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allExerciseIds = [
    ...new Set(
      (data || []).flatMap((t: Template) =>
        (t.template_exercises || []).map((te) => te.exercise_id)
      )
    ),
  ];
  const exerciseMap = await resolveExercises(supabase, allExerciseIds);

  const templates = (data || []).map((t: Template) => ({
    ...t,
    template_exercises: (t.template_exercises || [])
      .sort((a: TemplateExercise, b: TemplateExercise) => a.order_index - b.order_index)
      .map((te: TemplateExercise) => ({
        ...te,
        exercise: exerciseMap.get(te.exercise_id) ?? {
          exercise_id: te.exercise_id,
          name: te.exercise_id,
          is_custom: false,
        },
      })),
  }));

  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = templateMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid template" }, { status: 400 });
  const { data: id, error } = await supabase.rpc("save_workout_template", {
    p_id: null,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_exercise_ids: parsed.data.exercises.map((exercise) => exercise.exercise_id),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: { id, ...parsed.data, user_id: user.id } });
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = templateMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.id) return NextResponse.json({ error: "Invalid template" }, { status: 400 });
  const { data: id, error } = await supabase.rpc("save_workout_template", {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_exercise_ids: parsed.data.exercises.map((exercise) => exercise.exercise_id),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: { id, ...parsed.data, user_id: user.id } });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Template ID is required" }, { status: 400 });

  const { error } = await supabase
    .from("workout_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
