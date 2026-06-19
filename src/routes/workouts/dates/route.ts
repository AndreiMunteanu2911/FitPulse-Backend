import { NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("workouts")
    .select("workout_date")
    .eq("user_id", user.id)
    .eq("status", "completed");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dates = [...new Set((data ?? []).map((w) => w.workout_date as string))];
  return NextResponse.json({ dates });
}
