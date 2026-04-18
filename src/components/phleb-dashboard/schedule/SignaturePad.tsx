import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Pen } from 'lucide-react';

/**
 * SIGNATURE PAD — zero-dependency canvas signature capture.
 *
 * Used by SpecimenDeliveryModal for HIPAA chain-of-custody proof that
 * the specimen was physically handed off. The receiving clerk signs with
 * finger/stylus; we export as a PNG blob and upload to Storage.
 *
 * Works with touch (phlebs on iPad/iPhone) and mouse (desktop test).
 */

interface Props {
  onChange?: (empty: boolean) => void;
  height?: number;
}

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  clear: () => void;
  toBlob: () => Promise<Blob | null>;
}

const SignaturePad = React.forwardRef<SignaturePadHandle, Props>(({ onChange, height = 180 }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
  }, []);

  useEffect(() => {
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setupCanvas]);

  const ptFrom = (e: PointerEvent | React.PointerEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    lastPt.current = ptFrom(e);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const pt = ptFrom(e);
    if (!ctx || !pt || !lastPt.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
    if (empty) {
      setEmpty(false);
      onChange?.(false);
    }
  };

  const onUp = () => {
    drawing.current = false;
    lastPt.current = null;
  };

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange?.(true);
  }, [onChange]);

  const isEmpty = useCallback(() => empty, [empty]);

  const toBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
  }, []);

  React.useImperativeHandle(ref, () => ({ isEmpty, clear, toBlob }), [isEmpty, clear, toBlob]);

  return (
    <div className="space-y-1.5">
      <div className="relative border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onPointerCancel={onUp}
        />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-gray-400 text-xs flex items-center gap-1.5">
              <Pen className="h-3.5 w-3.5" />
              Lab clerk signs here
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} className="text-xs gap-1 h-7" disabled={empty}>
          <Eraser className="h-3 w-3" /> Clear
        </Button>
      </div>
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;
