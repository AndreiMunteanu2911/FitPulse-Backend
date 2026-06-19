import { NextRequest, NextResponse } from "../../../compat/next-server";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const redirectUrl = new URL("/checkout-success", req.url);

  if (!sessionId) {
    redirectUrl.searchParams.set("error", "missing_session");
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.searchParams.set("session_id", sessionId);

  return NextResponse.redirect(redirectUrl);
}
