/**
 * ADD PROVIDER MODAL — NPI auto-lookup vs three prompt() dialogs.
 *
 * The previous addProvider() called window.prompt() three times back-to-back
 * (name → NPI → email). Hormozi's #1 friction point: forcing humans to
 * memorize a 10-digit NPI. Most don't. They abandon the form or guess.
 *
 * This modal hits the public CMS NPI Registry API to look up providers by
 * name + state. Picking a result auto-fills the NPI; falling back to manual
 * entry is one click. End result: 30-second blocker → 3-second selection.
 *
 * NPI Registry API: https://npiregistry.cms.hhs.gov/api/?version=2.1
 *   - CORS-enabled, no key required, public dataset
 *   - Returns up to 200 results per query; we cap UI at 8
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, CheckCircle2, ArrowLeft, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface NPIResult {
  number: string;             // 10-digit NPI
  fullName: string;
  credential: string;         // "MD", "DO", "NP", etc.
  taxonomy: string;           // "Family Medicine"
  city: string;
  state: string;
}

interface AddProviderModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (provider: { name: string; npi: string | null; email: string | null }) => Promise<void>;
  /** Default state to bias the registry search (e.g. patient address state) */
  defaultState?: string;
}

const AddProviderModal: React.FC<AddProviderModalProps> = ({ open, onClose, onSubmit, defaultState = 'FL' }) => {
  const [step, setStep] = useState<'lookup' | 'manual' | 'finalize'>('lookup');

  // Lookup state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [state, setState] = useState(defaultState);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<NPIResult[]>([]);
  const [searched, setSearched] = useState(false);

  // Selected (from lookup or manual)
  const [name, setName] = useState('');
  const [npi, setNpi] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep('lookup');
    setFirstName(''); setLastName('');
    setState(defaultState);
    setResults([]); setSearched(false);
    setName(''); setNpi(''); setEmail('');
  };

  const handleClose = () => { reset(); onClose(); };

  const runSearch = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      toast.error('Enter a first or last name to search');
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({
        version: '2.1',
        limit: '8',
        ...(firstName.trim() ? { first_name: firstName.trim() } : {}),
        ...(lastName.trim() ? { last_name: lastName.trim() } : {}),
        ...(state.trim() ? { state: state.trim().toUpperCase() } : {}),
      });
      const resp = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`);
      const data = await resp.json();
      const mapped: NPIResult[] = (data?.results || []).map((r: any) => {
        const basic = r.basic || {};
        const credential = basic.credential || '';
        const fullName = [basic.first_name, basic.middle_name, basic.last_name]
          .filter(Boolean).join(' ');
        const tax = (r.taxonomies || []).find((t: any) => t.primary) || (r.taxonomies || [])[0];
        const addr = (r.addresses || []).find((a: any) => a.address_purpose === 'LOCATION') || (r.addresses || [])[0];
        return {
          number: String(r.number || ''),
          fullName: credential ? `${fullName}, ${credential}` : fullName,
          credential,
          taxonomy: tax?.desc || '',
          city: addr?.city || '',
          state: addr?.state || '',
        };
      });
      setResults(mapped);
      setSearched(true);
      if (mapped.length === 0) {
        toast.info('No NPI matches found — you can enter manually below.');
      }
    } catch (e: any) {
      toast.error('NPI registry lookup failed — enter manually');
      setStep('manual');
    } finally {
      setSearching(false);
    }
  };

  const pickResult = (r: NPIResult) => {
    setName(r.fullName);
    setNpi(r.number);
    setStep('finalize');
  };

  const goManual = () => {
    setName(`${firstName} ${lastName}`.trim());
    setStep('manual');
  };

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Provider name is required'); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        npi: npi.trim() || null,
        email: email.trim() || null,
      });
      handleClose();
    } catch (e: any) {
      toast.error(`Add failed: ${e?.message || 'unknown'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#B91C1C]" />
            Add provider
            {step === 'manual' && <span className="text-xs text-gray-500 font-normal">· manual entry</span>}
            {step === 'finalize' && <span className="text-xs text-emerald-700 font-normal">· NPI verified</span>}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: NPI LOOKUP */}
        {step === 'lookup' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-600">
              Search the public NPI registry — we'll auto-fill the 10-digit NPI so you don't have to look it up.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">First name</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Last name</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" className="h-9" />
              </div>
            </div>
            <div>
              <Label className="text-xs">State</Label>
              <Input value={state} onChange={e => setState(e.target.value.toUpperCase())} placeholder="FL" className="h-9 uppercase" maxLength={2} />
            </div>
            <Button onClick={runSearch} disabled={searching} className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5">
              {searching ? <><Loader2 className="h-4 w-4 animate-spin" /> Searching NPI registry…</> : <><Search className="h-4 w-4" /> Search NPI Registry</>}
            </Button>

            {searched && results.length > 0 && (
              <div className="space-y-1.5 mt-2 max-h-64 overflow-y-auto">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                  {results.length} match{results.length === 1 ? '' : 'es'} — pick one
                </p>
                {results.map((r) => (
                  <button
                    key={r.number}
                    onClick={() => pickResult(r)}
                    className="w-full text-left bg-white border border-gray-200 rounded-md p-2.5 hover:border-emerald-400 hover:bg-emerald-50 transition"
                  >
                    <p className="text-sm font-semibold text-gray-900">{r.fullName}</p>
                    <p className="text-xs text-gray-600">
                      NPI {r.number}
                      {r.taxonomy && ` · ${r.taxonomy}`}
                      {r.city && ` · ${r.city}, ${r.state}`}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {(searched || firstName || lastName) && (
              <button
                onClick={goManual}
                className="w-full text-xs text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
              >
                {searched && results.length === 0
                  ? 'No match — enter provider manually'
                  : 'Don\'t see them? Enter manually'}
              </button>
            )}
          </div>
        )}

        {/* STEP 2: MANUAL ENTRY */}
        {step === 'manual' && (
          <div className="space-y-3">
            <button
              onClick={() => setStep('lookup')}
              className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back to NPI search
            </button>
            <div>
              <Label className="text-xs">Provider full name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Dr. Jane Doe, MD" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">NPI <span className="text-gray-400 font-normal">(10 digits, optional)</span></Label>
              <Input value={npi} onChange={e => setNpi(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="1234567890" className="h-9" maxLength={10} />
              <p className="text-[10px] text-gray-500 mt-0.5">Without an NPI, lab orders will route under your org's primary instead of this provider individually.</p>
            </div>
            <div>
              <Label className="text-xs">Email <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jdoe@practice.com" className="h-9" />
            </div>
          </div>
        )}

        {/* STEP 3: FINALIZE (post-NPI-pick) */}
        {step === 'finalize' && (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-emerald-900">
                <p className="font-semibold">{name}</p>
                <p className="text-emerald-700">NPI {npi} · verified</p>
              </div>
            </div>
            <div>
              <Label className="text-xs">Email <span className="text-gray-400 font-normal">(optional — for lab-order alerts)</span></Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jdoe@practice.com" className="h-9" autoFocus />
            </div>
            <button
              onClick={() => setStep('lookup')}
              className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Pick a different provider
            </button>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
          {(step === 'manual' || step === 'finalize') && (
            <Button onClick={handleSubmit} disabled={submitting || !name.trim()} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : <><UserPlus className="h-4 w-4" /> Add provider</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddProviderModal;
