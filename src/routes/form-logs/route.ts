import { NextRequest, NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";
import { formSessionAnalysisSchema } from "../../lib/validations";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = formSessionAnalysisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: "Invalid form session payload",
      details: parsed.error.flatten(),
    }, { status: 400 });
  }

  const { exercise_id, ...analysis } = parsed.data;
  const { data, error } = await supabase
    .from("form_logs")
    .insert({
      user_id: user.id,
      exercise_id,
      ...analysis,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = body && typeof body.id === "string" ? body.id : null;
  const parsed = formSessionAnalysisSchema.safeParse(body?.analysis);
  if (!id || !parsed.success) {
    return NextResponse.json({ error: "Invalid form session update" }, { status: 400 });
  }

  const { exercise_id: _exerciseId, ...analysis } = parsed.data;
  const { data, error } = await supabase
    .from("form_logs")
    .update(analysis)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data });
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const exerciseId = searchParams.get("exerciseId");
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  let query = supabase
    .from("form_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (exerciseId) {
    query = query.eq("exercise_id", exerciseId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data });
}
