'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ClipboardPaste, Loader2, Search, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { ImageSearchMatch } from '@/types';

const MAX_IMAGE_DIMENSION = 1024;
const JPEG_QUALITY = 0.85;
const DEFAULT_MATCH_COUNT = 20;
const DEFAULT_MATCH_THRESHOLD = 0.70;

/** Resizes an image file/blob client-side so phone photos stay fast and well under body size limits. */
async function compressImageToDataUrl(blob: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image file.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height, 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable.');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface ImageSearchButtonProps {
  onResults: (previewUrl: string, matches: ImageSearchMatch[]) => void;
  triggerLabel?: string;
  triggerVariant?: 'outline' | 'secondary' | 'ghost' | 'default';
  triggerSize?: 'default' | 'sm';
}

export function ImageSearchButton({
  onResults,
  triggerLabel = 'Search by Image',
  triggerVariant = 'outline',
  triggerSize = 'default',
}: ImageSearchButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isSearchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const resetDialogState = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isSearchingRef.current = false;
    setIsSearching(false);
    setErrorMessage(null);
    setPreviewUrl(null);
    setIsDragging(false);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetDialogState();
    }
  }, [resetDialogState]);

  const runSearch = useCallback(async (file: Blob) => {
    if (isSearchingRef.current) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    isSearchingRef.current = true;
    setErrorMessage(null);
    setIsSearching(true);

    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (controller.signal.aborted) return;
      setPreviewUrl(dataUrl);

      const res = await fetch('/api/products/search-by-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          matchCount: DEFAULT_MATCH_COUNT,
          matchThreshold: DEFAULT_MATCH_THRESHOLD,
        }),
        signal: controller.signal,
      });

      const payload = await res.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (!res.ok) {
        throw new Error(payload?.error || 'Image search request failed.');
      }

      const matches: ImageSearchMatch[] = Array.isArray(payload?.matches) ? payload.matches : [];
      if (matches.length === 0) {
        if (payload?.indexedCount === 0) {
          setErrorMessage('No product photos have been indexed yet. Ask an admin to run the image backfill.');
        } else {
          setErrorMessage('No close visual matches found. Try cropping tighter on the item or using a clearer photo.');
        }
        return;
      }

      const uniqueRootCount = new Set(matches.map((m) => m.root_id)).size;
      onResults(dataUrl, matches);
      resetDialogState();
      setOpen(false);
      toast({
        title: `Found ${uniqueRootCount} visual match${uniqueRootCount === 1 ? '' : 'es'}`,
        description: 'Sorted from closest visual match to lowest.',
      });
    } catch (err: unknown) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to search by image.';
      setErrorMessage(msg);
      toast({ variant: 'destructive', title: 'Image search failed', description: msg });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        isSearchingRef.current = false;
        setIsSearching(false);
      }
    }
  }, [onResults, resetDialogState, toast]);

  useEffect(() => {
    if (!open) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (isSearchingRef.current) return;
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;
      const blob = imageItem.getAsFile();
      if (!blob) return;
      e.preventDefault();
      void runSearch(blob);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open, runSearch]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && !isSearchingRef.current) void runSearch(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isSearchingRef.current) return;
    const file = Array.from(e.dataTransfer.files || []).find((f) => f.type.startsWith('image/'));
    if (file) {
      void runSearch(file);
    } else {
      setErrorMessage('Please drop an image file (JPG, PNG, or WebP).');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize} className="gap-1.5 shrink-0">
          <Camera className="h-4 w-4" />
          <span>{triggerLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search Products by Image
          </DialogTitle>
          <DialogDescription>
            Upload a product photo, take a picture, or paste a Messenger/Shopee screenshot (<kbd className="px-1 py-0.5 text-xs border rounded">Ctrl+V</kbd>).
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 bg-muted/20'
          }`}
        >
          {previewUrl ? (
            <div className="relative h-40 w-40 overflow-hidden rounded-md border bg-background">
              <img src={previewUrl} alt="Query preview" className="h-full w-full object-contain" />
              {isSearching && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs font-medium">Matching catalog...</span>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-full bg-muted p-3">
                <ClipboardPaste className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Drop an image here or press Ctrl+V to paste</p>
                <p className="text-xs text-muted-foreground">Works best when cropped close to the product</p>
              </div>
            </>
          )}

          {errorMessage && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md w-full">
              {errorMessage}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isSearching}
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              <Upload className="h-4 w-4" />
              Upload Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSearching}
              onClick={() => cameraInputRef.current?.click()}
              className="gap-1.5"
            >
              <Camera className="h-4 w-4" />
              Take Photo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ActiveImageSearchBannerProps {
  previewUrl: string;
  visibleCount: number;
  totalVisualMatches: number;
  isLoading?: boolean;
  onNewSearch: (previewUrl: string, matches: ImageSearchMatch[]) => void;
  onClear: () => void;
}

export function ActiveImageSearchBanner({
  previewUrl,
  visibleCount,
  totalVisualMatches,
  isLoading = false,
  onNewSearch,
  onClear,
}: ActiveImageSearchBannerProps) {
  const statusText = isLoading
    ? `Visual search active — ${totalVisualMatches} matching product${totalVisualMatches === 1 ? '' : 's'}`
    : visibleCount < totalVisualMatches
    ? `Visual search active — showing ${visibleCount} of ${totalVisualMatches} visual matches (filtered)`
    : `Visual search active — ${totalVisualMatches} matching product${totalVisualMatches === 1 ? '' : 's'}`;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-3">
        <img
          src={previewUrl}
          alt="Searched image"
          className="h-11 w-11 rounded border bg-background object-contain shrink-0"
        />
        <div>
          <p className="text-sm font-medium">{statusText}</p>
          <p className="text-xs text-muted-foreground">
            Sorted from closest visual similarity to lowest.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ImageSearchButton
          onResults={onNewSearch}
          triggerLabel="New Photo"
          triggerVariant="outline"
          triggerSize="sm"
        />
        <Button type="button" variant="ghost" size="sm" onClick={onClear} className="gap-1">
          <X className="h-4 w-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}
