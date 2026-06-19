import { NextRequest, NextResponse } from "../../../compat/next-server";
import { requireAdmin } from "../../../helper/supabaseServer";

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const productIds = [...new Set((orders || []).map((order) => order.product_id).filter(Boolean))];
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name, is_physical").in("id", productIds)
    : { data: [] };

  const productMap = new Map((products || []).map((product) => [product.id, product]));
  const normalizedOrders = (orders || []).map((order) => ({
    ...order,
    amount_usd: order.amount_usd == null ? null : Number(order.amount_usd),
    product: productMap.get(order.product_id) || null,
  }));

  return NextResponse.json({ orders: normalizedOrders });
}

const ALLOWED_ORDER_STATUSES = new Set(["pending", "completed", "cancelled", "shipped"]);

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!body.id || !body.status || !ALLOWED_ORDER_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Valid order id and status are required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: data });
}
