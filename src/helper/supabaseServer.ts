import { createServerClient } from "@supabase/ssr";
import { cookies } from "../compat/next-headers";
import { NextResponse } from "../compat/next-server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            cookieStore.set(name, value, cookieOptions);
          });
        },
      },
    }
  );
}

export interface AdminContext {
  supabase: SupabaseClient;
  user: User;
}

export interface UserContext {
  supabase: SupabaseClient;
  user: User;
}

export async function requireUser(): Promise<UserContext | { error: NextResponse<{ error: string }> }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { supabase, user };
}

/**
 * Checks that the current user is authenticated AND has the admin role.
 * Returns { supabase, user } on success, or a NextResponse error on failure.
 *
 * Usage:
 *   const guard = await requireAdmin();
 *   if ("error" in guard) return guard.error;
 *   const { supabase, user } = guard;
 */
export async function requireAdmin(): Promise<
  | AdminContext
  | { error: NextResponse<{ error: string }> }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: roleData } = await supabase
    .from("user_stats")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (roleData?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, user };
}
