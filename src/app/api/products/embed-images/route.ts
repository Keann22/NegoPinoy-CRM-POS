import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncProductImageEmbeddings } from '@/lib/services/product-image-embedding-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/**
 * POST /api/products/embed-images
 * Synchronizes pgvector image embeddings for up to 50 product IDs.
 * Protected by src/middleware.ts (staff-only).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawIds: unknown = body?.productIds;
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ error: 'productIds array is required' }, { status: 400 });
    }

    const productIds = Array.from(
      new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    ).slice(0, 50);

    if (productIds.length === 0) {
      return NextResponse.json({ error: 'At least one valid productId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const result = await syncProductImageEmbeddings(supabase, productIds);

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sync product image embeddings';
    console.error('[EmbedImages] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
