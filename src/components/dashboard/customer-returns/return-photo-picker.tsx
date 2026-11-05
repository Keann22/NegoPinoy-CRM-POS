'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadReturnPhoto } from '@/hooks/useCustomerReturns';
import { shrinkPhoto } from '@/lib/image-shrink';

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
      for (const f of Array.from(files).slice(0, 6)) added.push(await uploadReturnPhoto(await shrinkPhoto(f)));
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
