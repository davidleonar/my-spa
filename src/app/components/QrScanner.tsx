"use client";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const QrScanner = ({
  active,
  onScanSuccess,
  onScanError,
}: {
  active: boolean;
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (err: string) => void;
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      const stop = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
          try {
            await scannerRef.current.stop();
          } catch (err) {
            console.error("Error stopping scanner:", err);
          }
        }
      };
      stop();
      return;
    }

    const startScanner = async () => {
      try {
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode("reader");
        }
        const cameras = await Html5Qrcode.getCameras();
        if (cameras.length === 0) {
          setError("No cameras found. Allow camera access.");
          return;
        }
        const rearCamera = cameras.find(c => c.label.toLowerCase().includes("back")) || cameras[0];
        
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }

        await scannerRef.current.start(
          rearCamera.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onScanSuccess,
          (err) => { if (!err.includes("No MultiFormat Readers")) onScanError?.(err); }
        );
      } catch (err) {
        setError("Failed to start camera. Check permissions.");
        console.error("QR Scanner error:", err);
      }
    };
    startScanner();

    return () => {
      const cleanup = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
          try {
            await scannerRef.current.stop();
          } catch (err) {
            console.error("Error in scanner cleanup stop:", err);
          }
        }
      };
      cleanup();
    };
  }, [active, onScanSuccess, onScanError]);

  return (
    <div>
      <div id="reader" translate="no" className="w-full aspect-square bg-black rounded" />
      {error && <p className="text-red-400 mt-2">{error}</p>}
    </div>
  );
};
export default QrScanner;