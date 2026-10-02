/**
 * MarketingTab — the "Growth" section (Dashboard.tsx SECTION_SCREENS["growth"]).
 *
 * Rendered for both admin roles. Four views behind one header, in the
 * LabOrdersTab language (header + subtitle + right-aligned actions, a
 * segmented view switch, range chips):
 *
 *   Overview   — traffic by channel, outcomes, attribution gaps, daily chart,
 *                traffic sources, email broadcasts  (growth/GrowthOverview)
 *   Compose    — the existing MarketingCampaignForm (unchanged)
 *   Scheduled  — the existing ScheduledCampaignsTable (unchanged)
 *   Email log  — the existing CampaignAnalyticsDashboard (unchanged)
 *
 * Nothing on this screen writes to the database except the existing
 * campaign form, which is rendered as-is.
 */
import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TrendingUp, RefreshCw, PenSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { checkPlatformOwner } from './adminNav';
import { MarketingCampaignForm } from '@/components/admin/marketing';
import CampaignAnalyticsDashboard from '@/components/admin/marketing/CampaignAnalyticsDashboard';
import ScheduledCampaignsTable from '@/components/admin/marketing/ScheduledCampaignsTable';
import { SectionHeader, Segmented } from './owner/sectionUi';
import GrowthOverview, { RANGES, type RangeKey } from './growth/GrowthOverview';
import AbandonedBookings from './growth/AbandonedBookings';

type View = 'overview' | 'abandoned' | 'compose' | 'scheduled' | 'email';

const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'abandoned', label: 'Abandoned bookings' },
  { key: 'compose', label: 'Compose' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'email', label: 'Email log' },
];

// Abandoned bookings carries patient contact details + draft PHI → admins only.
const ABANDONED_ROLES = new Set(['super_admin', 'admin']);

const SUBTITLES: Record<View, string> = {
  overview: 'Where visitors come from, what they do, and every broadcast you have sent.',
  abandoned: 'Patients who started a booking and stopped — who, where, what we sent, and whether they came back.',
  compose: 'Write and send (or schedule) an email broadcast to patients or partners.',
  scheduled: 'Broadcasts queued to go out later — edit or cancel before they send.',
  email: 'Delivery log and history for every campaign email.',
};

const MarketingTab: React.FC = () => {
  const { user } = useAuth();
  const basePath = `/dashboard/${user?.role === 'office_manager' ? 'office_manager' : 'super_admin'}`;
  const isPlatformOwner = checkPlatformOwner(user?.email);
  const canSeeAbandoned = ABANDONED_ROLES.has(String(user?.role || ''));
  const visibleViews = VIEWS.filter(v => v.key !== 'abandoned' || canSeeAbandoned);

  const [view, setView] = useState<View>('overview');
  const [range, setRange] = useState<RangeKey>(() => {
    try { return (localStorage.getItem('convelabs_growth_range') as RangeKey) || '30d'; } catch { return '30d'; }
  });
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(false);

  const pickRange = (k: RangeKey) => {
    setRange(k);
    try { localStorage.setItem('convelabs_growth_range', k); } catch { /* ignore */ }
  };

  const onLoadingChange = useCallback((v: boolean) => setLoading(v), []);

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={TrendingUp}
        title="Growth"
        subtitle={SUBTITLES[view]}
        actions={
          <>
            <Segmented<View> value={view} onChange={(v) => setView(v)} options={visibleViews} label="Growth view" />
            {view === 'abandoned' && (
              <Button variant="outline" size="sm" onClick={() => setReloadToken(t => t + 1)} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}
            {view === 'overview' && (
              <>
                <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="Date range">
                  {RANGES.map((r, i) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => pickRange(r.key)}
                      aria-pressed={range === r.key}
                      className={cn('px-3 h-10 sm:h-9 text-xs font-medium transition', i > 0 && 'border-l border-gray-200',
                        range === r.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => setReloadToken(t => t + 1)} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              </>
            )}
            {view !== 'compose' && (
              <Button size="sm" onClick={() => setView('compose')} className="gap-1.5 text-xs h-10 sm:h-9 bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                <PenSquare className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">New campaign</span>
                <span className="sm:hidden">New</span>
              </Button>
            )}
          </>
        }
      />

      {view === 'overview' && (
        <GrowthOverview range={range} basePath={basePath} isPlatformOwner={isPlatformOwner} reloadToken={reloadToken} onLoadingChange={onLoadingChange} />
      )}
      {view === 'abandoned' && canSeeAbandoned && (
        <AbandonedBookings reloadToken={reloadToken} onLoadingChange={onLoadingChange} />
      )}
      {view === 'compose' && (
        <MarketingCampaignForm onCancel={() => setView('overview')} onSuccess={() => setReloadToken(t => t + 1)} />
      )}
      {view === 'scheduled' && <ScheduledCampaignsTable />}
      {view === 'email' && <CampaignAnalyticsDashboard />}
    </div>
  );
};

export default MarketingTab;
