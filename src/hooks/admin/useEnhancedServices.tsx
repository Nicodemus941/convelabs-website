import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceEnhanced, ServiceStaffAssignment } from '@/types/adminTypes';
import { toast } from 'sonner';

export function useEnhancedServices() {
  const [services, setServices] = useState<ServiceEnhanced[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('services_enhanced')
        .select(`
          *,
          parent_service:parent_service_id(id, name),
          sub_services:services_enhanced!parent_service_id(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServices((data as any[])?.map(item => ({
        ...item,
        service_type: item.service_type || 'individual',
        parent_service: item.parent_service ? {
          ...item.parent_service,
          base_price: 0,
          duration_minutes: 0,
          category: '',
          service_type: 'individual',
          requires_lab_order: false,
          is_active: true,
          created_at: '',
          updated_at: ''
        } : undefined
      })) || []);
    } catch (err: any) {
      console.error('Error fetching enhanced services:', err);
      setError(err.message);
      toast.error('Failed to fetch services');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Sanitize the form payload before inserting/updating services_enhanced.
   *
   * Two bugs the form was tripping (2026-05-20):
   *   1. `staff_assignments` and `add_ons` fields were leaking into the
   *      Postgres INSERT — those are nested resources, not columns. Insert
   *      failed with `column does not exist`, and the catch fired a generic
   *      "Failed to create service" toast that gave admin no clue what
   *      actually broke.
   *   2. `base_price` is `INTEGER cents` in the DB but the form binds it
   *      as a dollar amount (step="0.01"). An admin entering $55.00 saved
   *      55 cents; an admin entering $55.50 was rejected (integer column
   *      can't hold decimals). Now we round to cents at write time.
   *
   * Also normalizes tier_pricing — if the form omits it, derive from
   * base_price so the booking flow always has at least the "none" tier.
   */
  const sanitizeServicePayload = (raw: any): any => {
    const {
      // Strip nested-resource fields that aren't columns
      staff_assignments: _sa,
      add_ons: _ao,
      sub_services: _ss,
      parent_service: _ps,
      // Package children — written separately via writePackageChildren()
      _package_children: _pkg,
      // Strip server-managed fields if the form ever surfaced them
      id: _id,
      created_at: _ca,
      updated_at: _ua,
      // Pull pricing out so we can normalize units
      base_price,
      tier_pricing,
      ...rest
    } = raw || {};
    // Dollars → cents (round to avoid floating-point drift)
    const baseCents = base_price == null
      ? 0
      : Math.round(Number(base_price) * 100);
    // Tier pricing — accept either a {none,member,vip,concierge} dollar
    // map or a pre-cents map. Detect by max value (>= 1000 implies cents).
    let tierPricingCents: Record<string, number> | null = null;
    if (tier_pricing && typeof tier_pricing === 'object') {
      const vals = Object.values(tier_pricing).map((v: any) => Number(v) || 0);
      const looksLikeCents = vals.length > 0 && vals.every(v => v >= 1000 || v === 0);
      tierPricingCents = {};
      for (const [k, v] of Object.entries(tier_pricing)) {
        const n = Number(v) || 0;
        tierPricingCents[k] = looksLikeCents ? Math.round(n) : Math.round(n * 100);
      }
    } else if (baseCents > 0) {
      // Default: just the "none" tier set to base price
      tierPricingCents = { none: baseCents };
    }
    return {
      ...rest,
      base_price: baseCents,
      ...(tierPricingCents ? { tier_pricing: tierPricingCents } : {}),
    };
  };

  /**
   * Rewrites the package children for a given package id. Deletes existing
   * rows + reinserts in a single transaction-ish flow (best-effort; if the
   * delete succeeds but insert fails, we surface the error and the admin
   * can re-save). The denormalized child_service_code + child_service_name
   * make the catalog read super-fast (no joins per package preview).
   */
  const writePackageChildren = async (packageId: string, children: any[]) => {
    if (!packageId) return;
    // Wipe existing
    const { error: delErr } = await supabase
      .from('service_package_items')
      .delete()
      .eq('package_id', packageId);
    if (delErr) throw delErr;
    if (!children || children.length === 0) return;
    const rows = children.map((c, i) => ({
      package_id: packageId,
      child_service_id: c.child_service_id,
      child_service_code: c.child_service_code,
      child_service_name: c.child_service_name,
      quantity: Math.max(1, Number(c.quantity) || 1),
      sort_order: i,
    }));
    const { error: insErr } = await supabase
      .from('service_package_items')
      .insert(rows);
    if (insErr) throw insErr;
  };

  const createService = async (serviceData: Partial<ServiceEnhanced>) => {
    try {
      setIsLoading(true);
      const pkgChildren = (serviceData as any)._package_children || null;
      const payload = sanitizeServicePayload(serviceData);
      const { data, error } = await supabase
        .from('services_enhanced')
        .insert(payload as any)
        .select()
        .single();

      if (error) throw error;

      // Persist package children to service_package_items after the parent
      // exists. If this throws the parent still exists — admin can re-save.
      if (data && Array.isArray(pkgChildren)) {
        try {
          await writePackageChildren((data as any).id, pkgChildren);
        } catch (e: any) {
          toast.error(`Service saved, but package items failed: ${e?.message}`, { duration: 10000 });
        }
      }

      toast.success(`Service created: ${(data as any)?.name || 'OK'}`);
      fetchServices();
      return data;
    } catch (err: any) {
      console.error('Error creating service:', err);
      // Surface the actual DB error so admin can debug instead of seeing
      // a generic "Failed to create service" toast with no context.
      toast.error(`Couldn't create service: ${err?.message || 'unknown error'}`, { duration: 10000 });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateService = async (id: string, updates: Partial<ServiceEnhanced>) => {
    try {
      setIsLoading(true);
      const pkgChildren = (updates as any)._package_children || null;
      const payload = sanitizeServicePayload(updates);
      const { data, error } = await supabase
        .from('services_enhanced')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (Array.isArray(pkgChildren)) {
        try {
          await writePackageChildren(id, pkgChildren);
        } catch (e: any) {
          toast.error(`Service saved, but package items failed: ${e?.message}`, { duration: 10000 });
        }
      }

      toast.success(`Service updated: ${(data as any)?.name || 'OK'}`);
      fetchServices();
      return data;
    } catch (err: any) {
      console.error('Error updating service:', err);
      toast.error(`Couldn't update service: ${err?.message || 'unknown error'}`, { duration: 10000 });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteService = async (id: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('services_enhanced')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Service deleted successfully');
      fetchServices();
    } catch (err: any) {
      console.error('Error deleting service:', err);
      toast.error('Failed to delete service');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const assignStaffToService = async (serviceId: string, staffId: string, certificationLevel: string = 'standard') => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('service_staff_assignments')
        .insert([{
          service_id: serviceId,
          staff_id: staffId,
          certification_level: certificationLevel
        }])
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Staff assigned to service successfully');
      return data;
    } catch (err: any) {
      console.error('Error assigning staff to service:', err);
      toast.error('Failed to assign staff to service');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const removeStaffFromService = async (serviceId: string, staffId: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('service_staff_assignments')
        .delete()
        .eq('service_id', serviceId)
        .eq('staff_id', staffId);

      if (error) throw error;
      
      toast.success('Staff removed from service successfully');
    } catch (err: any) {
      console.error('Error removing staff from service:', err);
      toast.error('Failed to remove staff from service');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  return {
    services,
    isLoading,
    error,
    fetchServices,
    createService,
    updateService,
    deleteService,
    assignStaffToService,
    removeStaffFromService
  };
}