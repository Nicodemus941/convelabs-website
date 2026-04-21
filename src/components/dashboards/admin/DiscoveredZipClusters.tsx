import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin } from 'lucide-react';

/**
 * Geographic heatmap (lightweight): zipcode clusters of discovered
 * practices. Ranks by total referral count to reveal where your
 * natural partner density is. Useful for deciding where to open
 * location #2.
 *
 * Hormozi: expand where heat already exists, not where you wish it did.
 */
interface Cluster {
  zip: string;
  city: string;
  state: string;
  org_count: number;
  total_referrals: number;
  sample_names: string | null;
}

const DiscoveredZipClusters: React.FC = () => {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc('get_discovered_zip_clusters' as any).then(({ data }) => {
      setClusters((data as Cluster[]) || []);
      setLoading(false);
    });
  }, []);

  if (loading) return null;
  if (clusters.length === 0) return null;

  // Color saturation by referral density
  const maxRefs = Math.max(1, ...clusters.map(c => c.total_referrals));

  return (
    <Card className="shadow-sm border-blue-200 bg-gradient-to-br from-blue-50/40 to-white">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-4 w-4 text-blue-700" />
          <p className="font-semibold text-sm">Referral density by zip</p>
          <span className="text-[11px] text-muted-foreground ml-auto">
            {clusters.length} unique zip{clusters.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="space-y-1.5">
          {clusters.slice(0, 10).map((c, i) => {
            const intensity = Math.round((c.total_referrals / maxRefs) * 100);
            const bg = `rgba(59, 130, 246, ${Math.max(0.08, intensity / 200)})`;
            return (
              <div key={`${c.zip}-${i}`} className="flex items-center gap-2 py-1.5 px-2 rounded flex-wrap sm:flex-nowrap" style={{ backgroundColor: bg }}>
                <span className="font-mono font-semibold text-sm w-14 sm:w-16 flex-shrink-0">{c.zip}</span>
                <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">
                  {c.city}, {c.state}
                </span>
                <span className="text-[11px] sm:text-xs text-gray-600 whitespace-nowrap w-full sm:w-auto sm:text-right pl-16 sm:pl-0">
                  {c.org_count} · <strong className="text-gray-900">{c.total_referrals} ref{c.total_referrals === 1 ? '' : 's'}</strong>
                </span>
              </div>
            );
          })}
        </div>
        {clusters.length > 10 && (
          <p className="text-[11px] text-muted-foreground text-center mt-2">+{clusters.length - 10} more zips</p>
        )}
      </CardContent>
    </Card>
  );
};

export default DiscoveredZipClusters;
