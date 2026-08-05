import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar, Clock, MapPin, FileText, FlaskConical, CreditCard,
  Package, User, Building2, Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { PhlebAppointment } from '@/hooks/usePhlebotomistAppointments';
import LabOrderViewerModal from '@/components/phleb-dashboard/schedule/LabOrderViewerModal';

/**
 * CompletedJobModal — tap a completed job to review what was drawn.
 *
 * The Completed tab used to be read-only cards with no way to look back at the
 * order. Phlebs need to re-open a finished visit to confirm the panels, the
 * lab destination, the tubes, and (for family bundles) who else was drawn —
 * e.g. when the lab calls with a question days later. This surfaces all of the
 * order contents already on the PhlebAppointment plus an inline lab-order
 * viewer (reusing LabOrderViewerModal).
 */

interface Props {
  open: boolean;
  onClose: () => void;
  appt: PhlebAppointment | null;
}

function formatTime(t: string | null): string {
  if (!t) return '';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${period}`;
}

const Row: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-start gap-2.5 py-2">
    <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
      <div className="text-sm text-gray-800 mt-0.5 break-words">{children}</div>
    </div>
  </div>
);

const CompletedJobModal: React.FC<Props> = ({ open, onClose, appt }) => {
  const [viewerOpen, setViewerOpen] = useState(false);
  if (!appt) return null;

  const panels = appt.lab_order_panels || [];
  const hasOrderFile = !!appt.lab_order_file_path;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-emerald-600" />
              <span className="truncate">{appt.patient_name}</span>
              <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">
                Completed
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="divide-y divide-gray-100">
            <Row icon={<Calendar className="h-4 w-4" />} label="Date">
              {format(new Date(appt.appointment_date + 'T00:00:00'), 'EEEE, MMM d, yyyy')}
              {appt.appointment_time && <span className="text-gray-500"> · {formatTime(appt.appointment_time)}</span>}
            </Row>

            <Row icon={<FlaskConical className="h-4 w-4" />} label="Service / order">
              <span className="capitalize">{appt.service_name || appt.service_type?.replace(/_/g, ' ')}</span>
              {appt.specialty_kit_count ? <span className="text-gray-500"> · {appt.specialty_kit_count} kit{appt.specialty_kit_count === 1 ? '' : 's'}</span> : null}
              {panels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {panels.map((p, i) => (
                    <span key={i} className="inline-block bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 text-[11px]">{p}</span>
                  ))}
                </div>
              )}
            </Row>

            {appt.lab_destination && (
              <Row icon={<Package className="h-4 w-4" />} label="Delivered to">
                {appt.lab_destination}
              </Row>
            )}

            {appt.address && (
              <Row icon={<MapPin className="h-4 w-4" />} label="Location">
                {appt.address}
              </Row>
            )}

            {(appt.organization_name || appt.billed_to) && (
              <Row icon={<Building2 className="h-4 w-4" />} label="Billing">
                {appt.organization_name ? <>{appt.organization_name} · </> : null}
                <span className="capitalize">{appt.billed_to === 'org' ? 'billed to organization' : 'billed to patient'}</span>
              </Row>
            )}

            <Row icon={<CreditCard className="h-4 w-4" />} label="Payment">
              <span className="font-semibold">${(appt.total_amount || 0).toFixed(2)}</span>
              {appt.tip_amount > 0 && <span className="text-emerald-600"> · +${appt.tip_amount.toFixed(2)} tip</span>}
              {appt.payment_status && <span className="text-gray-500"> · {appt.payment_status}</span>}
            </Row>

            {appt.lab_order_ocr_text && (
              <Row icon={<FileText className="h-4 w-4" />} label="Order text (scanned)">
                <p className="text-xs text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto bg-gray-50 rounded p-2 border border-gray-100">
                  {appt.lab_order_ocr_text}
                </p>
              </Row>
            )}

            {appt.notes && (
              <Row icon={<FileText className="h-4 w-4" />} label="Notes">
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{appt.notes}</p>
              </Row>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            {hasOrderFile && (
              <Button
                onClick={() => setViewerOpen(true)}
                className="flex-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5"
                size="sm"
              >
                <FileText className="h-4 w-4" /> View lab order
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose} className={hasOrderFile ? '' : 'flex-1'}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LabOrderViewerModal
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        filePath={appt.lab_order_file_path}
        fileName={`${appt.patient_name} — lab order`}
      />
    </>
  );
};

export default CompletedJobModal;
