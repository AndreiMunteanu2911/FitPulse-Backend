import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../helper/supabaseServer";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { id: postId } = await params;

  const { data: comments, error } = await supabase
    .from("blog_comments")
    .select("*")
    .eq("blog_post_id", postId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const commentUserIds = (comments ?? []).map((c) => c.user_id);
  
  const userStatsMap = new Map();

  if (commentUserIds.length > 0) {
    const { data: commentUserStats } = await supabase
      .from("public_user_profiles")
      .select("user_id, display_name")
      .in("user_id", commentUserIds);

    commentUserStats?.forEach((stat) => {
      userStatsMap.set(stat.user_id, stat);
    });
  }

  const enrichedComments = (comments || []).map((comment) => {
    const userStats = userStatsMap.get(comment.user_id);
    const { user_id, ...commentWithoutUserId } = comment;
    return {
      ...commentWithoutUserId,
      user: userStats ? {
        display_name: userStats.display_name,
      } : null,
    };
  });

  return NextResponse.json({ comments: enrichedComments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: postId } = await params;
  const { content } = await req.json();

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const { data: comment, error } = await supabase
    .from("blog_comments")
    .insert({ blog_post_id: postId, user_id: user.id, content: content.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: userStats } = await supabase
    .from("user_stats")
    .select("display_name")
    .eq("user_id", user.id)
    .single();

  const enrichedComment = {
    ...comment,
    user: userStats ? {
      display_name: userStats.display_name,
    } : null,
  };

  return NextResponse.json({ comment: enrichedComment });
}
