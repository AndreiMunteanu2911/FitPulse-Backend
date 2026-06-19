import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check if it's a custom exercise
  if (id.startsWith("custom_")) {
    const customId = id.replace("custom_", "");
    const { data, error } = await supabase
      .from("custom_exercises")
      .select("*")
      .eq("id", customId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }

    const exercise = {
      exercise_id: `custom_${data.id}`,
      name: data.name,
      is_custom: true,
      created_at: data.created_at,
    };

    return NextResponse.json({ exercise });
  }

  // Standard exercise lookup
  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("exercise_id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  return NextResponse.json({ exercise: { ...data, is_custom: false } });
}
