/**
 * SpecialtyKitBundleCard — Hormozi-grade kit-count + bundle-savings UI.
 *
 * Shows ONLY when the visit type is `specialty-kit*`. Lets the patient
 * specify how many kits THEY want and how many EACH companion wants.
 * Renders a live bundle-savings chip ("Couple Wellness Stack · save $65")
 * driven by the calculateTotal() pricing-service bundle path.
 *
 * Why a separate component:
 *   • CheckoutStep is already 900+ lines — keep this surface focused
 *   • Same component reused on the admin manual-booking modal (later)
 *   • Easy to mount conditionally based on serviceId.startsWith('specialty-kit')
 *
 * Data flow:
 *   • Reads `additionalPatients` from react-hook-form
 *   • Writes a `kitsCount` field per patient (and `primaryKitsCount` for primary)
 *   • Emits the resulting `SpecialtyKitBundle` via `onBundleChange` so the
 *     parent CheckoutStep can pass it into `calculateTotal({ specialtyKitBundle })`
 */

import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { Plus, Minus, FlaskConical, Sparkles } from 'lucide-react';
import {
  calculateTotal,
  type SpecialtyKitBundle,
  type MembershipTier,
} from '@/services/pricing/pricingService';

interface Props {
  serviceId: string;          // 'specialty-kit' | 'specialty-kit-genova'
  memberTier: MembershipTier;
  onBundleChange?: (bundle: SpecialtyKitBundle) => void;
}

const Stepper: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}> = ({ value, onChange, min = 1, max = 6, label }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => onChange(Math.max(min, value - 1))}
      disabled={value <= min}
      className="h-8 w-8 rounded-md border border-gray-300 bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label={`Decrease ${label}`}
    >
      <Minus className="h-3.5 w-3.5" />
    </button>
    <div className="w-10 text-center font-mono text-sm font-bold text-gray-900">{value}</div>
    <button
      type="button"
      onClick={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      className="h-8 w-8 rounded-md border border-gray-300 bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label={`Increase ${label}`}
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  </div>
);

const SpecialtyKitBundleCard: React.FC<Props> = ({ serviceId, memberTier, onBundleChange }) => {
  const { watch, setValue, getValues } = useFormContext();

  const isSpecialtyKit = serviceId === 'specialty-kit' || serviceId === 'specialty-kit-genova';
  const additionalPatients = (watch('additionalPatients') || []) as any[];
  const primaryKitsCount: number = Number(watch('primaryKitsCount') || 1);

  // Compose the bundle from form state
  const bundle = useMemo<SpecialtyKitBundle>(() => ({
    patients: [
      { kits: primaryKitsCount },
      ...additionalPatients.map((p: any) => ({
        kits: Math.max(1, Number(p?.kitsCount || 1)),
      })),
    ],
    isGenova: serviceId === 'specialty-kit-genova',
  }), [primaryKitsCount, additionalPatients, serviceId]);

  // Live price preview
  const breakdown = useMemo(() => calculateTotal(
    serviceId,
    { specialtyKitBundle: bundle },
    0,
    0,
    memberTier,
  ), [serviceId, bundle, memberTier]);

  // Bubble bundle up to parent so CheckoutStep can use it for the actual
  // total displayed at the bottom of the page.
  React.useEffect(() => {
    onBundleChange?.(bundle);
  }, [bundle, onBundleChange]);

  if (!isSpecialtyKit) return null;

  const setPrimaryKits = (n: number) => setValue('primaryKitsCount', n, { shouldDirty: true });

  const setCompanionKits = (i: number, n: number) => {
    const current = (getValues('additionalPatients') || []) as any[];
    const next = current.map((p: any, idx: number) => idx === i ? { ...p, kitsCount: n } : p);
    setValue('additionalPatients', next as any, { shouldDirty: true });
  };

  const totalKits = bundle.patients.reduce((s, p) => s + (p.kits || 1), 0);

  return (
    <div className="rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical className="h-5 w-5 text-purple-700" />
        <h3 className="text-sm font-bold text-purple-900 uppercase tracking-wider">Specialty Kits</h3>
        <span className="ml-auto text-[11px] text-purple-700 bg-purple-100 border border-purple-200 rounded-full px-2 py-0.5 font-semibold">
          {totalKits} kit{totalKits === 1 ? '' : 's'} total
        </span>
      </div>

      <p className="text-xs text-gray-600 mb-3">
        Each kit ships separately. Tap + to add more kits per person — the more you stack, the lower the per-kit price.
      </p>

      {/* Primary patient */}
      <div className="flex items-center justify-between gap-3 py-2 border-b border-purple-100">
        <div>
          <p className="text-sm font-semibold text-gray-900">You (primary)</p>
          <p className="text-[11px] text-gray-500">Kits to draw at your visit</p>
        </div>
        <Stepper
          value={primaryKitsCount}
          onChange={setPrimaryKits}
          label="primary kits"
        />
      </div>

      {/* Companion patients */}
      {additionalPatients.map((p: any, i: number) => {
        const display = (p?.firstName || p?.lastName)
          ? `${p?.firstName || ''} ${p?.lastName || ''}`.trim()
          : `Companion ${i + 1}`;
        const kits = Math.max(1, Number(p?.kitsCount || 1));
        return (
          <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-purple-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">{display}</p>
              <p className="text-[11px] text-gray-500">Kits for {p?.firstName || 'this companion'}</p>
            </div>
            <Stepper
              value={kits}
              onChange={(n) => setCompanionKits(i, n)}
              label={`${display} kits`}
            />
          </div>
        );
      })}

      {/* Bundle savings chip + live total */}
      <div className="mt-3 pt-3 border-t border-purple-200">
        {breakdown.bundleSavings && breakdown.bundleSavings > 0 ? (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
            <Sparkles className="h-4 w-4 text-emerald-700 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-900">{breakdown.bundleLabel}</p>
              <p className="text-[11px] text-emerald-700">
                You save <strong>${breakdown.bundleSavings.toFixed(0)}</strong> vs booking each kit separately
              </p>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700">Specialty kits subtotal</span>
          <span className="font-bold text-gray-900">${breakdown.subtotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default SpecialtyKitBundleCard;
