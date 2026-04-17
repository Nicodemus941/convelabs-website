import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { Save, Loader2, User, Phone, Mail, MapPin, Shield } from 'lucide-react';

interface PatientEditModalProps {
  open: boolean;
  onClose: () => void;
  patientId: string | null;
  patientEmail: string | null;
  initialName: string;
}

const PatientEditModal: React.FC<PatientEditModalProps> = ({
  open, onClose, patientId, patientEmail, initialName,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tpId, setTpId] = useState<string | null>(null);

  // Restore form state from sessionStorage if resuming after PWA reload
  const savedForm = (() => {
    try {
      const raw = sessionStorage.getItem('phleb-patient-edit-form');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();

  const [firstName, setFirstName] = useState(savedForm?.firstName || '');
  const [lastName, setLastName] = useState(savedForm?.lastName || '');
  const [email, setEmail] = useState(savedForm?.email || '');
  const [phone, setPhone] = useState(savedForm?.phone || '');
  const [dob, setDob] = useState(savedForm?.dob || '');
  const [street, setStreet] = useState(savedForm?.street || '');
  const [city, setCity] = useState(savedForm?.city || '');
  const [state, setState] = useState(savedForm?.state || 'FL');
  const [zip, setZip] = useState(savedForm?.zip || '');
  const [insuranceProvider, setInsuranceProvider] = useState(savedForm?.insuranceProvider || '');
  const [insuranceMemberId, setInsuranceMemberId] = useState(savedForm?.insuranceMemberId || '');
  const [insuranceGroup, setInsuranceGroup] = useState(savedForm?.insuranceGroup || '');

  // Persist form state so edits survive PWA background/reload
  useEffect(() => {
    if (!open) {
      sessionStorage.removeItem('phleb-patient-edit-form');
      return;
    }
    if (loading) return;
    const formData = { firstName, lastName, email, phone, dob, street, city, state, zip, insuranceProvider, insuranceMemberId, insuranceGroup, tpId };
    sessionStorage.setItem('phleb-patient-edit-form', JSON.stringify(formData));
  }, [open, loading, firstName, lastName, email, phone, dob, street, city, state, zip, insuranceProvider, insuranceMemberId, insuranceGroup, tpId]);

  useEffect(() => {
    if (!open) return;

    // If we have saved form data from a prior session (PWA resumed), skip DB load
    const hasSavedForm = sessionStorage.getItem('phleb-patient-edit-form');
    if (hasSavedForm) {
      try {
        const f = JSON.parse(hasSavedForm);
        if (f.tpId) setTpId(f.tpId);
      } catch { /* ignore */ }
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);

      // Try by ID
      let patient: any = null;
      if (patientId) {
        const { data } = await supabase.from('tenant_patients').select('*').eq('id', patientId).maybeSingle();
        if (data) patient = data;
      }

      // Fallback by email
      if (!patient && patientEmail) {
        const { data } = await supabase.from('tenant_patients').select('*').ilike('email', patientEmail.trim()).maybeSingle();
        if (data) patient = data;
      }

      if (patient) {
        setTpId(patient.id);
        setFirstName(patient.first_name || '');
        setLastName(patient.last_name || '');
        setEmail(patient.email || '');
        setPhone(patient.phone || '');
        setDob(patient.date_of_birth || '');
        setInsuranceProvider(patient.insurance_provider || '');
        setInsuranceMemberId(patient.insurance_member_id || '');
        setInsuranceGroup(patient.insurance_group_number || '');
      } else {
        // Pre-fill from what we know
        const parts = initialName.split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
        setEmail(patientEmail || '');
      }

      setLoading(false);
    };
    load();
  }, [open, patientId, patientEmail, initialName]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: any = {
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        date_of_birth: dob || null,
        insurance_provider: insuranceProvider || null,
        insurance_member_id: insuranceMemberId || null,
        insurance_group_number: insuranceGroup || null,
      };

      if (tpId) {
        const { error } = await supabase.from('tenant_patients').update(updates).eq('id', tpId);
        if (error) throw error;
      } else {
        updates.tenant_id = '00000000-0000-0000-0000-000000000001';
        const { error } = await supabase.from('tenant_patients').insert(updates);
        if (error) throw error;
      }

      toast.success('Patient details saved');
      sessionStorage.removeItem('phleb-patient-edit-form');
      sessionStorage.removeItem('phleb-editing-patient');
      onClose();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#B91C1C]" />
            Edit Patient Details
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">First Name</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Last Name</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="4071234567" />
            </div>

            <div>
              <Label className="text-xs">Date of Birth</Label>
              <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Shield className="h-4 w-4" /> Insurance</p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Provider</Label>
                  <Input value={insuranceProvider} onChange={e => setInsuranceProvider(e.target.value)} placeholder="e.g. Blue Cross Blue Shield" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Member ID</Label>
                    <Input value={insuranceMemberId} onChange={e => setInsuranceMemberId(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Group Number</Label>
                    <Input value={insuranceGroup} onChange={e => setInsuranceGroup(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-2" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PatientEditModal;
