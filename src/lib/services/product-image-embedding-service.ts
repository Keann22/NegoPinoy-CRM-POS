import type { SupabaseClient } from '@supabase/supabase-js';

export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const EMBEDDING_DIMENSIONS = 768;

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** L2-normalizes a vector so cosine similarity works cleanly on truncated Matryoshka dims. */
export function normalizeVector(values: number[]): number[] {
  let normSq = 0;
  for (let i = 0; i < values.length; i++) {
    normSq += values[i] * values[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm === 0) return values;
  return values.map((v) => v / norm);
}

/** Formats an embedding array into pgvector's string representation `[v1,v2,...]`. */
export function toPgVector(values: number[]): string {
  return `[${values.join(',')}]`;
}

/** Extracts MIME type and raw base64 payload from either a data URI or plain base64 string. */
export function stripDataUri(input: string): { base64: string; mimeType: string } {
  const trimmed = input.trim();
  if (trimmed.startsWith('data:')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx !== -1) {
      const header = trimmed.slice(5, commaIdx);
      const mimeCandidate = header.split(';')[0]?.trim().toLowerCase();
      const mimeType = SUPPORTED_IMAGE_MIME_TYPES.has(mimeCandidate) ? mimeCandidate : 'image/jpeg';
      return { base64: trimmed.slice(commaIdx + 1), mimeType };
    }
  }
  return { base64: trimmed, mimeType: 'image/jpeg' };
}

/** Rejects placeholder or empty image URLs that shouldn't be visually indexed. */
export function isIndexableImageUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes('placehold.co')) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

