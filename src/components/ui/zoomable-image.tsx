'use client';

import React, { useState } from 'react';
import Image, { ImageProps } from 'next/image';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface ZoomableImageProps extends Omit<ImageProps, 'onClick'> {
  // If true, uses standard <img> instead of next/image. Useful for blob URLs where next/image might complain if not configured properly, though unoptimized={true} also works.
  useStandardImg?: boolean;
}

export function ZoomableImage({ useStandardImg, className, alt, ...props }: ZoomableImageProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div 
        className={cn('cursor-zoom-in relative overflow-hidden', className)} 
        onClick={() => setIsOpen(true)}
      >
        {useStandardImg ? (
          <img 
            src={props.src as string} 
            alt={alt || 'Image'} 
            className="w-full h-full object-cover" 
            style={props.style}
          />
        ) : (
          <Image 
            alt={alt || 'Image'} 
            className="object-cover"
            {...props} 
          />
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] w-fit h-fit p-0 border-none bg-transparent shadow-none overflow-hidden flex items-center justify-center">
          <VisuallyHidden>
            <DialogTitle>Enlarged Image</DialogTitle>
            <DialogDescription>A larger view of the selected image.</DialogDescription>
          </VisuallyHidden>
          
          <div className="relative flex items-center justify-center w-full h-full max-h-[90vh] max-w-[90vw]">
            {useStandardImg ? (
              <img 
                src={props.src as string} 
                alt={alt || 'Enlarged Image'} 
                className="max-w-full max-h-[90vh] object-contain rounded-md" 
              />
            ) : (
              <img 
                src={typeof props.src === 'string' ? props.src : (props.src as any)?.src || props.src} 
                alt={alt || 'Enlarged Image'} 
                className="max-w-full max-h-[90vh] object-contain rounded-md" 
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
