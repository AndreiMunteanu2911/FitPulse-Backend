-- =============================================================================
-- Migration 014: achievements (static catalogue, admin-manageable)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.achievements (
  id          TEXT     PRIMARY KEY,
  uuid        UUID     NOT NULL DEFAULT gen_random_uuid(),
  name        TEXT     NOT NULL,
  description TEXT     NOT NULL,
  icon        TEXT     NOT NULL,
  xp_reward   INTEGER  NOT NULL DEFAULT 0,
  category    TEXT     NOT NULL CHECK (category IN ('workouts','streaks','records','volume'))
);

-- Seed data (uuid generated per row for tracking)
INSERT INTO public.achievements (id, name, description, icon, xp_reward, category) VALUES
  ('first_workout',  'First Step',       'Complete your first workout',         '🏋️',    50,  'workouts'),
  ('workouts_5',     'Warm Up',          'Complete 5 workouts',                 '🔥',   100,  'workouts'),
  ('workouts_10',    'Getting Serious',  'Complete 10 workouts',                '💪',   200,  'workouts'),
  ('workouts_25',    'Dedicated',        'Complete 25 workouts',                '🥇',   300,  'workouts'),
  ('workouts_100',   'Century Club',     'Complete 100 workouts',               '💯',  1000,  'workouts'),
  ('streak_3',       'Hat Trick',        'Maintain a 3-day workout streak',     '⚡',    75,  'streaks'),
  ('streak_7',       'On Fire',          'Maintain a 7-day workout streak',     '🔥',   150,  'streaks'),
  ('streak_30',      'Unstoppable',      'Maintain a 30-day workout streak',    '🚀',   500,  'streaks'),
  ('pr_1',           'Record Setter',    'Set your first personal record',      '🏆',    75,  'records'),
  ('pr_5',           'PR Crusher',       'Set 5 personal records',              '🥊',   150,  'records'),
  ('pr_10',          'Record Breaker',   'Set 10 personal records',             '💎',   300,  'records'),
  ('volume_10k',     'Iron Starter',     'Lift 10,000 kg total volume',         '🦾',   100,  'volume'),
  ('volume_50k',     'Heavy Lifter',     'Lift 50,000 kg total volume',         '🏋️‍♂️',  250,  'volume'),
  ('volume_100k',    'Volume King',      'Lift 100,000 kg total volume',        '👑',   500,  'volume')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- Achievement catalogue is public-read (no user-specific data)
CREATE POLICY "achievements_public_read" ON public.achievements
  FOR SELECT USING (true);

-- Admins can manage achievements (requires role = 'admin' in user_stats)
CREATE POLICY "admins_manage_achievements" ON public.achievements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_stats
      WHERE user_stats.user_id = auth.uid()
        AND user_stats.role = 'admin'
    )
  );
