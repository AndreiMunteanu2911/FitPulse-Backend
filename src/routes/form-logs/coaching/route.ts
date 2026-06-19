import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient } from "../../../helper/supabaseServer";
import { generateFormCoaching } from "../../../lib/form-coaching";
import { MODELS } from "../../../lib/ai";
import { formCoachingRequestSchema } from "../../../lib/validations";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = formCoachingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: "Invalid coaching payload",
      details: parsed.error.flatten(),
    }, { status: 400 });
  }

  try {
    const coaching = await generateFormCoaching(parsed.data);
    return NextResponse.json({
      coaching,
      model: MODELS.chat,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to generate coaching",
    }, { status: 502 });
  }
}
