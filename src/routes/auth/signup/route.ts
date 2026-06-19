import { NextRequest, NextResponse } from "../../../compat/next-server";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";

const signupRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6).max(128),
  display_name: z.string().trim().min(1).max(80),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = signupRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid account details." }, { status: 400 });
  }

  const { email, password, display_name } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const displayName = display_name.trim();

  // Sign up the user
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  });
  if (error) return NextResponse.json({ error: "Unable to create account." }, { status: 400 });

  // If signup succeeded and we have a session (no email confirmation required),
  // create the user_stats row with the display_name
  if (data.user && data.session && displayName) {
    await supabase
      .from("user_stats")
      .upsert({ user_id: data.user.id, display_name: displayName }, { onConflict: "user_id" });
  }

  return NextResponse.json({ user: data.user, session: data.session });
}
