import { NextRequest, NextResponse } from "../../../compat/next-server";
import { getStripeClient } from "../../../helper/stripe";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, stripe_session_id")
    .eq("stripe_session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: "Failed to load order." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  try {
    const checkoutSession = await getStripeClient().checkout.sessions.retrieve(sessionId);
    if (checkoutSession.metadata?.userId !== user.id || checkoutSession.metadata?.orderId !== order.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      paymentStatus: checkoutSession.payment_status,
      orderStatus: order.status,
      purchaseType: checkoutSession.metadata?.type ?? null,
    });
  } catch (error) {
    console.error("[shop-confirm] failed", error);
    return NextResponse.json({ error: "Failed to load checkout session." }, { status: 502 });
  }
}
