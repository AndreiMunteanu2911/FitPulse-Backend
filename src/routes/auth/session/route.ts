import { NextResponse } from "../../../compat/next-server";
import { loadSessionUser } from "../../../lib/auth-session";

export async function GET() {
  const user = await loadSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  return NextResponse.json({
    user: {
      ...user,
    },
  });
}
