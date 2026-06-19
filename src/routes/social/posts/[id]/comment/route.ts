import { NextRequest, NextResponse } from "../../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../../helper/supabaseServer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: postId } = await params;
  const { content } = await req.json();
  if (!content?.trim()) {
    return NextResponse.json({ error: "Comment content is required" }, { status: 400 });
  }

  const { data: comment, error } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, user_id: user.id, content: content.trim() })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: userStats } = await supabase
    .from("user_stats")
    .select("user_id, display_name")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    comment: {
      ...comment,
      user_stats: userStats ?? { display_name: null },
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: postId } = await params;
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "10");
  const offset = parseInt(searchParams.get("offset") || "0");

  const { data: comments, error, count } = await supabase
    .from("post_comments")
    .select("*", { count: "exact" })
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enrichedComments = (comments || []).map((comment) => ({
    ...comment,
    user_stats: { display_name: null },
  }));

  if (enrichedComments.length > 0) {
    const userIds = [...new Set(enrichedComments.map((c) => c.user_id))];
    const { data: userStats } = await supabase
      .from("public_user_profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);

    const statsMap = new Map(userStats?.map((s) => [s.user_id, s]) || []);
    enrichedComments.forEach((c) => {
      c.user_stats = statsMap.get(c.user_id) ?? { display_name: null };
    });
  }

  return NextResponse.json({ comments: enrichedComments, total: count || 0 });
}
