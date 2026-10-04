import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Live camera QR reader. Browsers only allow the camera on https:// or localhost,
 * so on a phone over plain LAN http this calls onError and the page falls back to manual entry.
 */
export default function QrCamera({ active, onCode, onError, paused }) {
  const elId = 'qr-reader';
  const onCodeRef = useRef(onCode);
  const onErrorRef = useRef(onError);
  const pausedRef = useRef(paused);
  onCodeRef.current = onCode;
  onErrorRef.current = onError;
  pausedRef.current = paused;

  useEffect(() => {
    if (!active) return undefined;
    const reader = new Html5Qrcode(elId, { verbose: false });
    const started = reader
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => { const side = Math.floor(Math.min(w, h) * 0.7); return { width: side, height: side }; } },
        (text) => { if (!pausedRef.current) onCodeRef.current(text); },
        () => {},
      )
      .catch((err) => {
        onErrorRef.current?.(err);
        throw err;
      });
    return () => {
      started.then(() => reader.stop()).then(() => reader.clear()).catch(() => {});
    };
  }, [active]);

  return <div id={elId} className="qr-reader" aria-label="Camera preview" />;
}
