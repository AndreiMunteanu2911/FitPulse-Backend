import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../helper/supabaseServer";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ users: [] });

  const { data, error } = await supabase
    .from("public_user_profiles")
    .select("user_id, display_name")
    .ilike("display_name", `%${q}%`)
    .neq("user_id", user.id)
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = (data || []).map((u) => u.user_id);
  if (userIds.length === 0) return NextResponse.json({ users: [] });

  const { data: friendships } = await supabase
    .from("friendships")
    .select("user_id, friend_id, status")
    .or(
      userIds.map((id) =>
        `and(user_id.eq.${user.id},friend_id.eq.${id}),and(user_id.eq.${id},friend_id.eq.${user.id})`
      ).join(",")
    );

  const friendshipMap = new Map<string, { status: string; direction: "sent" | "received" }>();
  for (const f of friendships || []) {
    const otherId = f.user_id === user.id ? f.friend_id : f.user_id;
    const direction = f.user_id === user.id ? "sent" : "received";
    friendshipMap.set(otherId, { status: f.status, direction });
  }

  const users = (data || []).map((u) => {
    const fs = friendshipMap.get(u.user_id);
    let friendship_status: "none" | "pending_sent" | "pending_received" | "accepted" = "none";
    if (fs) {
      if (fs.status === "accepted") friendship_status = "accepted";
      else if (fs.direction === "sent") friendship_status = "pending_sent";
      else friendship_status = "pending_received";
    }
    return { user_id: u.user_id, display_name: u.display_name, friendship_status };
  });

  return NextResponse.json({ users });
}
