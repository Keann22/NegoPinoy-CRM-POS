import type { SupabaseClient } from '@supabase/supabase-js';

export type CopilotAttachmentBucket = 'proof_of_payment' | 'customer-returns';
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

function extForContentType(contentType: string): string {
  const lower = contentType.toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  return 'jpg';
}

/**
 * Downloads a transient Messenger attachment URL and archives a permanent copy
 * in Supabase Storage (`proof_of_payment` or `customer-returns`). Falls back cleanly
 * to `sourceUrl` on network/storage error so approvals never block.
 */
export async function persistMessengerAttachment(
  supabase: SupabaseClient,
  sourceUrl: string | null,
  psid: string,
  bucket: CopilotAttachmentBucket,
  prefix = 'messenger-ai'
): Promise<string | null> {
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  const archivedMarker = `/storage/v1/object/public/${bucket}/`;
  if (sourceUrl.includes(archivedMarker)) return sourceUrl;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(sourceUrl, { signal: ctrl.signal });
    if (!res.ok) {
      console.warn(`persistMessengerAttachment(${bucket}) fetch HTTP ${res.status}`);
      return sourceUrl;
    }

    const headerLen = Number(res.headers.get('content-length') || 0);
    if (headerLen > MAX_PROOF_BYTES) {
      console.warn(`persistMessengerAttachment(${bucket}) skipped: content-length ${headerLen} > 5MB`);
      return sourceUrl;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_PROOF_BYTES) {
      console.warn(`persistMessengerAttachment(${bucket}) skipped: buffer bytes=${buf.byteLength}`);
      return sourceUrl;
    }

    const rawCt = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const contentType = rawCt.startsWith('image/') ? rawCt : 'image/jpeg';
    const ext = extForContentType(contentType);
    const safePsid = (psid.replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown').slice(0, 32);
    const filePath = `${prefix}/${safePsid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buf, { contentType, upsert: false });
    if (error || !data?.path) {
      console.warn(`persistMessengerAttachment(${bucket}) upload error:`, error?.message);
      return sourceUrl;
    }

    return supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;
  } catch (err) {
    console.warn(`persistMessengerAttachment(${bucket}) error:`, err);
    return sourceUrl;
  } finally {
    clearTimeout(timeout);
  }
}

export async function persistMessengerProofImage(
  supabase: SupabaseClient,
  sourceUrl: string | null,
  psid: string
): Promise<string | null> {
  return persistMessengerAttachment(supabase, sourceUrl, psid, 'proof_of_payment', 'messenger-ai');
}

/**
 * Claims the 90-second DB-backed auto-scan lock (only when at least one rule
 * has `show_sales_popup = true`) and executes `runScan` without throwing.
 */
export async function maybeAutoScanBursts(
  supabase: SupabaseClient,
  runScan: () => Promise<unknown>,
  minIntervalSeconds = 90
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('claim_messenger_ai_autoscan', {
      min_interval_seconds: minIntervalSeconds,
    });
    if (error) {
      console.warn('claim_messenger_ai_autoscan error:', error.message);
      return false;
    }
    if (data !== true) return false;
    await runScan();
    return true;
  } catch (err) {
    console.warn('maybeAutoScanBursts failed:', err);
    return false;
  }
}
