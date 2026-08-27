import { useState, useEffect } from 'react';
import { probeCameraAccess, type CameraError } from '@/lib/camera-error';

export function usePickerScanner(onScanSuccess: (orderId: string) => void) {
  const [scanner, setScanner] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);

  const startScanner = async () => {
    setCameraError(null);

    // Probe camera access first so we can show a friendly, actionable
    // message instead of the scanner library's raw error text.
    const probeError = await probeCameraAccess();
    if (probeError) {
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

  return {
    scanner,
    scanning,
    cameraError,
    startScanner,
    stopScanner
  };
}
