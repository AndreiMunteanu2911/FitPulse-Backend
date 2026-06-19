import type { User } from "../types";
import { createSupabaseServerClient } from "../helper/supabaseServer";

export async function loadSessionUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profileData } = await supabase
    .from("user_stats")
    .select("role, onboarding_done, display_name, birthday, gender, height_cm")
    .eq("user_id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? "",
    role: profileData?.role ?? "client",
    onboarding_done: profileData?.onboarding_done ?? false,
    display_name:
      (typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : null) ??
      profileData?.display_name ??
      null,
    birthday: profileData?.birthday ?? null,
    gender: profileData?.gender ?? null,
    height_cm: profileData?.height_cm ?? null,
  };
}
