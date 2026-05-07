/**
 * Invite Org Staff Modal
 *
 * Admin (or org-admin in a future phase) clicks "Invite Staff" on an
 * organization, fills in name + role + email, and the staff member gets
 * a branded "you're invited" email with a one-click link to set their
 * password and land in the org's provider dashboard.
 *
 * Hormozi rule: "Make the right thing the easy thing." Inviting a new
 * org staff member should take 30 seconds, not a support ticket. Every
 * second of friction here is a missed referral the practice could be
 * sending us.
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Send, CheckCircle2, AlertTriangle, Mail, User, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Quick-pick role labels — covers ~95% of org staff. Free text is also accepted.
const COMMON_ROLES = [
  'Clinical Coordinator',
  'Office Manager',
  'Front Desk',
  'Medical Assistant',
  'Billing Coordinator',
  'Provider',
  'Practice Owner',
];

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
  /** Called after a successful invite. Parent can refresh the staff list. */
  onInvited?: (info: { email: string; userId: string | null }) => void;
}

const InviteOrgStaffModal: React.FC<Props> = ({ open, onClose, organizationId, organizationName, onInvited }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { kind: 'success'; mode: 'invite' | 'recovery'; email: string; emailStatus: string }
    | { kind: 'error'; message: string }
    | null
  >(null);

  const reset = () => {
    setFullName('');
    setEmail('');
    setRoleLabel('');
    setResult(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    const cleanRole = roleLabel.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!cleanName) {
      toast.error("Please enter the staff member's name");
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('invite-org-manager', {
        body: {
          email: cleanEmail,
          organizationId,
          fullName: cleanName,
          roleLabel: cleanRole || null,
          redirectTo: '/dashboard/provider',
        },
      });

      if (error) {
        const msg = (error as any)?.message || 'invite-org-manager failed';
        setResult({ kind: 'error', message: msg });
        toast.error(`Couldn't send invite: ${msg}`);
        return;
      }

      const res = data as any;
      if (!res?.ok) {
        const msg = res?.error || 'Unknown error';
        setResult({ kind: 'error', message: msg });
        toast.error(`Couldn't send invite: ${msg}`);
        return;
      }

      // Success path. email_status='sent' = Mailgun confirmed delivery to its
      // queue. email_status='failed' = Mailgun rejected (bad address etc.).
      const emailStatus = res.email_status || 'unknown';
      if (emailStatus === 'failed') {
        // The auth user got created and the action_link was generated, but
        // the email didn't go out. Give admin the link so they can send it
        // manually if they want.
        const fallback = res.action_link || '';
        setResult({ kind: 'error', message: `Auth user created but email failed: ${res.email_error}. Manual link: ${fallback}` });
        toast.warning('Auth user created, but the email send failed. Copy the manual link from the dialog.');
        return;
      }

      setResult({
        kind: 'success',
        mode: res.mode || 'invite',
        email: cleanEmail,
        emailStatus,
      });
      toast.success(`Invite sent to ${cleanEmail}`);
      onInvited?.({ email: cleanEmail, userId: res.user_id || null });
    } catch (e: any) {
      setResult({ kind: 'error', message: e?.message || 'Unknown error' });
      toast.error(`Couldn't send invite: ${e?.message || 'unknown'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-[#7F1D1D]" />
            Invite staff to {organizationName}
          </DialogTitle>
          <DialogDescription>
            Send a one-click email invitation. They'll set a password and land in the {organizationName} dashboard scoped to their patients.
          </DialogDescription>
        </DialogHeader>

        {result?.kind === 'success' ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
            <div>
              <p className="font-semibold">Invite sent</p>
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-mono text-xs">{result.email}</span> will receive a branded email from{' '}
                <span className="font-semibold">Nicodemme Jean-Baptiste</span>
                {result.mode === 'recovery' && (
                  <> (they already have an account — got a password-reset link)</>
                )}
                .
              </p>
              <p className="text-xs text-gray-500 mt-2">Link expires in 24 hours. They click → set a password → land in the {organizationName} portal.</p>
            </div>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => { reset(); }}>Invite another</Button>
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {result?.kind === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-800 break-words">{result.message}</div>
              </div>
            )}

            <div>
              <Label htmlFor="invite-name" className="flex items-center gap-1.5 text-xs">
                <User className="h-3.5 w-3.5" /> Full name
              </Label>
              <Input
                id="invite-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Lara Kiessling"
                required
                autoFocus
                disabled={submitting}
              />
            </div>

            <div>
              <Label htmlFor="invite-email" className="flex items-center gap-1.5 text-xs">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="larak@jasonmd.com"
                required
                disabled={submitting}
              />
            </div>

            <div>
              <Label htmlFor="invite-role" className="flex items-center gap-1.5 text-xs">
                <Briefcase className="h-3.5 w-3.5" /> Role at {organizationName}
              </Label>
              <Input
                id="invite-role"
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                placeholder="Clinical Coordinator"
                list="invite-role-suggestions"
                disabled={submitting}
              />
              <datalist id="invite-role-suggestions">
                {COMMON_ROLES.map(r => <option key={r} value={r} />)}
              </datalist>
              <p className="text-[11px] text-gray-500 mt-1">
                Shown in the invite email + their profile. Free text — pick a suggestion or type your own.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-xs text-amber-900">
                <strong>What this does:</strong> creates an auth account with role <code>office_manager</code>{' '}
                scoped to {organizationName}, and emails them a one-click set-password link. The link expires in 24 hours.
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-[#7F1D1D] hover:bg-[#5C1414]">
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</>
                ) : (
                  <><Send className="h-4 w-4 mr-1.5" /> Send invitation</>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InviteOrgStaffModal;
