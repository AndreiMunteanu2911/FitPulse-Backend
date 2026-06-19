import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../helper/supabaseServer";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { friendship_id, action } = await req.json();
  if (!friendship_id || !action) {
    return NextResponse.json({ error: "friendship_id and action are required" }, { status: 400 });
  }

  if (!["accept", "decline", "remove"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: friendship, error: fetchError } = await supabase
    .from("friendships")
    .select("*")
    .eq("id", friendship_id)
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
    .single();

  if (fetchError || !friendship) {
    return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
  }

  if (action === "remove" || action === "decline") {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", friendship_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "accept") {
    if (friendship.friend_id !== user.id) {
      return NextResponse.json({ error: "Only the recipient can accept" }, { status: 403 });
    }
    const { data, error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendship_id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ friendship: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
