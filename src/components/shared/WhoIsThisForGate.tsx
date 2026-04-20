import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Users, Building2 } from 'lucide-react';

/**
 * "Who is this for?" gate — the structural fix for the Suzanne/Aditya and
 * Jason-Edwards-paying-for-Anthony patterns.
 *
 * Before collecting booking/membership info, the form presents a binary choice:
 *   (•) Me              → standard flow, email goes on patient record
 *   (•) Someone I help  → split: patient identity + billing contact (delegate)
 *
 * When "Someone else" is chosen, delegate info is kept SEPARATE from the
 * patient identity. The ONLY email routed to the delegate is billing / receipts.
 * Clinical communications (appointment, results, PHI) always go to the patient.
 *
 * Form returns a structured PatientContext object that downstream components
 * use to build either (a) a standalone patient row, or (b) a patient row +
 * a patient_delegates row with billing routing.
 */

export interface PatientContext {
  mode: 'self' | 'proxy';
  patient: {
    name: string;
    email: string;
    phone: string;
    dob?: string;
  };
  // Only populated when mode='proxy'
  delegate?: {
    name: string;
    email: string;
    phone?: string;
    relationship: 'executive_assistant' | 'spouse' | 'adult_child' | 'parent' | 'caregiver' | 'guardian' | 'other';
    other_relationship_detail?: string;
    cc_on_confirmations: boolean;
    pay_with_my_card: boolean;
    consent_authorized: boolean;
    consent_typed_name: string;
  };
}

interface Props {
  value: PatientContext;
  onChange: (ctx: PatientContext) => void;
  showDob?: boolean;
  hidePatientContact?: boolean; // set when booking flow already has patient info elsewhere
}

