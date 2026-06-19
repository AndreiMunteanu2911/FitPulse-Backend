import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const friendships = data || [];

  const userIds = [...new Set(friendships.flatMap((f) => [f.user_id, f.friend_id]))] as string[];
  const userStatsMap = new Map<string, { display_name: string | null }>();
  if (userIds.length > 0) {
    const { data: userStats } = await supabase
      .from("user_stats")
      .select("user_id, display_name")
      .in("user_id", userIds);
    userStats?.forEach((stat) => userStatsMap.set(stat.user_id, stat));
  }

  const enriched = friendships.map((f) => ({
    ...f,
    user_stats: userStatsMap.get(f.user_id) ?? { display_name: null },
    friend_stats: userStatsMap.get(f.friend_id) ?? { display_name: null },
  }));

  return NextResponse.json({ friendships: enriched });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { friend_id } = await req.json();
  if (!friend_id) return NextResponse.json({ error: "friend_id is required" }, { status: 400 });
  if (friend_id === user.id) return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 });

  const { data: existing } = await supabase
    .from("friendships")
    .select("id, status")
    .or(
      `and(user_id.eq.${user.id},friend_id.eq.${friend_id}),and(user_id.eq.${friend_id},friend_id.eq.${user.id})`
    )
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "Friendship already exists" }, { status: 409 });

  const { data, error } = await supabase
    .from("friendships")
    .insert({ user_id: user.id, friend_id, status: "pending" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ friendship: data });
}
