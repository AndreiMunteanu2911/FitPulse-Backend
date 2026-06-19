// ── User Profile ─────────────────────────────────────────────────────────────
// GET  /api/user/profile  — Fetch current user's profile
// PUT  /api/user/profile  — Update profile (onboarding or edit)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";
import { profileSchema } from "../../../lib/validations";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_stats")
    .select("display_name, birthday, gender, height_cm, onboarding_done")
    .eq("user_id", user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    profile: {
      ...data,
      display_name:
        (typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : null) ??
        data.display_name,
    },
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = profileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile details" }, { status: 400 });
  const { display_name, birthday, gender, height_cm, onboarding_done } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (display_name !== undefined) updates.display_name = display_name;
  if (birthday !== undefined) updates.birthday = birthday;
  if (gender !== undefined) updates.gender = gender;
  if (height_cm !== undefined) updates.height_cm = height_cm;
  if (onboarding_done !== undefined) updates.onboarding_done = onboarding_done;

  if (display_name !== undefined) {
    const { error: authError } = await supabase.auth.updateUser({
      data: { ...user.user_metadata, display_name },
    });
    if (authError) return NextResponse.json({ error: "Unable to update display name" }, { status: 500 });
  }

  // First try to update existing row
  let { data, error } = await supabase
    .from("user_stats")
    .update(updates)
    .eq("user_id", user.id)
    .select("display_name, birthday, gender, height_cm, onboarding_done")
    .single();

  // If no row exists, insert one
  if (error?.code === "PGRST116" || !data) {
    const res = await supabase
      .from("user_stats")
      .insert({ user_id: user.id, ...updates })
      .select("display_name, birthday, gender, height_cm, onboarding_done")
      .single();
    data = res.data;
    error = res.error;
  }

  if (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}
