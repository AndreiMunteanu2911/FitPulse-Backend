import { NextRequest, NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient, requireAdmin } from "../../helper/supabaseServer";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));
  const cursor = req.nextUrl.searchParams.get("cursor");
  let postsQuery = supabase
    .from("blog_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (cursor) postsQuery = postsQuery.lt("created_at", cursor);
  const { data: postRows, error } = await postsQuery;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const hasMore = (postRows?.length ?? 0) > limit;
  const posts = (postRows ?? []).slice(0, limit);

  const postIds = (posts ?? []).map((p) => p.id);

  const [{ data: likes }, { data: comments }] = postIds.length
    ? await Promise.all([
        supabase.from("blog_likes").select("blog_post_id, user_id").in("blog_post_id", postIds),
        supabase.from("blog_comments").select("blog_post_id").in("blog_post_id", postIds),
      ])
    : [{ data: [] }, { data: [] }];

  const likesMap = new Map();
  (likes ?? []).forEach((like) => {
    const count = likesMap.get(like.blog_post_id) || 0;
    likesMap.set(like.blog_post_id, count + 1);
  });

  const commentsMap = new Map();
  (comments ?? []).forEach((comment) => {
    const count = commentsMap.get(comment.blog_post_id) || 0;
    commentsMap.set(comment.blog_post_id, count + 1);
  });

  const enrichedPosts = (posts ?? []).map((post) => ({
    ...post,
    likes_count: likesMap.get(post.id) || 0,
    comments_count: commentsMap.get(post.id) || 0,
    liked_by_me: user ? (likes ?? []).some((l) => l.blog_post_id === post.id && l.user_id === user.id) : false,
  }));

  return NextResponse.json({
    data: enrichedPosts,
    nextCursor: hasMore ? enrichedPosts[enrichedPosts.length - 1]?.created_at ?? null : null,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase, user } = guard;

  try {
    const formData = await req.formData();
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const image = formData.get("image") as File | null;
    let image_url = formData.get("image_url") as string | null;
    let uploadedPath: string | null = null;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
    }

    if (image && image.size > 0) {
      const fileName = `${Date.now()}-${image.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("blog-images")
        .upload(fileName, image);
      
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
      
      const { data: urlData } = supabase.storage
        .from("blog-images")
        .getPublicUrl(uploadData.path);
      
      image_url = urlData.publicUrl;
      uploadedPath = uploadData.path;
    }

    const { data, error } = await supabase
      .from("blog_posts")
      .insert({ title, content, image_url, author_id: user.id })
      .select()
      .single();

    if (error) {
      if (uploadedPath) await supabase.storage.from("blog-images").remove([uploadedPath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create blog post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
