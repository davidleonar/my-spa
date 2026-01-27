"use client";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const QrScanner = ({
  onScanSuccess,
  onScanError,
}: {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (err: string) => void;
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {

    const startScanner = async () => {
      try {
        scannerRef.current = new Html5Qrcode("reader");
        const cameras = await Html5Qrcode.getCameras();
        if (cameras.length === 0) {
          setError("No cameras found. Allow camera access.");
          return;
        }
        const rearCamera = cameras.find(c => c.label.toLowerCase().includes("back")) || cameras[0];
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
    return () => { scannerRef.current?.stop().catch(console.error); };
  }, [onScanSuccess, onScanError]);

  return (
    <div>
      <div id="reader" className="w-full aspect-square bg-black rounded" />
      {error && <p className="text-red-400 mt-2">{error}</p>}
    </div>
  );
};
export default QrScanner;