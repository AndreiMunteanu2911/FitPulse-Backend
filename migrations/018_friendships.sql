-- =============================================================================
-- Migration: Friendships
-- =============================================================================

-- Friendships
CREATE TABLE IF NOT EXISTS public.friendships (
                                                  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status     TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, friend_id),
    CHECK (user_id <> friend_id),
    CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_stats(user_id),
    CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES public.user_stats(user_id)
    );

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_visible_to_involved" ON public.friendships
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_insert_own" ON public.friendships
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "friendships_update_involved" ON public.friendships
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_delete_involved" ON public.friendships
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE OR REPLACE TRIGGER trg_friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();