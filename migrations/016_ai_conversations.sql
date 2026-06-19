-- =============================================================================
-- Migration 016: ai_conversations (AI coach conversations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated ON public.ai_conversations (user_id, updated_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_ai_conversations" ON public.ai_conversations
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger for auto-updating updated_at
CREATE OR REPLACE TRIGGER trg_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
