-- =============================================================================
-- Migration 017: ai_messages (messages within AI conversations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID         NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role            TEXT         NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created ON public.ai_messages (conversation_id, created_at ASC);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_ai_messages" ON public.ai_messages
  USING (
    auth.uid() = (SELECT user_id FROM public.ai_conversations WHERE id = conversation_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT user_id FROM public.ai_conversations WHERE id = conversation_id)
  );
