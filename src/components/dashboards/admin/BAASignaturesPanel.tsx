import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FileSignature, Search, Eye, Download, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';

/**
 * Admin view of all Business Associate Agreement signatures across every
 * provider org. Compliance log — searchable, viewable, downloadable.
 */

interface Signature {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  signer_full_name: string;
  signer_email: string;
  signer_title: string | null;
  signed_at: string;
  ip_address: string | null;
  baa_version: string;
  organization_name: string | null;
}

const BAASignaturesPanel: React.FC = () => {
  const [rows, setRows] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('v_active_baa_signatures')
        .select('*')
        .order('signed_at', { ascending: false });
      setRows((data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  const openFull = async (id: string) => {
    setSelectedLoading(true);
    const { data } = await supabase.from('baa_signatures').select('*').eq('id', id).maybeSingle();
    setSelected(data);
    setSelectedLoading(false);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter(r => [r.signer_full_name, r.signer_email, r.organization_name, r.baa_version].filter(Boolean).some(v => (v as string).toLowerCase().includes(q)))
    : rows;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-[#B91C1C]" /> BAA Signatures
        </CardTitle>
        <CardDescription className="text-xs">
          {rows.length} active signatures · HIPAA compliance log (all organizations)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search by signer name, email, org, or version" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No signatures yet. The modal fires automatically for providers on first dashboard load.</p>
        ) : (
          <div className="border rounded-lg divide-y max-h-[60vh] overflow-y-auto">
            {filtered.map(r => (
              <div key={r.id} className="p-3 flex items-center justify-between gap-2 hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-900 truncate">{r.signer_full_name}</span>
                    {r.signer_title && <span className="text-[11px] text-gray-500">· {r.signer_title}</span>}
                    <Badge variant="outline" className="text-[10px]">{r.baa_version}</Badge>
                  </div>
                  <p className="text-[11px] text-gray-600 truncate mt-0.5">
                    {r.organization_name || 'No org'} · {r.signer_email} · signed {format(new Date(r.signed_at), 'PPp')}
                    {r.ip_address && <> · {r.ip_address}</>}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openFull(r.id)}>
                  <Eye className="h-3.5 w-3.5" /> View
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Full-text viewer modal */}
      <Dialog open={!!selected || selectedLoading} onOpenChange={(v) => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-5 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-[#B91C1C]" />
              {selected ? `${selected.signer_full_name}'s signed BAA` : 'Loading signature…'}
            </DialogTitle>
            {selected && (
              <p className="text-[11px] text-gray-500 mt-1">
                Version {selected.baa_version} · signed {format(new Date(selected.signed_at), 'PPPp')} · IP {selected.ip_address || '—'}
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 prose prose-sm max-w-none">
            {selected && <ReactMarkdown>{selected.baa_text}</ReactMarkdown>}
          </div>
          {selected && (
            <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
              <div className="text-xs">
                <p><strong>Electronic signature:</strong> {selected.signer_full_name}</p>
                <p className="text-gray-600">{selected.signer_email} · {format(new Date(selected.signed_at), 'PPp')}</p>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                const blob = new Blob([selected.baa_text + `\n\n---\nElectronic Signature: ${selected.signer_full_name}\nEmail: ${selected.signer_email}\nSigned: ${selected.signed_at}\nIP: ${selected.ip_address || 'unknown'}\nVersion: ${selected.baa_version}\n`], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `baa-${selected.signer_full_name.replace(/\s+/g, '-')}-${selected.signed_at.substring(0, 10)}.md`;
                a.click();
                URL.revokeObjectURL(url);
              }}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default BAASignaturesPanel;
