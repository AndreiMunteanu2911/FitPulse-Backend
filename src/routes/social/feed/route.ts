import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";
import { resolveExercises } from "../../../helper/resolveExercises";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));
  const cursor = req.nextUrl.searchParams.get("cursor");
  const { data: friendships } = await supabase
    .from("friendships")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
  const feedUserIds = [
    user.id,
    ...(friendships ?? []).map((friendship) =>
      friendship.user_id === user.id ? friendship.friend_id : friendship.user_id
    ),
  ];

  let postsQuery = supabase
    .from("posts")
    .select(`
      *,
      post_likes(id, user_id),
      post_comments(id, user_id, content, created_at)
    `)
    .in("user_id", feedUserIds)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (cursor) postsQuery = postsQuery.lt("created_at", cursor);
  const { data: postsData, error } = await postsQuery;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hasMore = (postsData?.length ?? 0) > limit;
  const posts = (postsData || []).slice(0, limit);

  const userIds = [...new Set(posts.map((p) => p.user_id))] as string[];
  const userStatsMap = new Map<string, { display_name: string | null }>();
  if (userIds.length > 0) {
    const { data: userStats } = await supabase
      .from("public_user_profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);
    userStats?.forEach((stat) => userStatsMap.set(stat.user_id, stat));
  }

  const commentUserIds = [
    ...new Set(
      posts.flatMap((p) => (p.post_comments ?? []).map((c: { user_id: string }) => c.user_id))
    ),
  ] as string[];
  if (commentUserIds.length > 0) {
    const { data: commentUserStats } = await supabase
      .from("public_user_profiles")
      .select("user_id, display_name")
      .in("user_id", commentUserIds);
    commentUserStats?.forEach((stat) => userStatsMap.set(stat.user_id, stat));
  }

  const workoutIds = [...new Set(posts.map((p) => p.workout_id).filter(Boolean))] as string[];

  const workoutMap = new Map<string, unknown>();
  if (workoutIds.length > 0) {
    const { data: workoutsData } = await supabase
      .from("workouts")
      .select("*, workout_exercises(*, sets(*))")
      .in("id", workoutIds);

    if (workoutsData) {
      const allExerciseIds = [
        ...new Set(
          workoutsData.flatMap((w) =>
            (w.workout_exercises ?? []).map((we: { exercise_id: string }) => we.exercise_id)
          )
        ),
      ];
      const exerciseMap = await resolveExercises(supabase, allExerciseIds);

      for (const workout of workoutsData) {
        workoutMap.set(workout.id, {
          ...workout,
          workout_exercises: (workout.workout_exercises ?? [])
            .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
            .map((we: { exercise_id: string; sets: { set_number: number }[] }) => ({
              ...we,
              exercise: exerciseMap.get(we.exercise_id) ?? {
                exercise_id: we.exercise_id,
                name: we.exercise_id,
                is_custom: false,
              },
              sets: (we.sets ?? []).sort((a, b) => a.set_number - b.set_number),
            })),
        });
      }
    }
  }

  const enriched = posts.map((post) => ({
    ...post,
    user_stats: userStatsMap.get(post.user_id) ?? { display_name: null },
    post_comments: (post.post_comments ?? []).map((c: { user_id: string }) => ({
      ...c,
      user_stats: userStatsMap.get(c.user_id) ?? { display_name: null },
    })),
    likes_count: (post.post_likes ?? []).length,
    comments_count: (post.post_comments ?? []).length,
    liked_by_me: (post.post_likes ?? []).some((l: { user_id: string }) => l.user_id === user.id),
    workout: post.workout_id ? workoutMap.get(post.workout_id) ?? null : null,
  }));

  return NextResponse.json({
    posts: enriched,
    nextCursor: hasMore ? enriched[enriched.length - 1]?.created_at ?? null : null,
  });
}
