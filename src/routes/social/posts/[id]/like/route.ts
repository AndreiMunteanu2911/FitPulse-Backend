import { NextRequest, NextResponse } from "../../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../../helper/supabaseServer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: postId } = await params;

  const { data: existing } = await supabase
    .from("post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("post_likes").delete().eq("id", existing.id);
    return NextResponse.json({ liked: false });
  }

  const { error } = await supabase
    .from("post_likes")
    .insert({ post_id: postId, user_id: user.id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ liked: true });
}
