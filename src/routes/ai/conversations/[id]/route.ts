// ── AI Conversation by ID ───────────────────────────────────────────────────
// GET    /api/ai/conversations/[id]    — load conversation with messages
// DELETE /api/ai/conversations/[id]    — delete conversation
// PATCH  /api/ai/conversations/[id]    — update title
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../../compat/next-server";
import { createSupabaseServerClient } from "../../../../helper/supabaseServer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load messages
  const { data: messages, error: msgError } = await supabase
    .from("ai_messages")
    .select("id, client_id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });
  return NextResponse.json({ messages });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const title = (body.title as string)?.trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const { error } = await supabase
    .from("ai_conversations")
    .update({ title })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
