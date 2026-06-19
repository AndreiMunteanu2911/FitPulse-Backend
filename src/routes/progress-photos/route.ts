import { NextRequest, NextResponse } from "../../compat/next-server";
import { createSupabaseServerClient } from "../../helper/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("progress_photos").select("*").eq("user_id", user.id).order("log_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ photos: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const photo = formData.get("photo") as File | null;
  const log_date = formData.get("log_date") as string || new Date().toISOString().split("T")[0];
  const notes = formData.get("notes") as string | null;

  let photo_url = "";
  let uploadedPath: string | null = null;

  // If a photo file is provided, upload to Supabase Storage
  if (photo) {
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("progress-photos")
      .upload(`${user.id}/${Date.now()}-${photo.name}`, photo, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("progress-photos")
      .getPublicUrl(uploadData.path);

    photo_url = urlData.publicUrl;
    uploadedPath = uploadData.path;
  } else {
    // Allow providing a URL directly
    photo_url = formData.get("photo_url") as string || "";
  }

  if (!photo_url) {
    return NextResponse.json({ error: "Photo or photo_url is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("progress_photos")
    .insert({
      user_id: user.id,
      photo_url,
      log_date,
      notes,
    })
    .select()
    .single();

  if (error) {
    if (uploadedPath) await supabase.storage.from("progress-photos").remove([uploadedPath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ photo: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Photo ID is required" }, { status: 400 });

  // Get the photo to delete the file from storage
  const { data: photo } = await supabase
    .from("progress_photos")
    .select("photo_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (photo) {
    // Extract path from URL
    const urlParts = photo.photo_url.split("/storage/v1/object/public/progress-photos/");
    if (urlParts.length > 1) {
      const filePath = urlParts[1];
      await supabase.storage.from("progress-photos").remove([filePath]);
    }
  }

  const { error } = await supabase
    .from("progress_photos")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
