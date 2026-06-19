import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../helper/supabaseServer";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: commentId } = await params;

  const { data: comment } = await supabase
    .from("blog_comments")
    .select("user_id")
    .eq("id", commentId)
    .single();

  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  if (comment.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("blog_comments").delete().eq("id", commentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}