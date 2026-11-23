/**
 * Backfills `public.product_image_embeddings` for all active products with photos.
 *
 * Idempotent & resumable:
 * - Paginates past Supabase's 1000-row cap for both `products` and `product_image_embeddings`.
 * - Deduplicates by `image_url` so shared parent/variant photos are embedded only once.
 * - Upserts per unique URL so interrupted runs resume cleanly.
 *
 * Usage:
 *   node scripts/backfill-product-image-embeddings.mjs
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
  console.error('Missing required env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY).');
  process.exit(1);
}

const EMBEDDING_MODEL = 'gemini-embedding-2';
const EMBEDDING_DIMENSIONS = 768;
const PAGE_SIZE = 1000;
const CONCURRENCY = 6;
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeVector(values) {
  let normSq = 0;
  for (let i = 0; i < values.length; i++) {
    normSq += values[i] * values[i];
  }
  const norm = Math.sqrt(normSq);
  return norm === 0 ? values : values.map((v) => v / norm);
}

function toPgVector(values) {
  return `[${values.join(',')}]`;
}

function isIndexableImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes('placehold.co')) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

function inferMimeType(url, contentType) {
  if (contentType) {
    const clean = contentType.split(';')[0].trim().toLowerCase();
    if (clean === 'image/jpg') return 'image/jpeg';
    if (SUPPORTED_MIME_TYPES.has(clean)) return clean;
  }
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function embedImageUrlWithRetry(url) {
  const imgRes = await fetch(url);
  if (!imgRes.ok) {
    throw new Error(`HTTP ${imgRes.status} fetching image`);
  }
  const contentType = imgRes.headers.get('content-type');
  const mimeType = inferMimeType(url, contentType);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('Empty image body');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const body = JSON.stringify({
    model: `models/${EMBEDDING_MODEL}`,
    content: {
      parts: [{ inline_data: { mime_type: mimeType, data: buffer.toString('base64') } }],
    },
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok) {
      const json = await res.json();
      const values = json?.embedding?.values;
      if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error('Invalid embedding payload');
      }
      return toPgVector(normalizeVector(values));
    }

    const errText = await res.text().catch(() => '');
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 4) {
      throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
    }
    const backoffMs = Math.min(16000, 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500));
    await sleep(backoffMs);
  }
}

async function fetchAllActiveProducts() {
  const all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, images')
      .not('name', 'ilike', '[DELETED]%')
      .not('images', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

async function fetchAllExistingPairs() {
  const existingKeys = new Set();
  const cachedByUrl = new Map();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('product_image_embeddings')
      .select('id, product_id, image_url, embedding')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      existingKeys.add(`${row.product_id}::${row.image_url}`);
      if (row.image_url && row.embedding && !cachedByUrl.has(row.image_url)) {
        cachedByUrl.set(row.image_url, typeof row.embedding === 'string' ? row.embedding : toPgVector(row.embedding));
      }
    }
    if (data.length < PAGE_SIZE) break;
  }
  return { existingKeys, cachedByUrl };
}

async function main() {
  console.log('Loading active products and existing embeddings...');
  const [products, { existingKeys, cachedByUrl }] = await Promise.all([
    fetchAllActiveProducts(),
    fetchAllExistingPairs(),
  ]);

  const productIdsByMissingUrl = new Map();
  let totalIndexablePairs = 0;

  for (const product of products) {
    const urls = Array.from(new Set((product.images || []).filter(isIndexableImageUrl)));
    for (const url of urls) {
      totalIndexablePairs++;
      const key = `${product.id}::${url}`;
      if (existingKeys.has(key)) continue;
      const list = productIdsByMissingUrl.get(url) || [];
      list.push(product.id);
      productIdsByMissingUrl.set(url, list);
    }
  }

  console.log(`Active products with images array: ${products.length}`);
  console.log(`Total product-image pairs: ${totalIndexablePairs} (already indexed: ${existingKeys.size})`);

  // First, immediately satisfy any missing pairs whose URL already exists in cachedByUrl.
  const reusedRows = [];
  const urlsToFetch = [];
  const now = new Date().toISOString();

  for (const [url, productIds] of productIdsByMissingUrl.entries()) {
    const cachedEmbedding = cachedByUrl.get(url);
    if (cachedEmbedding) {
      for (const productId of productIds) {
        reusedRows.push({
          product_id: productId,
          image_url: url,
          embedding: cachedEmbedding,
          model: EMBEDDING_MODEL,
          updated_at: now,
        });
      }
    } else {
      urlsToFetch.push(url);
    }
  }

  let reusedCount = 0;
  for (let i = 0; i < reusedRows.length; i += 200) {
    const batch = reusedRows.slice(i, i + 200);
    const { error } = await supabase
      .from('product_image_embeddings')
      .upsert(batch, { onConflict: 'product_id,image_url' });
    if (error) throw error;
    reusedCount += batch.length;
  }

  console.log(`Reused embeddings for ${reusedCount} pairs. Unique new URLs to embed: ${urlsToFetch.length}`);
  if (urlsToFetch.length === 0) {
    console.log('Nothing left to embed. Backfill complete!');
    return;
  }

  let cursor = 0;
  let embeddedUrls = 0;
  let upsertedPairs = 0;
  let failedUrls = 0;
  const failures = [];

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= urlsToFetch.length) return;
      const url = urlsToFetch[idx];
      const productIds = productIdsByMissingUrl.get(url) || [];
      try {
        const embedding = await embedImageUrlWithRetry(url);
        const rows = productIds.map((productId) => ({
          product_id: productId,
          image_url: url,
          embedding,
          model: EMBEDDING_MODEL,
          updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase
          .from('product_image_embeddings')
          .upsert(rows, { onConflict: 'product_id,image_url' });
        if (error) throw error;

        embeddedUrls++;
        upsertedPairs += rows.length;
      } catch (err) {
        failedUrls++;
        failures.push({ url, error: err instanceof Error ? err.message : String(err) });
      }

      const done = embeddedUrls + failedUrls;
      if (done % 50 === 0 || done === urlsToFetch.length) {
        console.log(`Progress: ${done}/${urlsToFetch.length} URLs (embedded: ${embeddedUrls}, pairs saved: ${upsertedPairs}, failed: ${failedUrls})`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urlsToFetch.length) }, () => worker()));

  console.log('\n=== Backfill Summary ===');
  console.log(`Embedded unique URLs: ${embeddedUrls}`);
  console.log(`Pairs upserted (new): ${upsertedPairs}`);
  console.log(`Pairs reused:         ${reusedCount}`);
  console.log(`Failed URLs:          ${failedUrls}`);
  if (failures.length > 0) {
    console.log('Sample failures (up to 10):');
    for (const f of failures.slice(0, 10)) {
      console.log(` - ${f.url}: ${f.error}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});
