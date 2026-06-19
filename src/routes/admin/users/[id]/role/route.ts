// ── Admin: Change User Role ─────────────────────────────────────────────────
// PUT /api/admin/users/[id]/role — Change a user's role (client ↔ admin)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "../../../../../compat/next-server";
import { requireAdmin } from "../../../../../helper/supabaseServer";
import { getSupabaseAdminClient } from "../../../../../helper/supabaseAdmin";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { user: adminUser } = guard;

  const { id } = await params;
  const { role } = await req.json();

  if (!role || !["client", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid role. Must be 'client' or 'admin'" }, { status: 400 });
  }

  // Prevent admins from demoting themselves
  if (id === adminUser.id && role !== "admin") {
    return NextResponse.json({ error: "You cannot demote yourself" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { error } = await supabaseAdmin
    .from("user_stats")
    .update({ role })
    .eq("user_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
