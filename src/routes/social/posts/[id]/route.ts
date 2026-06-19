import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../helper/supabaseServer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: postId } = await params;

  let action = req.nextUrl.searchParams.get("action");
  try {
    const body = await req.json();
    if (typeof body?.action === "string") action = body.action;
  } catch {
    // POST without JSON is allowed for backward-compatible like toggles.
  }

  if (action && action !== "toggle_like" && action !== "like") {
    return NextResponse.json({ error: "Unsupported post action" }, { status: 400 });
  }

  const { data: existingLike, error: lookupError } = await supabase
    .from("post_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  if (existingLike) {
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ liked: false });
  }

  const { error } = await supabase
    .from("post_likes")
    .insert({ post_id: postId, user_id: user.id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ liked: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: postId } = await params;

  const { data: post } = await supabase
    .from("posts")
    .select("user_id")
    .eq("id", postId)
    .single();

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (post.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
