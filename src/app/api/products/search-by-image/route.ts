import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { embedImageBase64, toPgVector } from '@/lib/services/product-image-embedding-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BASE64_BYTES = 6 * 1024 * 1024;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/**
 * POST /api/products/search-by-image
 * Embeds a pasted/uploaded/captured product image via Gemini and queries pgvector for visual matches.
 * Protected by src/middleware.ts (staff-only).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }
    if (imageBase64.length > MAX_BASE64_BYTES) {
      return NextResponse.json({ error: 'Image is too large. Please use a smaller photo.' }, { status: 413 });
    }

    const rawMatchCount = Number(body?.matchCount);
    const matchCount = Number.isFinite(rawMatchCount)
      ? Math.max(1, Math.min(50, Math.round(rawMatchCount)))
      : 20;

    const rawThreshold = Number(body?.matchThreshold);
    const matchThreshold = Number.isFinite(rawThreshold)
      ? Math.max(0, Math.min(1, rawThreshold))
      : 0.70;

    const vector = await embedImageBase64(imageBase64);
    const supabase = getSupabaseAdmin();

    const { data: matches, error } = await supabase.rpc('match_products_by_image_embedding', {
      query_embedding: toPgVector(vector),
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      throw error;
    }

    const { count: indexedCount } = await supabase
      .from('product_image_embeddings')
      .select('id', { count: 'exact', head: true });

    return NextResponse.json({
      matches: matches || [],
      indexedCount: indexedCount ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to search by image';
    console.error('[SearchByImage] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
