/**
 * PackageBuilder
 *
 * Surfaces inside ServiceForm when service_type === 'package'. Lets admin
 * pick child services from the active catalog, set quantity per child,
 * and apply a single bundle-level discount %. Auto-computes the bundle
 * price live so the admin can sanity-check before saving.
 *
 * Persistence: the package PARENT row is written first by ServiceForm's
 * onSubmit. After that resolves with a parent_id, this component's
 * `commitPackageChildren()` saves the children to service_package_items
 * in one upsert. Children are stored alongside the parent so the
 * package's tier_pricing can be left at the auto-computed value.
 */

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import { useServiceCatalog, DynamicServiceEntry } from '@/hooks/useServiceCatalog';

export interface PackageChildDraft {
  child_service_id: string;
  child_service_code: string;
  child_service_name: string;
  child_base_cents: number;
  quantity: number;
  sort_order: number;
}

interface PackageBuilderProps {
  /** Existing children when editing an existing package. Empty array for new. */
  initialChildren?: PackageChildDraft[];
  /** Bundle-level discount percent (0-100). 0 = no discount. */
  discountPct: number;
  onDiscountPctChange: (v: number) => void;
  /** Notifies the parent ServiceForm of the current child list so it can
   *  pass them into the save flow. */
  onChange: (children: PackageChildDraft[]) => void;
}

const PackageBuilder: React.FC<PackageBuilderProps> = ({
  initialChildren = [],
  discountPct,
  onDiscountPctChange,
  onChange,
}) => {
  const { services, isLoading } = useServiceCatalog();
  const [children, setChildren] = useState<PackageChildDraft[]>(initialChildren);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedChildId, setPickedChildId] = useState('');

  // Surface child-eligible services — exclude packages themselves (no nesting
  // for now; would require recursive resolution at checkout) and the parent
  // service if known. Items already added show muted.
  const childEligible = useMemo(() => {
    return services.filter(s => s.category !== 'package' && s.service_code !== 'package');
  }, [services]);

  const update = (next: PackageChildDraft[]) => {
    setChildren(next);
    onChange(next);
  };

  const handleAddChild = () => {
    const svc = childEligible.find(s => s.id === pickedChildId);
    if (!svc) return;
    if (children.some(c => c.child_service_id === svc.id)) {
      // Already in the bundle — bump quantity instead
      update(children.map(c => c.child_service_id === svc.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      update([
        ...children,
        {
          child_service_id: svc.id,
          child_service_code: svc.service_code,
          child_service_name: svc.name,
          child_base_cents: typeof svc.tier_pricing?.none === 'number' ? svc.tier_pricing.none : 0,
          quantity: 1,
          sort_order: children.length,
        },
      ]);
    }
    setPickedChildId('');
    setPickerOpen(false);
  };

  const handleQtyChange = (id: string, qty: number) => {
    update(children.map(c => c.child_service_id === id ? { ...c, quantity: Math.max(1, qty) } : c));
  };

  const handleRemove = (id: string) => {
    update(children.filter(c => c.child_service_id !== id));
  };

  // Live price preview — sum(child * qty) then apply discount
  const subtotalCents = children.reduce((s, c) => s + (c.child_base_cents * c.quantity), 0);
  const discountCents = Math.round(subtotalCents * (Math.max(0, Math.min(100, discountPct)) / 100));
  const bundleCents = Math.max(0, subtotalCents - discountCents);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Package Contents</span>
          <span className="text-xs text-muted-foreground font-normal">
            {children.length} {children.length === 1 ? 'item' : 'items'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Children list */}
        {children.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6 border-2 border-dashed rounded-lg">
            No services in this bundle yet. Add at least one below.
          </div>
        ) : (
          <div className="space-y-2">
            {children.map(c => (
              <div key={c.child_service_id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.child_service_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.child_service_code} · ${(c.child_base_cents / 100).toFixed(2)} each
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    className="w-16 h-8 text-center"
                    value={c.quantity}
                    onChange={(e) => handleQtyChange(c.child_service_id, Number(e.target.value))}
                  />
                </div>
                <div className="text-sm font-semibold w-20 text-right">
                  ${((c.child_base_cents * c.quantity) / 100).toFixed(2)}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600 hover:text-red-700"
                  onClick={() => handleRemove(c.child_service_id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add child picker */}
        {pickerOpen ? (
          <div className="flex items-end gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="flex-1">
              <Label htmlFor="child_picker" className="text-xs">Add a service</Label>
              <Select value={pickedChildId} onValueChange={setPickedChildId}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoading ? 'Loading…' : 'Pick a service to include'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {childEligible.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — ${((s.tier_pricing?.none || 0) / 100).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={handleAddChild} disabled={!pickedChildId}>Add</Button>
            <Button type="button" variant="outline" onClick={() => { setPickerOpen(false); setPickedChildId(''); }}>Cancel</Button>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={() => setPickerOpen(true)} className="w-full">
            <Plus className="h-4 w-4 mr-2" /> Add service to bundle
          </Button>
        )}

        {/* Discount + pricing summary */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-3">
            <Label htmlFor="bundle_discount" className="flex-1">Bundle Discount %</Label>
            <Input
              id="bundle_discount"
              type="number"
              step="0.5"
              min="0"
              max="100"
              className="w-24 text-right"
              value={discountPct}
              onChange={(e) => onDiscountPctChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            />
            <span className="text-sm text-muted-foreground w-12">%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">${(subtotalCents / 100).toFixed(2)}</span>
          </div>
          {discountPct > 0 && (
            <div className="flex items-center justify-between text-sm text-emerald-700">
              <span>Bundle discount ({discountPct}%)</span>
              <span className="font-mono">− ${(discountCents / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between font-semibold text-base pt-2 border-t">
            <span>Bundle price (Pay-as-you-go)</span>
            <span className="font-mono text-red-700">${(bundleCents / 100).toFixed(2)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            This becomes the package's <strong>Base Price</strong> on save. Tier discounts
            (Member / VIP / Concierge) apply on top — set them in the Tier Pricing section above.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PackageBuilder;
