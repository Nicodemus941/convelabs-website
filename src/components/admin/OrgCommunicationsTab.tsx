import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import {
  Mail, Send, CheckCircle2, AlertCircle, Eye, MousePointerClick, Shield, Copy, Inbox, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * OrgCommunicationsTab — per-org email log.
 *
 * Shows every email we've sent on behalf of or to this org, time-stamped
 * and typed. Source of truth is email_send_log rows joined by
 * organization_id. RPC: get_org_email_log(p_org_id).
 *
 * Columns (stacked on mobile): sent_at · to/cc · type chip · subject ·
 * status chip · mailgun_id (click to copy for support lookup).
 */

interface Row {
  id: string;
  sent_at: string;
  to_email: string | null;
  cc_emails: string[] | null;
  email_type: string | null;
  subject: string | null;
  status: string | null;
  mailgun_id: string | null;
  sent_by_name: string | null;
}

const TYPE_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  org_welcome:              { label: 'Welcome',      bg: 'bg-emerald-50', color: 'text-emerald-800', border: 'border-emerald-200' },
  org_outreach:             { label: 'Outreach',     bg: 'bg-indigo-50',  color: 'text-indigo-800',  border: 'border-indigo-200' },
  org_announcement:         { label: 'Announcement', bg: 'bg-violet-50',  color: 'text-violet-800',  border: 'border-violet-200' },
  overdue_lab_digest:       { label: 'Overdue lab',  bg: 'bg-amber-50',   color: 'text-amber-800',   border: 'border-amber-200' },
  appointment_confirmation: { label: 'Confirmation', bg: 'bg-blue-50',    color: 'text-blue-800',    border: 'border-blue-200' },
  appointment_reminder:     { label: 'Reminder',     bg: 'bg-sky-50',     color: 'text-sky-800',     border: 'border-sky-200' },
  specimen_delivered_org:   { label: 'Specimen',     bg: 'bg-teal-50',    color: 'text-teal-800',    border: 'border-teal-200' },
  invoice:                  { label: 'Invoice',      bg: 'bg-rose-50',    color: 'text-rose-800',    border: 'border-rose-200' },
  other:                    { label: 'Other',        bg: 'bg-gray-50',    color: 'text-gray-700',    border: 'border-gray-200' },
};

const STATUS_META: Record<string, { Icon: any; color: string; label: string }> = {
  sent:       { Icon: Send,         color: 'text-blue-600',     label: 'Sent' },
  opened:     { Icon: Eye,          color: 'text-emerald-600',  label: 'Opened' },
  clicked:    { Icon: MousePointerClick, color: 'text-emerald-700', label: 'Clicked' },
  failed:     { Icon: AlertCircle,  color: 'text-red-600',      label: 'Failed' },
  bounced:    { Icon: AlertCircle,  color: 'text-red-600',      label: 'Bounced' },
  complained: { Icon: Shield,       color: 'text-amber-700',    label: 'Complained' },
};

const typeMeta = (t: string | null | undefined) => TYPE_META[t || 'other'] || TYPE_META.other;

interface Props { orgId: string; }

const OrgCommunicationsTab: React.FC<Props> = ({ orgId }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_org_email_log' as any, { p_org_id: orgId, p_limit: 200 });
      if (error) throw error;
      setRows((data || []) as Row[]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load email log');
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const types = Array.from(new Set(rows.map(r => r.email_type || 'other')));
  const filtered = filter === 'all' ? rows : rows.filter(r => (r.email_type || 'other') === filter);

  const copyId = (id: string | null) => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    toast.success('Mailgun ID copied');
  };

  return (
    <div className="space-y-3">
      {/* Header row: count + refresh */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">
          {loading ? 'Loading…' : `${rows.length} email${rows.length === 1 ? '' : 's'} sent to or on behalf of this org`}
        </p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md hover:bg-gray-100"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Type filter chips */}
      {types.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'
            }`}
          >
            All
            <span className={`ml-1.5 px-1.5 rounded-full text-[10px] ${filter === 'all' ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{rows.length}</span>
          </button>
          {types.map((t) => {
            const meta = typeMeta(t);
            const n = rows.filter(r => (r.email_type || 'other') === t).length;
            const sel = filter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  sel ? 'bg-gray-900 text-white border-gray-900' : `bg-white text-gray-700 border-gray-200`
                }`}
              >
                {meta.label}
                <span className={`ml-1.5 px-1.5 rounded-full text-[10px] ${sel ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1].map(i => <div key={i} className="bg-white border rounded-lg p-4 animate-pulse h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-10 text-center">
          <Inbox className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {rows.length === 0 ? 'No emails sent to this org yet.' : 'No emails match this filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {filtered.map((r) => {
            const tMeta = typeMeta(r.email_type);
            const sMeta = STATUS_META[r.status || 'sent'] || STATUS_META.sent;
            const SIcon = sMeta.Icon;
            return (
              <div key={r.id} className="p-3 sm:p-4">
                <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                  <div className={`w-9 h-9 rounded-lg ${tMeta.bg} ${tMeta.border} border flex items-center justify-center flex-shrink-0`}>
                    <Mail className={`h-4 w-4 ${tMeta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${tMeta.bg} ${tMeta.color} border-0 font-semibold`}>
                        {tMeta.label}
                      </Badge>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${sMeta.color}`}>
                        <SIcon className="h-3 w-3" /> {sMeta.label}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {format(new Date(r.sent_at), 'MMM d, yyyy · h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 mt-1 break-words">
                      {r.subject || '(no subject recorded)'}
                    </p>
                    <p className="text-[11px] text-gray-600 mt-1 break-all">
                      <span className="font-semibold text-gray-700">To:</span> {r.to_email || '—'}
                      {Array.isArray(r.cc_emails) && r.cc_emails.length > 0 && (
                        <>
                          <br />
                          <span className="font-semibold text-gray-700">CC:</span> {r.cc_emails.join(', ')}
                        </>
                      )}
                    </p>
                    {(r.mailgun_id || r.sent_by_name) && (
                      <div className="mt-1.5 flex gap-3 text-[10px] text-gray-500 flex-wrap">
                        {r.sent_by_name && (
                          <span>by {r.sent_by_name}</span>
                        )}
                        {r.mailgun_id && (
                          <button
                            type="button"
                            onClick={() => copyId(r.mailgun_id)}
                            className="inline-flex items-center gap-1 font-mono text-[10px] hover:text-gray-900"
                            title="Click to copy Mailgun ID (for support lookup)"
                          >
                            <Copy className="h-2.5 w-2.5" />
                            {r.mailgun_id.slice(0, 16)}…
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OrgCommunicationsTab;
