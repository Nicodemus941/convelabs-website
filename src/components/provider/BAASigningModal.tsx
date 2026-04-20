import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Shield, ChevronsDown, FileSignature } from 'lucide-react';
import { BAA_TEXT, BAA_VERSION } from '@/lib/baaContent';
import ReactMarkdown from 'react-markdown';

/**
 * Mandatory BAA signing modal for providers.
 *
 * Three gates must ALL clear before the Sign button enables:
 *   1. User scrolled to the very bottom of the BAA text
 *   2. Acknowledgment checkbox is ticked
 *   3. Full legal name typed matches ≥3 characters (and is substantive)
 *
 * Timestamped + IP-stamped at signing. The baa_text is frozen into the DB
 * row so we can reproduce exactly what was agreed to, years later.
 *
 * Modal cannot be closed until signed (no X, no backdrop-click close).
 */

interface Props {
  open: boolean;
  onSigned: (signatureId: string) => void;
  currentUserFullName?: string;
}

const BAASigningModal: React.FC<Props> = ({ open, onSigned, currentUserFullName }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [fullName, setFullName] = useState(currentUserFullName || '');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Detect when user has actually scrolled to the bottom
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "at bottom" if within 20px of the end
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    if (atBottom && !scrolledToBottom) setScrolledToBottom(true);
  };

  useEffect(() => {
    if (open) {
      setScrolledToBottom(false);
      setAcknowledged(false);
      setFullName(currentUserFullName || '');
      setTitle('');
      setErr(null);
      // Reset scroll
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [open, currentUserFullName]);

  const canSign = scrolledToBottom && acknowledged && fullName.trim().length >= 3 && !submitting;

  const handleSign = async () => {
    if (!canSign) return;
    setSubmitting(true);
    setErr(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');

      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/sign-baa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          signer_full_name: fullName.trim(),
          signer_title: title.trim() || null,
          baa_version: BAA_VERSION,
          baa_text: BAA_TEXT,
          scroll_completed: true,
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Signature failed');

      toast.success(j.already_signed ? 'BAA already on file' : 'BAA signed — thank you!');
      onSigned(j.signature_id);
    } catch (e: any) {
      setErr(e?.message || 'Signature failed');
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* non-dismissable */ }}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0"
        // Prevent close via Esc, backdrop, or X
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-5 pb-3 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-5 w-5 text-[#B91C1C]" />
            <DialogTitle className="text-base">One last step before you can send patient orders</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-gray-600">
            HIPAA requires a Business Associate Agreement between your practice and ConveLabs before we can handle your patients' PHI. Takes about 2 minutes — read it, sign it, you're in.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable BAA content */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50 text-sm text-gray-800 prose prose-sm max-w-none"
          style={{ maxHeight: '50vh', minHeight: '320px' }}
        >
          <ReactMarkdown>{BAA_TEXT}</ReactMarkdown>
          <div className="mt-4 pb-2 text-center text-[11px] text-emerald-700 font-semibold">
            ✓ You've read the full document. Signature enabled below.
          </div>
        </div>

        {/* Scroll indicator — appears until bottom is reached */}
        {!scrolledToBottom && (
          <div className="px-5 py-2 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
            <p className="text-xs text-amber-800 font-medium flex items-center gap-1.5">
              <ChevronsDown className="h-3.5 w-3.5 animate-bounce" /> Please scroll to the end to enable signing
            </p>
            <button onClick={scrollToBottom} className="text-xs text-amber-800 hover:text-amber-900 font-semibold underline">Jump to end</button>
          </div>
        )}

        {/* Signature block */}
        <div className="p-5 space-y-3 border-t bg-white">
          <div className={`flex items-start gap-2 transition-opacity ${scrolledToBottom ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <Checkbox
              id="baa-ack"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              disabled={!scrolledToBottom}
              className="mt-0.5"
            />
            <Label htmlFor="baa-ack" className="text-xs text-gray-800 leading-relaxed cursor-pointer">
              I have read the Business Associate Agreement in its entirety, I understand it is a legally binding contract, and I have authority to bind my practice to it. I agree to the terms.
            </Label>
          </div>

          <div className={`grid grid-cols-2 gap-3 transition-opacity ${acknowledged ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <div>
              <Label className="text-xs">Full legal name <span className="text-red-600">*</span></Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Dr. Jane Smith"
                disabled={!acknowledged}
              />
              <p className="text-[10px] text-gray-500 mt-0.5">This serves as your electronic signature.</p>
            </div>
            <div>
              <Label className="text-xs">Your title / role <span className="text-gray-400">(optional)</span></Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Physician / Practice Manager"
                disabled={!acknowledged}
              />
            </div>
          </div>

          {err && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] text-gray-500">
              Version {BAA_VERSION} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <Button
              onClick={handleSign}
              disabled={!canSign}
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 min-w-[160px]"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Signing…</>
              ) : (
                <><FileSignature className="h-4 w-4" /> Sign & Activate</>
              )}
            </Button>
          </div>

          {/* Legend of unmet gates */}
          <div className="flex items-center gap-3 text-[10px] pt-1 border-t mt-2">
            <span className="text-gray-500 font-semibold">Steps to unlock signature:</span>
            <Gate active={scrolledToBottom} label="Scroll to end" />
            <Gate active={acknowledged} label="Check agreement" />
            <Gate active={fullName.trim().length >= 3} label="Type name" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Gate: React.FC<{ active: boolean; label: string }> = ({ active, label }) => (
  <span className={`inline-flex items-center gap-1 ${active ? 'text-emerald-700' : 'text-gray-400'}`}>
    <CheckCircle2 className="h-3 w-3" /> {label}
  </span>
);

export default BAASigningModal;
