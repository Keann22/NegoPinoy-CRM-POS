"use client";

import { Camera, CheckCircle2, Image as ImageIcon, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSnapReceipt, type SnapPhoto, type RecentReceipt } from "@/hooks/useSnapReceipt";

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeOf = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function PhotoRow({ photo, onRetry }: { photo: SnapPhoto; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-white p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.previewUrl} alt="" className="h-14 w-14 rounded object-cover" />
      <div className="min-w-0 flex-1 text-sm">
        {photo.status === "waiting" && <p className="text-slate-500">Waiting…</p>}
        {photo.status === "reading" && (
          <p className="flex items-center gap-1.5 text-indigo-700"><Loader2 className="h-4 w-4 animate-spin" /> Uploading and reading…</p>
        )}
        {photo.status === "done" && photo.result && (
          <p className="flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">{photo.result.recorded}</span> recorded
              {photo.result.toMatch > 0 && <> · <span className="font-semibold">{photo.result.toMatch}</span> for Jas to match</>}
            </span>
          </p>
        )}
        {photo.status === "failed" && (
          <p className="flex items-center gap-1.5 text-red-700"><XCircle className="h-4 w-4 shrink-0" /> {photo.error}</p>
        )}
      </div>
      {photo.status === "failed" && (
        <Button size="sm" variant="outline" onClick={onRetry}><RotateCcw className="mr-1 h-4 w-4" />Retry</Button>
      )}
    </div>
  );
}

function ReceiptCard({ r }: { r: RecentReceipt }) {
  const failed = r.photos.filter((p) => p.status === "failed").length;
  return (
    <div className="rounded-lg border bg-white p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-slate-800">{r.supplierName || "Supplier not picked"}</p>
        <p className="text-xs text-slate-500">{timeOf(r.createdAt)}{r.createdBy ? ` · ${r.createdBy}` : ""}</p>
      </div>
      <p className="mt-1 text-slate-600">
        {r.photos.length} {r.photos.length === 1 ? "photo" : "photos"} · <span className="text-emerald-700 font-medium">{r.recorded} recorded</span>
        {r.toMatch > 0 && <> · <span className="text-amber-700 font-medium">{r.toMatch} waiting for Jas</span></>}
        {r.notProduct > 0 && <> · {r.notProduct} not products</>}
        {failed > 0 && <> · <span className="text-red-700 font-medium">{failed} unreadable</span></>}
      </p>
      {r.notInList.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-semibold">Not in the product list (add the product, then record it):</p>
          {r.notInList.map((l) => (
            <p key={l.id}>• {l.description} — {l.qty} × {peso(l.unitCost)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// Owners at the store: pick the supplier if you know it, snap, done.
export function SnapReceiptView() {
  const {
    suppliers, receipts, loading, recentIds,
    supplierId, setSupplierId, receiptId, photos, working,
    addPhotos, retry, newReceipt,
  } = useSnapReceipt();

  const recent = recentIds.map((id) => suppliers.find((s) => s.id === id)).filter(Boolean) as { id: string; name: string }[];
  const locked = !!receiptId;
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name;

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length) addPhotos(files);
  };

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-headline">Snap receipt</h1>
        <p className="text-sm text-muted-foreground">
          Take a photo of each receipt. Sure items are recorded as bought right away; the rest go to Jas to match while unpacking.
        </p>
      </div>

      <section className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">1. Supplier <span className="font-normal text-slate-500">(skip if you don&apos;t know)</span></p>
        {locked ? (
          <p className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
            {supplierName || "Not picked"} · <span className="text-slate-500">tap Next receipt to change</span>
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {recent.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSupplierId(s.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${supplierId === s.id ? "border-indigo-600 bg-indigo-600 text-white" : "bg-white"}`}
                >
                  {s.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSupplierId("")}
                className={`rounded-full border px-3 py-1.5 text-sm ${supplierId === "" ? "border-indigo-600 bg-indigo-600 text-white" : "bg-white"}`}
              >
                Don&apos;t know
              </button>
            </div>
            <select
              className="w-full rounded-md border bg-white p-2 text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Other supplier… (or don&apos;t know)</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">2. Photos</p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-5 text-lg font-semibold text-white active:bg-indigo-700">
          <Camera className="h-6 w-6" /> Take photo of receipt
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFiles} />
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm text-slate-700">
          <ImageIcon className="h-4 w-4" /> Choose from gallery
          <input type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
        </label>
        {photos.length > 0 && (
          <div className="space-y-2">
            {photos.map((p) => <PhotoRow key={p.key} photo={p} onRetry={() => retry(p.key)} />)}
            {working && <p className="text-xs text-amber-700">Keep this page open until every photo shows ✓.</p>}
            {!working && (
              <Button variant="outline" className="w-full" onClick={newReceipt}>Next receipt</Button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Last 3 days</p>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-slate-500">No receipts yet.</p>
        ) : (
          receipts.map((r) => <ReceiptCard key={r.id} r={r} />)
        )}
      </section>
    </div>
  );
}
