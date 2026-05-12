/**
 * NewUpdatesTab — Hormozi-structured "What's New" log.
 *
 * Source of truth: src/data/releaseNotes.ts (newest first). Each shipped
 * customer-facing change adds an entry there.
 *
 * UX rules:
 *   - Newest at top, always.
 *   - Filter by category (feature / fix / polish / safety).
 *   - Search across title + body.
 *   - Card-per-entry: 1-line headline + collapsible detail with how-to + link.
 *   - "Mark all read" stamps localStorage so the sidebar badge clears.
 *   - Unread items get an emerald-pulsing "NEW" pill.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Sparkles, Search, Filter, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, Zap, Wrench, Shield, Palette,
} from 'lucide-react';
import {
  RELEASE_NOTES, ReleaseCategory, ReleaseNote, markAllReleasesAsRead,
} from '@/data/releaseNotes';

type FilterKey = 'all' | ReleaseCategory;

const CAT_META: Record<ReleaseCategory, { label: string; icon: React.ElementType; color: string }> = {
  feature: { label: 'New features', icon: Zap, color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  fix:     { label: 'Fixes',         icon: Wrench, color: 'bg-blue-50 text-blue-700 border-blue-300' },
  polish:  { label: 'Polish',        icon: Palette, color: 'bg-purple-50 text-purple-700 border-purple-300' },
  safety:  { label: 'Safety',        icon: Shield, color: 'bg-amber-50 text-amber-700 border-amber-300' },
};

const NewUpdatesTab: React.FC = () => {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Date | null>(() => {
    try {
      const raw = localStorage.getItem('convelabs_release_notes_last_seen');
      return raw ? new Date(raw) : null;
    } catch { return null; }
  });

  // Stamp last_seen the moment the tab loads so the badge clears.
  // We capture the *previous* timestamp so we can still show "NEW" pills
  // on items the user hasn't actually scrolled to yet — they decay on
  // next visit, not this one.
  useEffect(() => {
    markAllReleasesAsRead();
  }, []);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: RELEASE_NOTES.length, feature: 0, fix: 0, polish: 0, safety: 0 };
    for (const r of RELEASE_NOTES) c[r.category]++;
    return c;
  }, []);

  const unreadCount = useMemo(() => {
    if (!lastSeen) return RELEASE_NOTES.length;
    return RELEASE_NOTES.filter(r => new Date(r.date) > lastSeen).length;
  }, [lastSeen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return RELEASE_NOTES.filter(r =>
      (filter === 'all' || r.category === filter) &&
      (q === '' ||
        r.title.toLowerCase().includes(q) ||
        r.oneLine.toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q) ||
        r.whatChanged.some(b => b.toLowerCase().includes(q))
      )
    );
  }, [filter, search]);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const expandAll = () => setExpanded(new Set(filtered.map(r => r.id)));
  const collapseAll = () => setExpanded(new Set());

  const isUnread = (note: ReleaseNote) => lastSeen ? new Date(note.date) > lastSeen : true;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* HERO */}
      <Card className="border-2 border-[#B91C1C]/20 bg-gradient-to-br from-red-50/40 via-white to-purple-50/30 shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold flex items-center gap-2 text-gray-900">
                <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-[#B91C1C]" />
                What's New
                {unreadCount > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px] animate-pulse">
                    {unreadCount} new
                  </Badge>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                Every shipped feature, fix, and polish — newest first. Latest update: <strong>{RELEASE_NOTES[0]?.date || '—'}</strong>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => expanded.size === 0 ? expandAll() : collapseAll()} className="gap-1.5 text-xs h-9 sm:h-8">
                {expanded.size === 0 ? 'Expand all' : 'Collapse all'}
              </Button>
            </div>
          </div>

          {/* Category filter pills */}
          <div className="-mx-3 sm:mx-0 px-3 sm:px-0 mt-3 sm:mt-4 overflow-x-auto sm:overflow-visible scroll-smooth snap-x snap-mandatory">
            <div className="grid grid-flow-col auto-cols-[28%] sm:auto-cols-auto sm:grid-cols-5 sm:grid-flow-row gap-2 pb-1 sm:pb-0">
              {(['all', 'feature', 'fix', 'polish', 'safety'] as FilterKey[]).map(k => {
                const isActive = filter === k;
                const meta = k === 'all' ? null : CAT_META[k];
                const label = k === 'all' ? 'All' : meta!.label;
                const count = counts[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={`text-left rounded-lg border px-3 py-2 transition snap-start ${
                      isActive
                        ? 'ring-2 ring-[#B91C1C]/30 ' + (meta?.color || 'bg-gray-50 border-gray-200 text-gray-700')
                        : 'bg-white border-gray-200 hover:border-[#B91C1C]/40'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</p>
                    <p className="text-2xl sm:text-xl font-bold leading-tight mt-0.5">{count}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by feature, area, or keyword…"
          className="pl-9 h-10 text-sm"
        />
      </div>

      {/* Cards */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Sparkles className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-700">No matches.</p>
              <p className="text-xs text-gray-500 mt-1">Try a different filter or clear the search.</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map(note => {
            const isOpen = expanded.has(note.id);
            const unread = isUnread(note);
            const meta = CAT_META[note.category];
            const Icon = meta.icon;
            return (
              <Card key={note.id} className={`shadow-sm ${unread ? 'border-l-4 border-l-emerald-500' : ''}`}>
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => toggleExpand(note.id)}
                    className="w-full p-4 text-left hover:bg-gray-50 transition flex items-start gap-3"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`text-sm ${unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{note.title}</h3>
                        {unread && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[9px] uppercase tracking-wider">NEW</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">{note.area}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${meta.color}`}>{meta.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{note.oneLine}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{note.date}</p>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/50">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">What changed</p>
                        <ul className="space-y-1 text-xs text-gray-700">
                          {note.whatChanged.map((b, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600 flex-shrink-0 mt-0.5" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {note.howToUse && note.howToUse.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">How to use it</p>
                          <ol className="space-y-1 text-xs text-gray-700 list-decimal list-inside marker:text-[#B91C1C] marker:font-bold">
                            {note.howToUse.map((step, i) => <li key={i} className="leading-relaxed">{step}</li>)}
                          </ol>
                        </div>
                      )}

                      {(note.before || note.after) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {note.before && (
                            <div className="bg-red-50 border border-red-100 rounded-md p-2.5">
                              <p className="text-[10px] uppercase tracking-wider text-red-700 font-semibold mb-1">Before</p>
                              <p className="text-xs text-red-900">{note.before}</p>
                            </div>
                          )}
                          {note.after && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-md p-2.5">
                              <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">After</p>
                              <p className="text-xs text-emerald-900">{note.after}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {note.whereToFind && (
                        <div className="pt-1">
                          <Link
                            to={note.whereToFind.path}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C] hover:text-[#991B1B] hover:underline"
                          >
                            Open {note.whereToFind.label} <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Footer note */}
      <Card className="border-dashed border-gray-200 bg-gray-50/50">
        <CardContent className="p-3 text-center">
          <p className="text-[11px] text-gray-500">
            Showing {filtered.length} of {RELEASE_NOTES.length} updates. New ones land at the top automatically when shipped.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default NewUpdatesTab;
