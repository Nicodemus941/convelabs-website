import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Loader2, Send, MapPin, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import SignaturePad, { type SignaturePadHandle } from './SignaturePad';

const LABS = [
  { value: 'labcorp', label: 'LabCorp' },
  { value: 'quest', label: 'Quest Diagnostics' },
  { value: 'adventhealth', label: 'AdventHealth' },
  { value: 'orlando_health', label: 'Orlando Health' },
  { value: 'ups', label: 'UPS (Shipping)' },
  { value: 'fedex', label: 'FedEx (Shipping)' },
  { value: 'rupa_health', label: 'Rupa Health' },
  { value: 'other', label: 'Other' },
];

interface SpecimenDeliveryModalProps {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  patientId: string | null;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  serviceType: string;
  onDelivered: () => void;
}

const SpecimenDeliveryModal: React.FC<SpecimenDeliveryModalProps> = ({
  open, onClose, appointmentId, patientId, patientName,
  patientPhone, patientEmail, serviceType, onDelivered,
}) => {
  const [specimenId, setSpecimenId] = useState('');
  const [labName, setLabName] = useState('');
  const [labAddress, setLabAddress] = useState('');
  const [tubeCount, setTubeCount] = useState('1');
  const [tubeTypes, setTubeTypes] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Chain-of-custody enhancements (Sprint 3.5)
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [geoCapturing, setGeoCapturing] = useState(false);
  const [geoStamp, setGeoStamp] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [signatureCaptured, setSignatureCaptured] = useState(false);

  const captureGeo = async () => {
    setGeoCapturing(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject('Geolocation not available');
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 30_000,
        });
      });
      setGeoStamp({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
      toast.success('Delivery location captured');
    } catch (e: any) {
      toast.error('Location permission denied — delivery will record without geo-stamp');
    } finally {
      setGeoCapturing(false);
    }
  };

  const handleSubmit = async () => {
    if (!specimenId.trim() || !labName) {
      toast.error('Specimen ID and Lab are required');
      return;
    }

    setIsSaving(true);
    try {
      const labLabel = LABS.find(l => l.value === labName)?.label || labName;

      // Save specimen delivery record
      const { error: insertError } = await supabase.from('specimen_deliveries' as any).insert({
        appointment_id: appointmentId,
        patient_id: patientId,
        patient_name: patientName,
        specimen_id: specimenId.trim(),
        lab_name: labLabel,
        lab_address: labAddress || null,
        tube_count: parseInt(tubeCount) || 1,
        tube_types: tubeTypes || null,
        service_type: serviceType,
        delivery_notes: deliveryNotes || null,
        collection_time: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        delivered_by: (() => { try { const stored = localStorage.getItem('sb-yluyonhrxxtyuiyrdixl-auth-token'); if (stored) { const p = JSON.parse(stored); return p?.user?.user_metadata?.full_name || p?.user?.email || 'Phlebotomist'; } } catch {} return 'Phlebotomist'; })(),
        status: 'delivered',
      });

      if (insertError) throw insertError;

      // Upload signature if present
      let signaturePath: string | null = null;
      try {
        if (signatureRef.current && !signatureRef.current.isEmpty()) {
          const blob = await signatureRef.current.toBlob();
          if (blob) {
            const sigName = `sig_${appointmentId}_${Date.now()}.png`;
            const { error: sigErr } = await supabase.storage.from('specimen-signatures').upload(sigName, blob, {
              contentType: 'image/png',
              upsert: true,
            });
            if (!sigErr) signaturePath = sigName;
            else console.warn('Signature upload failed:', sigErr);
          }
        }
      } catch (e) { console.warn('Signature capture exception:', e); }

      // Update appointment status + chain-of-custody fields
      await supabase.from('appointments').update({
        status: 'specimen_delivered',
        delivered_at: new Date().toISOString(),
        ...(geoStamp ? { delivery_location: geoStamp } : {}),
        ...(signaturePath ? { delivery_signature_path: signaturePath } : {}),
      }).eq('id', appointmentId);

      // Send SMS notification to patient
      if (patientPhone) {
        await supabase.functions.invoke('send-sms-notification', {
          body: {
            phoneNumber: patientPhone.startsWith('+') ? patientPhone : `+1${patientPhone.replace(/\D/g, '')}`,
            notificationType: 'sample_delivered',
            labName: labLabel,
            trackingId: specimenId.trim(),
          },
        }).catch(err => console.error('SMS error:', err));
      }

      // Send email notification
      if (patientEmail) {
        await supabase.functions.invoke('send-email', {
          body: {
            to: patientEmail,
            subject: `Specimen Delivered to ${labLabel} - Tracking ID: ${specimenId.trim()}`,
            html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;">
              <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                <h2 style="margin:0;">Specimen Delivered</h2>
              </div>
              <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
                <p>Hi ${patientName},</p>
                <p>Your specimens have been successfully delivered to <strong>${labLabel}</strong>.</p>
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:16px 0;">
                  <p style="margin:0;font-size:14px;"><strong>Lab-Generated Tracking ID:</strong></p>
                  <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#166534;">${specimenId.trim()}</p>
                  <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">Lab: ${labLabel}${labAddress ? ' | ' + labAddress : ''}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Tubes: ${tubeCount}${tubeTypes ? ' (' + tubeTypes + ')' : ''}</p>
                </div>
                <p style="font-size:13px;color:#6b7280;">Your results will be available through your lab's patient portal. If your provider does not see results, provide them with the tracking ID above.</p>
                <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810<br>(941) 527-9169</p>
              </div>
            </div>`,
          },
        }).catch(err => console.error('Email error:', err));
      }

      toast.success(`Specimen delivered to ${labLabel}. Patient notified.`);
      onDelivered();
      onClose();
    } catch (err: any) {
      console.error('Specimen delivery error:', err);
      toast.error(err.message || 'Failed to record delivery');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[#B91C1C]" />
            Specimen Delivery
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-blue-800">Patient: {patientName}</p>
            {patientPhone && <p className="text-xs text-blue-600">SMS + Email notification will be sent</p>}
            {!patientPhone && patientEmail && <p className="text-xs text-blue-600">Email notification will be sent (no phone on file)</p>}
          </div>

          <div>
            <Label>Specimen / Tracking ID *</Label>
            <Input
              value={specimenId}
              onChange={e => setSpecimenId(e.target.value)}
              placeholder="e.g. LC-2026-04131, QD-789456"
              className="font-mono"
            />
          </div>

          <div>
            <Label>Lab / Destination *</Label>
            <Select value={labName} onValueChange={setLabName}>
              <SelectTrigger><SelectValue placeholder="Select lab" /></SelectTrigger>
              <SelectContent>
                {LABS.map(l => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Lab Address (optional)</Label>
            <Input value={labAddress} onChange={e => setLabAddress(e.target.value)} placeholder="Lab location or drop-off point" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tube Count</Label>
              <Input type="number" min="1" value={tubeCount} onChange={e => setTubeCount(e.target.value)} />
            </div>
            <div>
              <Label>Tube Types</Label>
              <Input value={tubeTypes} onChange={e => setTubeTypes(e.target.value)} placeholder="SST, EDTA, etc." />
            </div>
          </div>

          <div>
            <Label>Delivery Notes (optional)</Label>
            <Textarea value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} placeholder="Any notes about the delivery..." rows={2} />
          </div>

          {/* ─── Chain-of-Custody (Sprint 3.5) ──────────────────────── */}
          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">Chain of Custody (optional)</p>

            {/* Geo-stamp capture */}
            <div className="flex items-start gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs flex-shrink-0"
                onClick={captureGeo}
                disabled={geoCapturing || isSaving}
              >
                {geoCapturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                  geoStamp ? <Check className="h-3.5 w-3.5 text-emerald-600" /> :
                    <MapPin className="h-3.5 w-3.5" />}
                {geoStamp ? 'Location stamped' : 'Stamp delivery location'}
              </Button>
              {geoStamp && (
                <p className="text-[10px] text-gray-500 flex-1 min-w-0 pt-1.5">
                  {geoStamp.lat.toFixed(5)}, {geoStamp.lng.toFixed(5)} · ±{Math.round(geoStamp.accuracy)}m
                </p>
              )}
            </div>

            {/* Signature pad — lab clerk signs for receipt */}
            <div>
              <Label className="text-xs text-gray-600">Receiver signature (lab clerk)</Label>
              <SignaturePad ref={signatureRef} onChange={(isEmpty) => setSignatureCaptured(!isEmpty)} height={140} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-2"
            onClick={handleSubmit}
            disabled={isSaving || !specimenId.trim() || !labName}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Confirm Delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SpecimenDeliveryModal;
