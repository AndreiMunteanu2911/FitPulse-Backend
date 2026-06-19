import { NextRequest, NextResponse } from "../../../compat/next-server";
import { createSupabaseServerClient, requireAdmin } from "../../../helper/supabaseServer";

type ProductFormPayload = {
  id?: string;
  name: string;
  description: string | null;
  price_usd: number | null;
  image_url: string | null;
  stock_quantity: number;
  is_physical: boolean;
  image: File | null;
};

async function uploadProductImage(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, image: File) {
  const fileName = `products/${Date.now()}-${image.name}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(fileName, image, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(uploadData.path);
  return urlData.publicUrl;
}

function getStoredProductImagePath(imageUrl: string | null) {
  if (!imageUrl) return null;
  const prefix = "/storage/v1/object/public/product-images/";
  const index = imageUrl.indexOf(prefix);
  if (index === -1) return null;
  return imageUrl.slice(index + prefix.length);
}

async function deleteStoredProductImage(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, imageUrl: string | null) {
  const path = getStoredProductImagePath(imageUrl);
  if (!path) return;
  await supabase.storage.from("product-images").remove([path]);
}

async function parseProductFormData(req: NextRequest): Promise<ProductFormPayload> {
  const formData = await req.formData();
  return {
    id: (formData.get("id") as string | null) || undefined,
    name: (formData.get("name") as string) || "",
    description: (formData.get("description") as string | null) || null,
    price_usd: formData.get("price_usd") ? parseFloat(formData.get("price_usd") as string) : null,
    image_url: (formData.get("image_url") as string | null) || null,
    stock_quantity: formData.get("stock_quantity") ? parseInt(formData.get("stock_quantity") as string) : 0,
    is_physical: formData.get("is_physical") === "true",
    image: (formData.get("image") as File | null) || null,
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  try {
    const payload = await parseProductFormData(req);

    if (!payload.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const image_url = payload.image && payload.image.size > 0
      ? await uploadProductImage(supabase, payload.image)
      : payload.image_url;

    const { data, error } = await supabase
      .from("products")
      .insert({
        name: payload.name,
        description: payload.description,
        price_usd: payload.price_usd,
        image_url,
        stock_quantity: payload.stock_quantity,
        is_physical: payload.is_physical,
      })
      .select()
      .single();

    if (error) {
      if (payload.image && image_url) await deleteStoredProductImage(supabase, image_url);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ product: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create product.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  try {
    const payload = await parseProductFormData(req);
    if (!payload.id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select("*")
      .eq("id", payload.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const previousImageUrl = existing.image_url as string | null;
    let image_url = payload.image_url;
    if (payload.image && payload.image.size > 0) {
      image_url = await uploadProductImage(supabase, payload.image);
    }

    const { data, error } = await supabase
      .from("products")
      .update({
        name: payload.name,
        description: payload.description,
        price_usd: payload.price_usd,
        image_url,
        stock_quantity: payload.stock_quantity,
        is_physical: payload.is_physical,
      })
      .eq("id", payload.id)
      .select()
      .single();

    if (error) {
      if (payload.image && image_url !== previousImageUrl) await deleteStoredProductImage(supabase, image_url);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (previousImageUrl !== image_url) {
      await deleteStoredProductImage(supabase, previousImageUrl);
    }

    return NextResponse.json({ product: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update product.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;
  const { supabase } = guard;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
  }

  const { data: product, error: fetchError } = await supabase
    .from("products")
    .select("image_url")
    .eq("id", id)
    .single();

  if (fetchError || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await deleteStoredProductImage(supabase, product.image_url);
  return NextResponse.json({ success: true });
}
