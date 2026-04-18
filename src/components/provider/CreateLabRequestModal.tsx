import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, UploadCloud, FileText, X } from 'lucide-react';

/**
 * Provider-facing modal: "Request labs for a patient"
 * On submit → uploads the lab order to storage → calls create-lab-request
 * → patient gets email + SMS → provider gets toast confirmation.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  onCreated: () => void;
}

const CreateLabRequestModal: React.FC<Props> = ({ open, onClose, orgId, orgName, onCreated }) => {
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [drawByDate, setDrawByDate] = useState('');
  const [nextApptDate, setNextApptDate] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPatientName(''); setPatientEmail(''); setPatientPhone('');
    setDrawByDate(''); setNextApptDate(''); setAdminNotes(''); setFile(null);
  };

  const canSubmit = !!(
    patientName.trim() &&
    drawByDate &&
    (patientEmail.trim() || patientPhone.trim())
  );

  const handleSubmit = async () => {
    if (!canSubmit) { toast.error('Please fill the required fields'); return; }
    setSaving(true);
    try {
      let labOrderPath: string | null = null;

      if (file) {
        setUploading(true);
        const ext = file.name.split('.').pop() || 'pdf';
        const path = `lab-request/${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('lab-orders').upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        labOrderPath = path;
        setUploading(false);
      }

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/create-lab-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          organization_id: orgId,
          patient_name: patientName.trim(),
          patient_email: patientEmail.trim() || null,
          patient_phone: patientPhone.trim() || null,
          lab_order_file_path: labOrderPath,
          draw_by_date: drawByDate,
          next_doctor_appt_date: nextApptDate || null,
          admin_notes: adminNotes.trim() || null,
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Failed to create request');

      toast.success(`Request sent to ${patientName.split(' ')[0]} · we'll notify you when they book`);
      reset();
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create lab request');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request labs for a patient</DialogTitle>
          <DialogDescription className="text-xs">Your patient will get an email + SMS with a one-click booking link. You'll be notified the moment they schedule.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* PATIENT */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Patient</p>
            <div>
              <Label>Full name *</Label>
              <Input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Jane Smith" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={patientEmail} onChange={e => setPatientEmail(e.target.value)} placeholder="jane@example.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={patientPhone} onChange={e => setPatientPhone(e.target.value)} placeholder="407-555-1234" />
              </div>
            </div>
            <p className="text-[11px] text-gray-500">At least one of email or phone required — that's how we reach them.</p>
          </div>

          {/* THE ORDER */}
          <div className="space-y-2 pt-3 border-t">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Lab order</p>
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {!file ? (
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-[#B91C1C] hover:bg-red-50/30 transition text-center">
                <UploadCloud className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium">Upload the lab order (PDF or image)</p>
                <p className="text-[11px] text-gray-500 mt-1">We'll read it with OCR and pre-fill the panels for your patient</p>
              </button>
            ) : (
              <div className="flex items-center gap-2 border rounded-lg p-3 bg-gray-50">
                <FileText className="h-5 w-5 text-[#B91C1C] flex-shrink-0" />
                <span className="text-sm truncate flex-1">{file.name}</span>
                <button onClick={() => setFile(null)}><X className="h-4 w-4 text-gray-400 hover:text-red-600" /></button>
              </div>
            )}
          </div>

          {/* TIMING */}
          <div className="space-y-3 pt-3 border-t">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Timing</p>
            <div>
              <Label>Draw no later than *</Label>
              <Input type="date" value={drawByDate} min={new Date().toISOString().substring(0, 10)} onChange={e => setDrawByDate(e.target.value)} />
            </div>
            <div>
              <Label>Their next visit with you <span className="text-[11px] text-gray-400">(optional — adds urgency context)</span></Label>
              <Input type="date" value={nextApptDate} min={drawByDate || new Date().toISOString().substring(0, 10)} onChange={e => setNextApptDate(e.target.value)} />
            </div>
          </div>

          {/* NOTES */}
          <div className="space-y-2 pt-3 border-t">
            <Label>Notes for the patient <span className="text-[11px] text-gray-400">(optional)</span></Label>
            <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2}
              placeholder="e.g. 'Remember the 12-hour fast', or 'Please arrive at a LabCorp location — we're waiting for a delivery slot'" />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5">
            {saving || uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> {uploading ? 'Uploading…' : 'Sending…'}</> : 'Send request to patient'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateLabRequestModal;
