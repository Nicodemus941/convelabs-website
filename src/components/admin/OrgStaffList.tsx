/**
 * Org Staff List
 *
 * Renders every auth user whose user_metadata.organization_id points at
 * this org, with role, last sign-in, and email-delivery status from
 * email_send_log. Lets admin one-click resend the invite.
 *
 * Pulled from a SECURITY DEFINER RPC because admin-side queries against
 * auth.users require service-role; we don't want the service key in the
 * client bundle. The RPC is gated by has_any_role('super_admin','admin','owner').
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, UserPlus, Mail, Clock, CheckCircle2, AlertTriangle, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import InviteOrgStaffModal from './InviteOrgStaffModal';

interface OrgStaffRow {
  user_id: string;
  email: string;
  full_name: string | null;
  role_label: string | null;          // 'Clinical Coordinator' etc.
  invited_at: string | null;
  last_sign_in_at: string | null;
  confirmed_at: string | null;
  /** From email_send_log — most recent invite send status for this email */
  last_invite_status: 'sent' | 'failed' | 'queued' | null;
  last_invite_sent_at: string | null;
  last_invite_error: string | null;
}

interface Props {
  organizationId: string;
  organizationName: string;
}

const OrgStaffList: React.FC<Props> = ({ organizationId, organizationName }) => {
  const [rows, setRows] = useState<OrgStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingFor, setResendingFor] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_org_staff_admin' as any, {
        p_organization_id: organizationId,
      });
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      console.error('[OrgStaffList] load failed:', e);
      toast.error('Could not load staff list');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const handleResend = async (row: OrgStaffRow) => {
    setResendingFor(row.email);
    try {
      const { data, error } = await supabase.functions.invoke('invite-org-manager', {
        body: {
          email: row.email,
          organizationId,
          fullName: row.full_name || null,
          roleLabel: row.role_label || null,
          redirectTo: '/dashboard/provider',
        },
      });
      if (error) throw new Error((error as any)?.message || 'invite failed');
      const res = data as any;
      if (!res?.ok) throw new Error(res?.error || 'unknown');
      const mode = res.mode === 'recovery' ? 'password reset' : 'invite';
      toast.success(`Sent ${mode} to ${row.email}`);
      load(); // refresh status
    } catch (e: any) {
      toast.error(`Resend failed: ${e?.message || 'unknown'}`);
    } finally {
      setResendingFor(null);
    }
  };

  const renderStatus = (row: OrgStaffRow) => {
    if (row.last_sign_in_at) {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
    }
    if (row.confirmed_at) {
      return <Badge variant="outline">Set password — never logged in</Badge>;
    }
    if (row.last_invite_status === 'failed') {
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><AlertTriangle className="h-3 w-3 mr-1" />Email failed</Badge>;
    }
    if (row.last_invite_status === 'sent' || row.invited_at) {
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Invite pending</Badge>;
    }
    return <Badge variant="outline">No invite sent</Badge>;
  };

  return (
    <>
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Organization Staff</h3>
              <p className="text-xs text-gray-500">{rows.length} {rows.length === 1 ? 'person' : 'people'} with portal access</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button size="sm" onClick={() => setInviteOpen(true)} className="bg-[#7F1D1D] hover:bg-[#5C1414]">
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Invite Staff
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No staff yet for {organizationName}. Click <strong>Invite Staff</strong> to send the first invitation.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map(row => (
                <div key={row.user_id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{row.full_name || row.email.split('@')[0]}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {row.email}
                      {row.role_label && <span className="ml-1.5 text-gray-400">· {row.role_label}</span>}
                    </p>
                    {row.last_invite_sent_at && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Last invite: {format(new Date(row.last_invite_sent_at), 'MMM d, h:mm a')}
                        {row.last_invite_error && <span className="text-red-600 ml-1">· {row.last_invite_error.slice(0, 50)}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {renderStatus(row)}
                    {!row.last_sign_in_at && (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => handleResend(row)}
                        disabled={resendingFor === row.email}
                      >
                        {resendingFor === row.email ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        <span className="ml-1 text-xs">Resend</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <InviteOrgStaffModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        organizationId={organizationId}
        organizationName={organizationName}
        onInvited={() => { setInviteOpen(false); load(); }}
      />
    </>
  );
};

export default OrgStaffList;
