import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScanLine, X } from 'lucide-react';

interface VerifyScannerProps {
  scanning: boolean;
  setScanning: (s: boolean) => void;
  onScanSuccess: (text: string) => void;
  onScanStart?: () => void;
}

export function VerifyScanner({ scanning, setScanning, onScanSuccess, onScanStart }: VerifyScannerProps) {
  const [scanner, setScanner] = useState<any>(null);

  const startScanner = async () => {
    setScanning(true);
    if (onScanStart) onScanStart();

    const { Html5QrcodeScanner } = await import('html5-qrcode');

    setTimeout(() => {
      const newScanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      
      newScanner.render(
        (decodedText) => {
          newScanner.clear();
          setScanning(false);
          onScanSuccess(decodedText);
        },
        () => {
          // ignore background errors
        }
      );
      setScanner(newScanner);
    }, 100);
  };

  const stopScanner = () => {
    if (scanner) {
      scanner.clear().catch(console.error);
      setScanner(null);
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [scanner]);

  return (
    <>
      {!scanning && (
        <Card className="shadow-md border-primary/20 max-w-md mx-auto w-full">
          <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
              <ScanLine className="h-12 w-12 text-primary" />
            </div>
            <Button size="lg" className="w-full text-lg h-14" onClick={startScanner}>
              Tap to Scan Order
            </Button>
          </CardContent>
        </Card>
      )}

      {scanning && (
        <Card className="max-w-md mx-auto w-full">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle>Scanning...</CardTitle>
            <Button variant="ghost" size="icon" onClick={stopScanner}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div id="reader" className="w-full rounded overflow-hidden"></div>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Point your camera at the unified QR code on the order slip.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
