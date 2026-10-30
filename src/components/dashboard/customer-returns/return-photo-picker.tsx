'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadReturnPhoto } from '@/hooks/useCustomerReturns';

const MAX_SIDE = 1600;

/** Shrinks a phone photo to a JPEG of at most 1600px; falls back to the original (e.g. HEIC the browser can't draw). */
async function shrink(file: File): Promise<File> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

interface Props {
  urls: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}

/** Add damage photos (camera or gallery on iPhone and Android). */
export function ReturnPhotoPicker({ urls, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const added: string[] = [];
    try {
      for (const f of Array.from(files).slice(0, 6)) added.push(await uploadReturnPhoto(await shrink(f)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      onChange([...urls, ...added]);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <div key={u} className="relative h-16 w-16 overflow-hidden rounded border">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote storage URL, small thumbnail */}
            <img src={u} alt="Damage photo" className="h-full w-full object-cover" />
            <button
              type="button"
              className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white"
              onClick={() => onChange(urls.filter((x) => x !== u))}
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" className="h-16 w-16 flex-col gap-1 text-[11px]" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {uploading ? 'Uploading' : 'Photo'}
        </Button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
