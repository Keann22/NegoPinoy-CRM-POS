import { useState, useEffect } from 'react';

export function usePickerScanner(onScanSuccess: (orderId: string) => void) {
  const [scanner, setScanner] = useState<any>(null);
  const [scanning, setScanning] = useState(false);

  const startScanner = async () => {
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
    startScanner,
    stopScanner
  };
}
