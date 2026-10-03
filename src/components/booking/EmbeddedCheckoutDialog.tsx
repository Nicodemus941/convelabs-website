import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getStripe } from '@/lib/stripeClient';

/**
 * On-site card form for /book-now. Mounts Stripe Embedded Checkout for a
 * ui_mode:'embedded' session created by create-appointment-checkout. On
 * completion Stripe navigates to the session's return_url (/welcome), the
 * same page the hosted flow lands on, and the same checkout.session.completed
 * webhook books the visit.
 */
const EmbeddedCheckoutDialog: React.FC<{
  clientSecret: string | null;
  onClose: () => void;
  /** Stripe.js failed to mount the form — caller shows a fallback. */
  onError: () => void;
}> = ({ clientSecret, onClose, onError }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!clientSecret) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const stripe = await getStripe();
        if (!stripe || cancelled) { if (!stripe) onError(); return; }
        const checkout = await (stripe as any).initEmbeddedCheckout({ clientSecret });
        if (cancelled) { try { checkout.destroy(); } catch { /* noop */ } return; }
        instanceRef.current = checkout;
        // The dialog portal may not have attached the mount node on the
        // first frame.
        const waitForNode = async () => {
          for (let i = 0; i < 20 && !mountRef.current; i++) await new Promise((r) => setTimeout(r, 50));
          return mountRef.current;
        };
        const node = await waitForNode();
        if (!node || cancelled) { onError(); return; }
        checkout.mount(node);
        setReady(true);
      } catch {
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
      try { instanceRef.current?.destroy(); } catch { /* noop */ }
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret]);

  return (
    <Dialog open={!!clientSecret} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Secure payment</DialogTitle>
          <DialogDescription className="flex items-center gap-1 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" /> Processed by Stripe — your card never touches ConveLabs.
          </DialogDescription>
        </DialogHeader>
        {!ready && (
          <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading secure payment form…
          </div>
        )}
        <div ref={mountRef} className={ready ? 'min-h-[320px]' : 'h-0 overflow-hidden'} />
      </DialogContent>
    </Dialog>
  );
};

export default EmbeddedCheckoutDialog;
