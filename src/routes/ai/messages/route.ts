// ── AI Messages API ─────────────────────────────────────────────────────────
// POST /api/ai/messages — batch save user + assistant messages to a conversation
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";
import { aiMessagesSchema } from "../../../lib/validations";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = aiMessagesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  const { conversationId, messages } = parsed.data;

  // Verify conversation belongs to user
  const { data: conv, error: convError } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .single();

  if (convError || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Insert messages
  const rows = messages.map((m) => ({
    conversation_id: conversationId,
    client_id: m.clientId,
    role: m.role,
    content: m.content,
  }));

  const { error: insertError } = await supabase
    .from("ai_messages")
    .upsert(rows, { onConflict: "conversation_id,client_id", ignoreDuplicates: true });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Update conversation updated_at
  await supabase
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({ success: true });
}
