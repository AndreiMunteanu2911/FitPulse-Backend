import { getSupabaseAdminClient } from "./supabaseAdmin";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdminClient>;

type ShippingAddressLike = {
  city?: string | null;
  country?: string | null;
  line1?: string | null;
  line2?: string | null;
  postal_code?: string | null;
  state?: string | null;
};

type ShippingDetailsLike = {
  name?: string | null;
  address?: ShippingAddressLike | null;
};

type PaymentIntentLike = {
  id?: string;
  shipping?: ShippingDetailsLike | null;
  latest_charge?: {
    shipping?: ShippingDetailsLike | null;
  } | null;
} | null;

type CheckoutSessionLike = {
  id?: string;
  metadata?: Record<string, string> | null;
  collected_information?: {
    shipping_details?: ShippingDetailsLike | null;
  } | null;
  shipping_details?: ShippingDetailsLike | null;
  customer_details?: {
    name?: string | null;
    address?: ShippingAddressLike | null;
  } | null;
};

function isShippingAddressLike(value: unknown): value is ShippingAddressLike {
  return !!value && typeof value === "object";
}

function extractShippingDetails(session: CheckoutSessionLike, paymentIntent: PaymentIntentLike): ShippingDetailsLike | null {
  const collectedShipping = session.collected_information?.shipping_details;
  if (collectedShipping?.address && isShippingAddressLike(collectedShipping.address)) return collectedShipping;

  const sessionShipping = session.shipping_details;
  if (sessionShipping?.address && isShippingAddressLike(sessionShipping.address)) return sessionShipping;

  const customerAddress = session.customer_details?.address;
  if (customerAddress && isShippingAddressLike(customerAddress)) {
    return {
      name: session.customer_details?.name,
      address: customerAddress,
    };
  }

  const paymentShipping = paymentIntent?.shipping;
  if (paymentShipping?.address && isShippingAddressLike(paymentShipping.address)) return paymentShipping;

  const chargeShipping = paymentIntent?.latest_charge?.shipping;
  if (chargeShipping?.address && isShippingAddressLike(chargeShipping.address)) return chargeShipping;

  return null;
}

export async function fulfillStripeProductOrder(
  supabaseAdmin: SupabaseAdmin,
  session: CheckoutSessionLike,
  paymentIntent: PaymentIntentLike = null,
) {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    return { status: "ignored", reason: "missing_order_id" as const };
  }

  const quantity = Math.max(1, Number(session.metadata?.quantity || 1));
  const shippingDetails = extractShippingDetails(session, paymentIntent);
  const shippingAddress = shippingDetails?.address ?? null;

  if (!shippingAddress) {
    console.warn("[shop-fulfillment] shipping address missing", {
      orderId,
      sessionId: session.id,
      hasCollectedShipping: Boolean(session.collected_information?.shipping_details),
      hasSessionShipping: Boolean(session.shipping_details),
      hasCustomerAddress: Boolean(session.customer_details?.address),
      hasPaymentIntentShipping: Boolean(paymentIntent?.shipping?.address),
      hasLatestCharge: Boolean(paymentIntent?.latest_charge?.shipping?.address),
    });
  }

  const { data, error } = await supabaseAdmin.rpc("fulfill_product_order", {
    p_order_id: orderId,
    p_session_id: session.id,
    p_quantity: quantity,
    p_shipping_address: shippingAddress,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || result.status !== "processed") {
    return { status: result?.status ?? "ignored" };
  }

  return {
    status: "processed" as const,
    paymentMethod: "stripe" as const,
    orderId,
    productId: result.product_id as string,
    shippingAddress,
    stripeSessionId: session.id,
  };
}
