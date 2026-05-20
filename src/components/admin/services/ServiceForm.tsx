import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ServiceEnhanced } from '@/types/adminTypes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ServiceStaffSection from './ServiceStaffSection';
import ServiceAddOnsSection from './ServiceAddOnsSection';
import PackageBuilder, { PackageChildDraft } from './PackageBuilder';
import { supabase } from '@/integrations/supabase/client';

interface ServiceFormProps {
  service?: ServiceEnhanced;
  onSubmit: (serviceData: Partial<ServiceEnhanced>) => Promise<void>;
}

const ServiceForm: React.FC<ServiceFormProps> = ({ service, onSubmit }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    service_code: string;        // stable slug used by booking flow & server pricing
    description: string;
    service_type: 'individual' | 'package' | 'add_on';
    category: string;
    base_price: number;          // DOLLARS in the UI; converted to cents by useEnhancedServices
    duration_minutes: number;
    is_active: boolean;
    requires_lab_order: boolean;
    tier_none: number;
    tier_member: number;
    tier_vip: number;
    tier_concierge: number;
  }>({
    name: '',
    service_code: '',
    description: '',
    service_type: 'individual',
    category: 'lab_draw',
    base_price: 0,
    duration_minutes: 30,
    is_active: true,
    requires_lab_order: false,
    tier_none: 0,
    tier_member: 0,
    tier_vip: 0,
    tier_concierge: 0,
  });

  const [staffAssignments, setStaffAssignments] = useState([]);
  const [addOns, setAddOns] = useState([]);
  // Package builder state — used only when service_type === 'package'
  const [packageChildren, setPackageChildren] = useState<PackageChildDraft[]>([]);
  const [bundleDiscountPct, setBundleDiscountPct] = useState<number>(0);

  // Auto-suggest a service_code from the name (kebab-case) the first time
  // an admin types a name — Hormozi rule: the form should do the obvious
  // work for the user. They can still override before saving.
  const [codeTouched, setCodeTouched] = useState(false);
  useEffect(() => {
    if (codeTouched || service) return;
    const slug = (formData.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    setFormData(prev => ({ ...prev, service_code: slug }));
  }, [formData.name, codeTouched, service]);

  useEffect(() => {
    if (service) {
      const tp = (service as any).tier_pricing || {};
      const fromCents = (c: number | string | undefined) => (Number(c) || 0) / 100;
      const basePriceDollars = (service.base_price || 0) / 100;
      setFormData({
        name: service.name || '',
        service_code: (service as any).service_code || '',
        description: service.description || '',
        service_type: service.service_type || 'individual',
        category: service.category || 'lab_draw',
        base_price: basePriceDollars,
        duration_minutes: service.duration_minutes || 30,
        is_active: service.is_active ?? true,
        requires_lab_order: service.requires_lab_order || false,
        tier_none: fromCents(tp.none) || basePriceDollars,
        tier_member: fromCents(tp.member) || 0,
        tier_vip: fromCents(tp.vip) || 0,
        tier_concierge: fromCents(tp.concierge) || 0,
      });
      setCodeTouched(true);
      setBundleDiscountPct(Number((service as any).bundle_discount_pct) || 0);

      // When editing a package, hydrate its children from service_package_items
      if (service.service_type === 'package' && service.id) {
        (async () => {
          try {
            const { data, error } = await supabase
              .from('service_package_items')
              .select('id, child_service_id, child_service_code, child_service_name, quantity, sort_order')
              .eq('package_id', service.id)
              .order('sort_order');
            if (error) throw error;
            // We need the child base_price to render the live preview — pull
            // it from services_enhanced since the row only stores denormalized
            // name + code. Map by id.
            const childIds = (data || []).map((r: any) => r.child_service_id);
            const { data: priceRows } = await supabase
              .from('services_enhanced')
              .select('id, base_price')
              .in('id', childIds);
            const priceById = new Map((priceRows || []).map((r: any) => [r.id, r.base_price]));
            setPackageChildren(
              (data || []).map((r: any) => ({
                child_service_id: r.child_service_id,
                child_service_code: r.child_service_code,
                child_service_name: r.child_service_name,
                child_base_cents: priceById.get(r.child_service_id) || 0,
                quantity: r.quantity,
                sort_order: r.sort_order,
              }))
            );
          } catch (e) {
            console.warn('[ServiceForm] failed to load package children:', e);
          }
        })();
      } else {
        setPackageChildren([]);
      }
    }
  }, [service]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Build the tier_pricing map in DOLLARS — the hook converts to cents.
      // Any tier left at 0 is omitted so the server falls back to base_price.
      const tierPricing: Record<string, number> = {};
      if (formData.tier_none > 0) tierPricing.none = formData.tier_none;
      else if (formData.base_price > 0) tierPricing.none = formData.base_price;
      if (formData.tier_member > 0) tierPricing.member = formData.tier_member;
      if (formData.tier_vip > 0) tierPricing.vip = formData.tier_vip;
      if (formData.tier_concierge > 0) tierPricing.concierge = formData.tier_concierge;

      // Package math: if this is a package, derive base_price + tier_pricing
      // from the children + bundle_discount_pct. The Tier Pricing inputs
      // become OVERRIDES — when a tier is 0 and we have children, we fall
      // back to computed bundle * tier-discount fraction.
      let effectiveBasePrice = formData.base_price;
      let effectiveTierPricing: Record<string, number> = { ...tierPricing };
      if (formData.service_type === 'package' && packageChildren.length > 0) {
        const subtotalCents = packageChildren.reduce((s, c) => s + (c.child_base_cents * c.quantity), 0);
        const bundleCents = Math.max(0, Math.round(subtotalCents * (1 - bundleDiscountPct / 100)));
        const bundleDollars = bundleCents / 100;
        effectiveBasePrice = bundleDollars;
        // Auto-fill any tier the admin didn't override
        if (!effectiveTierPricing.none || effectiveTierPricing.none === 0) effectiveTierPricing.none = bundleDollars;
      }

      const serviceData = {
        name: formData.name,
        service_code: formData.service_code || null,
        description: formData.description,
        service_type: formData.service_type,
        category: formData.category,
        base_price: effectiveBasePrice,         // dollars; hook converts
        tier_pricing: effectiveTierPricing,     // dollars; hook converts
        duration_minutes: formData.duration_minutes,
        is_active: formData.is_active,
        requires_lab_order: formData.requires_lab_order,
        bundle_discount_pct: formData.service_type === 'package' ? bundleDiscountPct : null,
        // PACKAGE CHILDREN — the hook detects this special field and writes
        // children to service_package_items in a second step AFTER the
        // parent row is created/updated. Drops `_package_children` before
        // inserting into services_enhanced.
        _package_children: formData.service_type === 'package' ? packageChildren : null,
        // NOTE: staff_assignments + add_ons handled via their own write paths
        // after the parent service row is created — they no longer ride along
        // the insert payload (which caused "column does not exist" errors).
      };

      await onSubmit(serviceData);
    } catch (error) {
      console.error('Error submitting service:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="staff">Staff Assignment</TabsTrigger>
          <TabsTrigger value="addons">Add-ons</TabsTrigger>
        </TabsList>
        
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Service Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="name">Service Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Input
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="service_type">Service Type *</Label>
                  <Select 
                    value={formData.service_type} 
                    onValueChange={(value: 'individual' | 'package' | 'add_on') => 
                      setFormData(prev => ({ ...prev, service_type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select service type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual Service</SelectItem>
                      <SelectItem value="package">Service Package</SelectItem>
                      <SelectItem value="add_on">Add-on Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Patient-visible description shown on the booking page"
                />
              </div>

              <div>
                <Label htmlFor="service_code">
                  Service Code <span className="text-xs text-muted-foreground">(stable slug used by booking flow)</span>
                </Label>
                <Input
                  id="service_code"
                  name="service_code"
                  value={formData.service_code}
                  onChange={(e) => { setCodeTouched(true); setFormData(prev => ({ ...prev, service_code: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 50) })); }}
                  placeholder="auto-fills from name — e.g. mobile, in-office, partner-acme"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Must match the key the booking flow + server pricing recognize. Avoid changing after first booking.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="base_price">Base Price ($)</Label>
                  <Input
                    id="base_price"
                    name="base_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.base_price}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      base_price: Number(e.target.value),
                      // Mirror into the "Pay-as-you-go" tier if it hasn't been customized yet
                      tier_none: prev.tier_none === 0 || prev.tier_none === prev.base_price ? Number(e.target.value) : prev.tier_none,
                    }))}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">In dollars. Saved as cents.</p>
                </div>

                <div>
                  <Label htmlFor="duration_minutes">Duration (minutes)</Label>
                  <Input
                    id="duration_minutes"
                    name="duration_minutes"
                    type="number"
                    min="5"
                    step="5"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: Number(e.target.value) }))}
                    required
                  />
                </div>

                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(value) => setFormData(prev => ({ ...prev, is_active: value }))}
                  />
                  <Label htmlFor="is_active">Active (visible on booking page)</Label>
                </div>
              </div>

              {/*
                Tier pricing — leave any tier at 0 to fall back to base_price.
                Hormozi rule: members ALWAYS see a discount vs. pay-as-you-go.
                The booking flow + server enforce min(claimed_tier, actual_tier)
                so client-claimed tier never charges MORE than the real one.
              */}
              <div>
                <Label className="text-base">Tier Pricing</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Per-membership-tier rates. Leave any tier at 0 to use Base Price for that tier.
                </p>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label htmlFor="tier_none" className="text-xs uppercase tracking-wide">Pay-as-you-go ($)</Label>
                    <Input
                      id="tier_none" type="number" step="0.01" min="0"
                      value={formData.tier_none}
                      onChange={(e) => setFormData(prev => ({ ...prev, tier_none: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="tier_member" className="text-xs uppercase tracking-wide">Member ($)</Label>
                    <Input
                      id="tier_member" type="number" step="0.01" min="0"
                      value={formData.tier_member}
                      onChange={(e) => setFormData(prev => ({ ...prev, tier_member: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="tier_vip" className="text-xs uppercase tracking-wide">VIP ($)</Label>
                    <Input
                      id="tier_vip" type="number" step="0.01" min="0"
                      value={formData.tier_vip}
                      onChange={(e) => setFormData(prev => ({ ...prev, tier_vip: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="tier_concierge" className="text-xs uppercase tracking-wide">Concierge ($)</Label>
                    <Input
                      id="tier_concierge" type="number" step="0.01" min="0"
                      value={formData.tier_concierge}
                      onChange={(e) => setFormData(prev => ({ ...prev, tier_concierge: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="requires_lab_order"
                  checked={formData.requires_lab_order}
                  onCheckedChange={(value) => setFormData(prev => ({ ...prev, requires_lab_order: value }))}
                />
                <Label htmlFor="requires_lab_order">Requires a doctor's lab order at booking</Label>
              </div>

              {/*
                Package Builder — only visible when this service IS a package.
                Computes the bundle price live and saves to service_package_items
                after the parent row is created/updated (via the _package_children
                pseudo-field in serviceData; the hook intercepts it).
              */}
              {formData.service_type === 'package' && (
                <PackageBuilder
                  initialChildren={packageChildren}
                  discountPct={bundleDiscountPct}
                  onDiscountPctChange={setBundleDiscountPct}
                  onChange={setPackageChildren}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="staff">
          <ServiceStaffSection
            serviceId={service?.id}
            assignments={staffAssignments}
            onAssignmentsChange={setStaffAssignments}
          />
        </TabsContent>
        
        <TabsContent value="addons">
          <ServiceAddOnsSection
            serviceId={service?.id}
            addOns={addOns}
            onAddOnsChange={setAddOns}
          />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end space-x-2 pt-4 border-t">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : (service ? 'Update Service' : 'Create Service')}
        </Button>
      </div>
    </form>
  );
};

export default ServiceForm;