const RELATIONSHIP_OPTIONS: { value: PatientContext['delegate']['relationship']; label: string }[] = [
  { value: 'executive_assistant', label: 'Executive assistant / office manager' },
  { value: 'spouse', label: 'Spouse / partner' },
  { value: 'adult_child', label: 'Adult child' },
  { value: 'parent', label: 'Parent / legal guardian' },
  { value: 'caregiver', label: 'Professional caregiver' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' },
];

const WhoIsThisForGate: React.FC<Props> = ({ value, onChange, showDob = false, hidePatientContact = false }) => {
  const isProxy = value.mode === 'proxy';

  const setMode = (mode: 'self' | 'proxy') => {
    if (mode === 'self') {
      onChange({ ...value, mode: 'self', delegate: undefined });
    } else {
      onChange({
        ...value,
        mode: 'proxy',
        delegate: value.delegate || {
          name: '', email: '', phone: '',
          relationship: 'executive_assistant',
          cc_on_confirmations: true,
          pay_with_my_card: true,
          consent_authorized: false,
          consent_typed_name: '',
        },
      });
    }
  };

  const patchPatient = (p: Partial<PatientContext['patient']>) => onChange({ ...value, patient: { ...value.patient, ...p } });
  const patchDelegate = (p: Partial<NonNullable<PatientContext['delegate']>>) => {
    if (!value.delegate) return;
    onChange({ ...value, delegate: { ...value.delegate, ...p } });
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div>
        <Label className="text-sm font-semibold text-gray-900 block mb-2">Who is this for?</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('self')}
            className={`flex items-start gap-2 p-3 rounded-lg border-2 text-left transition ${
              !isProxy ? 'border-[#B91C1C] bg-red-50' : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <User className={`h-4 w-4 mt-0.5 flex-shrink-0 ${!isProxy ? 'text-[#B91C1C]' : 'text-gray-400'}`} />
            <div>
              <div className="text-sm font-semibold">Me</div>
              <div className="text-[11px] text-gray-500 leading-tight">I'm the patient receiving the labs.</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode('proxy')}
            className={`flex items-start gap-2 p-3 rounded-lg border-2 text-left transition ${
              isProxy ? 'border-[#B91C1C] bg-red-50' : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <Users className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isProxy ? 'text-[#B91C1C]' : 'text-gray-400'}`} />
            <div>
              <div className="text-sm font-semibold">Someone I help</div>
              <div className="text-[11px] text-gray-500 leading-tight">I'm booking on behalf of a patient (boss, spouse, parent).</div>
            </div>
          </button>
        </div>
      </div>

      {/* Patient block */}
      {!hidePatientContact && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            {isProxy ? 'The patient (who receives the labs)' : 'Your information'}
          </p>
          <div>
            <Label className="text-xs">Full name *</Label>
            <Input value={value.patient.name} onChange={e => patchPatient({ name: e.target.value })} placeholder={isProxy ? 'e.g. Aditya Patel' : 'Jane Smith'} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Email * {isProxy && <span className="text-[10px] text-red-600">(their own, not yours)</span>}</Label>
              <Input type="email" value={value.patient.email} onChange={e => patchPatient({ email: e.target.value })} placeholder={isProxy ? 'aditya@company.com' : 'jane@example.com'} />
            </div>
            <div>
              <Label className="text-xs">Mobile phone *</Label>
              <Input value={value.patient.phone} onChange={e => patchPatient({ phone: e.target.value })} placeholder="(407) 555-1234" />
            </div>
          </div>
          {showDob && (
            <div>
              <Label className="text-xs">Date of birth *</Label>
              <Input type="date" value={value.patient.dob || ''} onChange={e => patchPatient({ dob: e.target.value })} max={new Date().toISOString().substring(0, 10)} />
            </div>
          )}
        </div>
      )}

      {/* Delegate block */}
      {isProxy && value.delegate && (
        <div className="space-y-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> You (the person booking / paying)
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Your name *</Label>
              <Input value={value.delegate.name} onChange={e => patchDelegate({ name: e.target.value })} placeholder="Suzanne Wells" />
            </div>
            <div>
              <Label className="text-xs">Your email *</Label>
              <Input type="email" value={value.delegate.email} onChange={e => patchDelegate({ email: e.target.value })} placeholder="suzanne@company.com" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Your relationship to the patient *</Label>
            <select
              value={value.delegate.relationship}
              onChange={e => patchDelegate({ relationship: e.target.value as any })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              {RELATIONSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {value.delegate.relationship === 'other' && (
              <Input
                value={value.delegate.other_relationship_detail || ''}
                onChange={e => patchDelegate({ other_relationship_detail: e.target.value })}
                placeholder="Describe your relationship"
                className="mt-2"
              />
            )}
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={value.delegate.cc_on_confirmations}
                onCheckedChange={(v) => patchDelegate({ cc_on_confirmations: v === true })}
                className="mt-0.5"
              />
              <span className="text-xs text-gray-800">
                <strong>CC me on every confirmation / receipt.</strong> I'll get a copy of booking reminders and delivery receipts, but clinical notifications go directly to the patient.
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={value.delegate.pay_with_my_card}
                onCheckedChange={(v) => patchDelegate({ pay_with_my_card: v === true })}
                className="mt-0.5"
              />
              <span className="text-xs text-gray-800">
                <strong>Use my card for all charges.</strong> My card is on file. The patient never sees a bill.
              </span>
            </label>
          </div>

          {/* HIPAA consent */}
          <div className="border-t border-amber-200 pt-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={value.delegate.consent_authorized}
                onCheckedChange={(v) => patchDelegate({ consent_authorized: v === true })}
                className="mt-0.5"
              />
              <span className="text-xs text-gray-800">
                <strong>I am authorized by this patient</strong> to share their protected health information (PHI) with ConveLabs and to arrange their lab services on their behalf. I have their permission for this specific purpose.
              </span>
            </label>
            {value.delegate.consent_authorized && (
              <div className="mt-2">
                <Label className="text-xs text-gray-700">Type your full name to sign (ESIGN / UETA)</Label>
                <Input
                  value={value.delegate.consent_typed_name}
                  onChange={e => patchDelegate({ consent_typed_name: e.target.value })}
                  placeholder="Your full legal name"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WhoIsThisForGate;
