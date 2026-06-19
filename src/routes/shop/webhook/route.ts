import { NextRequest, NextResponse } from "../../../compat/next-server";
import { getStripeClient } from "../../../helper/stripe";
import { getSupabaseAdminClient } from "../../../helper/supabaseAdmin";
import { fulfillStripeProductOrder } from "../../../helper/shopFulfillment";

type CheckoutSessionLike = {
  id?: string;
  payment_status?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | {
    id?: string;
    shipping?: { name?: string | null; address?: unknown } | null;
    latest_charge?: { shipping?: { address?: unknown } | null } | null;
  } | null;
  shipping_details?: {
    name?: string | null;
    address?: unknown;
  } | null;
  customer_details?: {
    name?: string | null;
    address?: unknown;
  } | null;
  collected_information?: {
    shipping_details?: {
      name?: string | null;
      address?: unknown;
    } | null;
  } | null;
};

type PaymentIntentLike = {
  id?: string;
  shipping?: { name?: string | null; address?: unknown } | null;
  latest_charge?: { shipping?: { address?: unknown } | null } | null;
};

export async function POST(req: NextRequest) {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const stripe = getStripeClient();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook Error";
    console.error(`Webhook Error: ${message}`);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as CheckoutSessionLike;

    const checkoutSession = session.id
      ? ((await stripe.checkout.sessions.retrieve(session.id)) as unknown as CheckoutSessionLike)
      : session;

    const paymentIntent: PaymentIntentLike | null =
      typeof checkoutSession.payment_intent === "string"
        ? ((await stripe.paymentIntents.retrieve(checkoutSession.payment_intent, { expand: ["latest_charge"] })) as unknown as PaymentIntentLike)
        : (checkoutSession.payment_intent as PaymentIntentLike | null) ?? null;

    if (
      checkoutSession.metadata?.type === "product-order" &&
      (checkoutSession.payment_status === "paid" || checkoutSession.payment_status === "no_payment_required")
    ) {
      try {
        const supabaseAdmin = getSupabaseAdminClient();
        await fulfillStripeProductOrder(supabaseAdmin, checkoutSession as never, paymentIntent as never);
      } catch (error) {
        console.error("[shop-webhook] product fulfillment failed", error);
        return NextResponse.json({ error: "Webhook fulfillment failed." }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
