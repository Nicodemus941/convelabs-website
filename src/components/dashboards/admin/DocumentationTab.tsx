import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Search, FileText, Clock, CheckCircle2, PlayCircle, Loader2, ExternalLink } from 'lucide-react';

/**
 * DocumentationTab — the operator manual.
 *
 * Part J1 of the Operations Manager blueprint: one canonical surface for
 * every SOP, procedure, and operational playbook. Reads training_courses
 * as the source of truth so admin, phleb, and patient-support docs all
 * live in one place without duplication.
 *
 * Hormozi principle: "the manual is what every future operator will do in
 * your absence." This page IS that manual.
 */

interface CourseRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  content_md: string | null;
  video_url: string | null;
  estimated_minutes: number | null;
  required: boolean;
  sort_order: number | null;
  published: boolean;
}

// Category → readable role grouping. Kept here so the UI doesn't need
// schema changes when we add more SOP types.
const CATEGORY_GROUPS: Record<string, { label: string; badge: string }> = {
  sop_booking:              { label: 'Phleb · Booking',          badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  sop_visit_prep:           { label: 'Phleb · Visit Prep',       badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  sop_visit_execution:      { label: 'Phleb · Visit Execution',  badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  sop_specimen_delivery:    { label: 'Phleb · Specimen Delivery',badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  sop_payment:              { label: 'Admin · Payments',         badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sop_follow_up:            { label: 'Admin · Follow-Up',        badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sop_admin_partner_onboarding: { label: 'Admin · Partner Onboarding', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sop_admin_staff_invite:   { label: 'Admin · Staff Invite',     badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sop_admin_refunds:        { label: 'Admin · Refunds',          badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sop_admin_weekly_reconciliation: { label: 'Admin · Weekly Reconciliation', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sop_admin_google_reviews: { label: 'Admin · Google Reviews',   badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sop_admin_cancel_reschedule: { label: 'Admin · Cancel/Reschedule', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sop_admin_pause_notifications: { label: 'Admin · Pause Notifications', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  sop_system_deploy_edge_fn: { label: 'System · Deploy Edge Fn', badge: 'bg-purple-50 text-purple-800 border-purple-200' },
  sop_system_run_reconciler:{ label: 'System · Run Reconciler',  badge: 'bg-purple-50 text-purple-800 border-purple-200' },
  sop_system_restore_patient:{ label: 'System · Restore Patient',badge: 'bg-purple-50 text-purple-800 border-purple-200' },
  sop_system_rotate_stripe_secret: { label: 'System · Rotate Stripe Secret', badge: 'bg-purple-50 text-purple-800 border-purple-200' },
  sop_support_first_booking:{ label: 'Support · First Booking',  badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  sop_support_missing_results: { label: 'Support · Missing Results', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  sop_support_member_savings: { label: 'Support · Member Savings',badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  system:                   { label: 'System · Overview',        badge: 'bg-gray-50 text-gray-800 border-gray-200' },
  subscription:             { label: 'Business · Subscriptions', badge: 'bg-gray-50 text-gray-800 border-gray-200' },
  partner:                  { label: 'Business · Partners',      badge: 'bg-gray-50 text-gray-800 border-gray-200' },
};

const categoryLabel = (cat: string) => CATEGORY_GROUPS[cat]?.label || cat.replace(/_/g, ' ');
const categoryBadge = (cat: string) => CATEGORY_GROUPS[cat]?.badge || 'bg-gray-50 text-gray-800 border-gray-200';

const roleGroup = (cat: string): string => {
  if (cat.startsWith('sop_admin_')) return 'Admin';
  if (cat.startsWith('sop_system_')) return 'System';
  if (cat.startsWith('sop_support_')) return 'Patient Support';
  if (cat.startsWith('sop_')) return 'Phlebotomist';
  return 'Business Overview';
};

const ROLE_ORDER = ['Phlebotomist', 'Admin', 'System', 'Patient Support', 'Business Overview'];

const DocumentationTab: React.FC = () => {
  const [rows, setRows] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<CourseRow | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('training_courses' as any)
          .select('*')
          .eq('published', true)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        setRows((data || []) as any as CourseRow[]);
      } catch (e) {
        console.error('[DocumentationTab] load failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (roleFilter && roleGroup(r.category) !== roleFilter) return false;
      if (!q) return true;
      const hay = `${r.title} ${r.summary || ''} ${r.content_md || ''} ${r.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, roleFilter]);

  const grouped = useMemo(() => {
    const m = new Map<string, CourseRow[]>();
    for (const r of filtered) {
      const g = roleGroup(r.category);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    return ROLE_ORDER.map(role => ({ role, items: m.get(role) || [] })).filter(g => g.items.length > 0);
  }, [filtered]);

  const totalDocs = rows.length;
  const withVideo = rows.filter(r => !!r.video_url).length;
  const coveragePct = totalDocs > 0 ? Math.round((withVideo / totalDocs) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Manual</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every SOP, procedure, and operational playbook for ConveLabs — the single source of truth
            for running the business.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <div><strong className="text-gray-900">{totalDocs}</strong> docs</div>
          <div>
            <strong className={coveragePct === 100 ? 'text-emerald-600' : coveragePct >= 60 ? 'text-amber-600' : 'text-red-600'}>
              {coveragePct}%
            </strong>
            <span className="ml-1">with video</span>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search procedures, SOPs, onboarding docs…"
              className="pl-10 h-10"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setRoleFilter(null)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${roleFilter === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
            >
              All roles
            </button>
            {ROLE_ORDER.map(role => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${roleFilter === role ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
              >
                {role}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="p-12 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></CardContent></Card>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No documents match this filter.</p>
        </CardContent></Card>
      ) : (
        grouped.map(({ role, items }) => (
          <div key={role}>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{role} <span className="text-gray-400 font-normal">· {items.length}</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map(row => (
                <button
                  key={row.id}
                  onClick={() => setOpen(row)}
                  className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${categoryBadge(row.category)}`}>
                      {categoryLabel(row.category)}
                    </span>
                    {row.video_url ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] flex-shrink-0">
                        <PlayCircle className="h-3 w-3 mr-0.5" /> video
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-gray-400 flex-shrink-0">(no video)</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{row.title}</p>
                  {row.summary && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{row.summary}</p>}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                    {row.estimated_minutes ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {row.estimated_minutes} min</span> : null}
                    {row.required ? <span className="flex items-center gap-1 text-amber-700"><CheckCircle2 className="h-3 w-3" /> required</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={!!open} onOpenChange={v => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${categoryBadge(open.category)}`}>
                    {categoryLabel(open.category)}
                  </span>
                  {open.required && <Badge className="bg-amber-50 text-amber-700 border-amber-200">Required</Badge>}
                  {open.estimated_minutes && <span className="text-xs text-gray-500 flex items-center gap-1 ml-auto"><Clock className="h-3 w-3" /> {open.estimated_minutes} min</span>}
                </div>
                <DialogTitle className="text-xl mt-2">{open.title}</DialogTitle>
                {open.summary && <p className="text-sm text-gray-600 mt-1">{open.summary}</p>}
              </DialogHeader>

              {open.video_url ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 my-3">
                  <a href={open.video_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-[#B91C1C] font-semibold">
                    <PlayCircle className="h-5 w-5" /> Watch the walkthrough video <ExternalLink className="h-3.5 w-3.5 ml-auto" />
                  </a>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 my-3 text-xs text-amber-900">
                  No video yet. Record a 3-5 min Loom walking through this SOP and paste the URL in admin → Training to complete the document.
                </div>
              )}

              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800 text-sm leading-relaxed">
                {open.content_md || 'No written content yet — edit this SOP in admin → Training.'}
              </div>

              <div className="flex justify-end pt-4 border-t mt-4">
                <Button variant="outline" onClick={() => setOpen(null)}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentationTab;
