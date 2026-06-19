import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient, requireAdmin } from "../../../helper/supabaseServer";

interface BlogPostUpdates {
  title?: string;
  content?: string;
  image_url?: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: post, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count: likesCount } = await supabase
    .from("blog_likes")
    .select("*", { count: "exact", head: true })
    .eq("blog_post_id", id);

  const { count: commentsCount } = await supabase
    .from("blog_comments")
    .select("*", { count: "exact", head: true })
    .eq("blog_post_id", id);

  let liked_by_me = false;
  if (user) {
    const { data: like } = await supabase
      .from("blog_likes")
      .select("id")
      .eq("blog_post_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    liked_by_me = !!like;
  }

  return NextResponse.json({ 
    data: {
      ...post,
      likes_count: likesCount || 0,
      comments_count: commentsCount || 0,
      liked_by_me,
    }
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase, user } = guard;

  const { id } = await params;

  try {
    const { data: post, error: fetchError } = await supabase
      .from("blog_posts")
      .select("author_id")
      .eq("id", id)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.author_id !== user.id) {
      return NextResponse.json({ error: "You can only edit your own posts" }, { status: 403 });
    }

    const formData = await req.formData();
    const title = formData.get("title") as string | null;
    const content = formData.get("content") as string | null;
    const image = formData.get("image") as File | null;
    const image_url = formData.get("image_url") as string | null;

    const updates: BlogPostUpdates = {};
    if (title) updates.title = title;
    if (content) updates.content = content;
    
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
      
      updates.image_url = urlData.publicUrl;
    } else if (image_url !== null) {
      updates.image_url = image_url;
    }

    const { data, error } = await supabase
      .from("blog_posts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update blog post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase, user } = guard;

  const { id } = await params;

  const { data: post, error: fetchError } = await supabase
    .from("blog_posts")
    .select("author_id, image_url")
    .eq("id", id)
    .single();

  if (fetchError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.author_id !== user.id) {
    return NextResponse.json({ error: "You can only delete your own posts" }, { status: 403 });
  }

  if (post.image_url) {
    const urlParts = post.image_url.split("/storage/v1/object/public/blog-images/");
    if (urlParts.length > 1) {
      const filePath = urlParts[1];
      await supabase.storage.from("blog-images").remove([filePath]);
    }
  }

  const { error } = await supabase
    .from("blog_posts")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
