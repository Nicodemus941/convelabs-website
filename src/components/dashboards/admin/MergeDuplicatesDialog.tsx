import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Combine, ArrowRight, Loader2 } from 'lucide-react';

/**
 * MergeDuplicatesDialog — scans for near-match orgs and lets admin
 * merge A into B. Uses find_duplicate_orgs() and merge_organizations() RPCs.
 *
 * Triggered from a button in the Discovered tab header. Only shows when
 * at least one dupe pair exists.
 */
interface Pair {
  org_a_id: string;
  org_a_name: string;
  org_b_id: string;
  org_b_name: string;
  similarity_reason: string;
}
interface Props {
  open: boolean;
  onClose: () => void;
  onMerged?: () => void;
}

const MergeDuplicatesDialog: React.FC<Props> = ({ open, onClose, onMerged }) => {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.rpc('find_duplicate_orgs' as any).then(({ data }) => {
      const rows = (data as Pair[]) || [];
      // De-dup: only keep one direction per pair (A→B but not B→A)
      const seen = new Set<string>();
      const unique: Pair[] = [];
      for (const p of rows) {
        const key = [p.org_a_id, p.org_b_id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(p);
      }
      setPairs(unique);
      setLoading(false);
    });
  }, [open]);

  const doMerge = async (src: string, dst: string) => {
    const key = `${src}|${dst}`;
    setMergingKey(key);
    try {
      const { data, error } = await supabase.rpc('merge_organizations' as any, {
        p_src_id: src, p_dst_id: dst,
      });
      if (error) throw error;
      toast.success(`Merged. Moved ${(data as any)?.moved_appts || 0} appointments.`);
      setPairs(prev => prev.filter(p => !(p.org_a_id === src && p.org_b_id === dst) && !(p.org_b_id === src && p.org_a_id === dst)));
      onMerged?.();
    } catch (e: any) {
      toast.error(e?.message || 'Merge failed');
    } finally {
      setMergingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Combine className="h-5 w-5" /> Merge duplicate practices</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Practices that look like potential duplicates. Pick which direction to merge — the source's appointments move to the destination, and the source is marked merged.
          </p>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Scanning…</div>
          ) : pairs.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-semibold text-sm">No duplicates found</p>
              <p className="text-xs text-muted-foreground mt-1">Your discovered org list is clean. This check runs on name prefix + zip code.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {pairs.map((p, i) => {
                const keyAB = `${p.org_a_id}|${p.org_b_id}`;
                const keyBA = `${p.org_b_id}|${p.org_a_id}`;
                return (
                  <div key={i} className="border rounded-lg p-3 bg-gray-50">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold mb-1">{p.similarity_reason}</p>
                    <div className="space-y-1 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2 sm:space-y-0">
                      <div className="text-sm font-medium truncate">{p.org_a_name}</div>
                      <ArrowRight className="h-4 w-4 text-gray-400 rotate-90 sm:rotate-0 mx-auto sm:mx-0" />
                      <div className="text-sm font-medium truncate">{p.org_b_name}</div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 mt-2">
                      <Button size="sm" variant="outline" className="text-xs flex-1" disabled={mergingKey === keyAB} onClick={() => doMerge(p.org_a_id, p.org_b_id)}>
                        {mergingKey === keyAB ? 'Merging…' : `Keep "${p.org_b_name.substring(0, 20)}${p.org_b_name.length > 20 ? '…' : ''}"`}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs flex-1" disabled={mergingKey === keyBA} onClick={() => doMerge(p.org_b_id, p.org_a_id)}>
                        {mergingKey === keyBA ? 'Merging…' : `Keep "${p.org_a_name.substring(0, 20)}${p.org_a_name.length > 20 ? '…' : ''}"`}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MergeDuplicatesDialog;
