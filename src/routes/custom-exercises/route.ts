import { NextRequest, NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";

  let query = supabase
    .from("custom_exercises")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (search.trim() !== "") {
    query = query.ilike("name", "%" + search + "%");
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const customExercises = (data ?? []).map((e) => ({
    exercise_id: `custom_${e.id}`,
    name: e.name,
    body_part: e.body_part ?? null,
    is_custom: true,
    created_at: e.created_at,
  }));

  return NextResponse.json({ exercises: customExercises });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, body_part } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("custom_exercises")
    .insert({ user_id: user.id, name: name.trim(), body_part: body_part ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const exercise = {
    exercise_id: `custom_${data.id}`,
    name: data.name,
    body_part: data.body_part ?? null,
    is_custom: true,
    created_at: data.created_at,
  };

  return NextResponse.json({ exercise });
}
