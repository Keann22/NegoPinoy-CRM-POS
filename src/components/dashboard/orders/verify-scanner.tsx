import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScanLine, X, CameraOff } from 'lucide-react';
import { probeCameraAccess, type CameraError } from '@/lib/camera-error';

interface VerifyScannerProps {
  scanning: boolean;
  setScanning: (s: boolean) => void;
  onScanSuccess: (text: string) => void;
  onScanStart?: () => void;
}

export function VerifyScanner({ scanning, setScanning, onScanSuccess, onScanStart }: VerifyScannerProps) {
  const [scanner, setScanner] = useState<any>(null);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);

  const startScanner = async () => {
    setCameraError(null);
    if (onScanStart) onScanStart();

    // Probe camera access first so we can show a friendly, actionable
    // message instead of the scanner library's raw error text.
    const probeError = await probeCameraAccess();
    if (probeError) {
      setScanning(false);
      setCameraError(probeError);
      return;
    }

    setScanning(true);

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
    setCameraError(null);
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
            {cameraError ? (
              <div className="w-full space-y-4">
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                    <CameraOff className="h-8 w-8 text-destructive" />
                  </div>
                  <p className="font-semibold text-destructive">{cameraError.title}</p>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-4">
                  {cameraError.steps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
                <Button size="lg" className="w-full text-lg h-14" onClick={startScanner}>
                  Try Again
                </Button>
              </div>
            ) : (
              <>
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
                  <ScanLine className="h-12 w-12 text-primary" />
                </div>
                <Button size="lg" className="w-full text-lg h-14" onClick={startScanner}>
                  Tap to Scan Order
                </Button>
              </>
            )}
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
