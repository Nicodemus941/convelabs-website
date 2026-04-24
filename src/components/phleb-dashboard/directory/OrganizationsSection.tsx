import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { Building2, Search } from 'lucide-react';

interface Row {
  org_id: string;
  org_name: string;
  visit_count: number;
  last_visit_date: string;
  upcoming_count: number;
}

const OrganizationsSection: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_phleb_served_orgs' as any);
        if (error) throw error;
        // eslint-disable-next-line no-console
        console.log(`[phleb-directory] Orgs RPC returned ${data?.length ?? 0} rows`);
        setRows((data || []) as Row[]);
      } catch (e: any) {
        console.error('[phleb-directory] Orgs load failed:', e);
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = rows.filter((r) => !q.trim() || r.org_name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search organizations…" className="pl-9 h-10" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map(i => <div key={i} className="bg-white border rounded-lg p-4 animate-pulse h-16" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed rounded-lg p-10 text-center">
          <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No organizations yet — partner orgs you serve will appear here.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {filtered.map((r) => (
            <div key={r.org_id} className="p-3 sm:p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-[#B91C1C]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{r.org_name}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {r.visit_count} visit{r.visit_count === 1 ? '' : 's'} ·
                  Last {r.last_visit_date ? formatDistanceToNow(new Date(r.last_visit_date), { addSuffix: true }) : '—'}
                </p>
              </div>
              {r.upcoming_count > 0 && (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] flex-shrink-0">
                  {r.upcoming_count} upcoming
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrganizationsSection;