function inferMimeType(url: string, contentType: string | null): string {
  if (contentType) {
    const clean = contentType.split(';')[0].trim().toLowerCase();
    if (clean === 'image/jpg') return 'image/jpeg';
    if (SUPPORTED_IMAGE_MIME_TYPES.has(clean)) return clean;
  }
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calls Gemini `gemini-embedding-2` on raw or data-URI base64 image data and returns a normalized 768-dim vector. */
export async function embedImageBase64(imageInput: string, mimeTypeOverride?: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const parsed = stripDataUri(imageInput);
  const mimeType = mimeTypeOverride && SUPPORTED_IMAGE_MIME_TYPES.has(mimeTypeOverride)
    ? mimeTypeOverride
    : parsed.mimeType;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const body = JSON.stringify({
    model: `models/${EMBEDDING_MODEL}`,
    content: {
      parts: [{ inline_data: { mime_type: mimeType, data: parsed.base64 } }],
    },
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (res.ok) {
      const json = await res.json();
      const values = json?.embedding?.values;
      if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Unexpected embedding response from ${EMBEDDING_MODEL}`);
      }
      return normalizeVector(values);
    }

    const errText = await res.text().catch(() => '');
    lastError = new Error(`Gemini embedding failed (${res.status}): ${errText.slice(0, 240)}`);
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      await sleep(1000);
      continue;
    }
    break;
  }

  throw lastError ?? new Error('Failed to generate image embedding.');
}

/** Downloads an image URL and embeds it via `embedImageBase64`. */
export async function embedImageUrl(imageUrl: string): Promise<number[]> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status}): ${imageUrl}`);
  }
  const mimeType = inferMimeType(imageUrl, res.headers.get('content-type'));
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Empty image response: ${imageUrl}`);
  }
  return embedImageBase64(buffer.toString('base64'), mimeType);
}

type ProductEmbeddingTarget = {
  id: string;
  name: string | null;
  images: string[] | null;
};

/**
 * Synchronizes `product_image_embeddings` for a list of product IDs:
 * - Removes embeddings for deleted/archived products or removed image URLs.
 * - Reuses existing embeddings when another product/variant already uses the same URL.
 * - Generates and stores embeddings for newly added product photos.
 */
export async function syncProductImageEmbeddings(
  supabaseAdmin: SupabaseClient,
  productIds: string[],
): Promise<{ indexed: number; reused: number; removed: number; failed: number }> {
  const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
  const summary = { indexed: 0, reused: 0, removed: 0, failed: 0 };
  if (uniqueIds.length === 0) return summary;

  const { data: products, error: prodErr } = await supabaseAdmin
    .from('products')
    .select('id, name, images')
    .in('id', uniqueIds);
  if (prodErr) throw prodErr;

  const { data: existingRows, error: existErr } = await supabaseAdmin
    .from('product_image_embeddings')
    .select('id, product_id, image_url')
    .in('product_id', uniqueIds);
  if (existErr) throw existErr;

  const existingByProduct = new Map<string, { id: string; image_url: string }[]>();
  for (const row of existingRows || []) {
    const list = existingByProduct.get(row.product_id) || [];
    list.push({ id: row.id, image_url: row.image_url });
    existingByProduct.set(row.product_id, list);
  }

  const productMap = new Map<string, ProductEmbeddingTarget>(
    ((products || []) as ProductEmbeddingTarget[]).map((p) => [p.id, p])
  );
  const staleEmbeddingIds: string[] = [];
  const missingPairs: { productId: string; imageUrl: string }[] = [];

  for (const pid of uniqueIds) {
    const product = productMap.get(pid);
    const currentRows = existingByProduct.get(pid) || [];
    const isDeleted = !product || String(product.name || '').toUpperCase().startsWith('[DELETED]');
    const activeUrls = isDeleted
      ? []
      : Array.from(new Set<string>((product.images || []).filter(isIndexableImageUrl)));
    const activeSet = new Set(activeUrls);

    for (const row of currentRows) {
      if (!activeSet.has(row.image_url)) {
        staleEmbeddingIds.push(row.id);
      }
    }

    if (!isDeleted) {
      const existingUrlSet = new Set(currentRows.map((r) => r.image_url));
      for (const url of activeUrls) {
        if (!existingUrlSet.has(url)) {
          missingPairs.push({ productId: pid, imageUrl: url });
        }
      }
    }
  }

  if (staleEmbeddingIds.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from('product_image_embeddings')
      .delete()
      .in('id', staleEmbeddingIds);
    if (delErr) throw delErr;
    summary.removed = staleEmbeddingIds.length;
  }

  if (missingPairs.length === 0) return summary;

  // Check if any missing image URL is already indexed for another variant/product.
  const distinctMissingUrls = Array.from(new Set(missingPairs.map((m) => m.imageUrl)));
  const cachedByUrl = new Map<string, string>();
  const { data: reusableRows } = await supabaseAdmin
    .from('product_image_embeddings')
    .select('image_url, embedding')
    .in('image_url', distinctMissingUrls);

  for (const row of reusableRows || []) {
    if (row.image_url && row.embedding && !cachedByUrl.has(row.image_url)) {
      cachedByUrl.set(row.image_url, typeof row.embedding === 'string' ? row.embedding : toPgVector(row.embedding));
    }
  }

  const upserts: {
    product_id: string;
    image_url: string;
    embedding: string;
    model: string;
    updated_at: string;
  }[] = [];

  for (const url of distinctMissingUrls) {
    if (cachedByUrl.has(url)) continue;
    try {
      const vector = await embedImageUrl(url);
      cachedByUrl.set(url, toPgVector(vector));
      summary.indexed++;
    } catch (err) {
      console.warn('[ImageEmbeddings] Failed to embed URL:', url, err);
      summary.failed++;
    }
  }

  const now = new Date().toISOString();
  for (const pair of missingPairs) {
    const embedding = cachedByUrl.get(pair.imageUrl);
    if (!embedding) continue;
    // Count pairs that used an already-cached vector (either pre-existing in DB or shared within batch).
    upserts.push({
      product_id: pair.productId,
      image_url: pair.imageUrl,
      embedding,
      model: EMBEDDING_MODEL,
      updated_at: now,
    });
  }

  if (upserts.length > 0) {
    summary.reused = Math.max(0, upserts.length - summary.indexed);
    const { error: upsertErr } = await supabaseAdmin
      .from('product_image_embeddings')
      .upsert(upserts, { onConflict: 'product_id,image_url' });
    if (upsertErr) throw upsertErr;
  }

  return summary;
}
