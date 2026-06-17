import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ArrowLeft, ExternalLink, Loader2, Copy, Trash2, MessageSquareQuote, Target, Users, Sparkles, type LucideIcon } from 'lucide-react';

const DIMENSIONS: { key: 'voice' | 'icp' | 'persona' | 'clarity'; label: string; short: string; weight: string; icon: LucideIcon; color: string }[] = [
  { key: 'voice',   label: 'Voice',   short: 'V', weight: '30%', icon: MessageSquareQuote, color: '#8833ff' },
  { key: 'icp',     label: 'ICP',     short: 'I', weight: '30%', icon: Target,             color: '#0f284c' },
  { key: 'persona', label: 'Persona', short: 'P', weight: '25%', icon: Users,              color: '#e33e23' },
  { key: 'clarity', label: 'Clarity', short: 'C', weight: '15%', icon: Sparkles,           color: '#0ea5a4' },
];
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Run {
  id: string; scope: string; status: string; base_url: string;
  pages_total: number; pages_scored: number;
  headline_score: number | null; voice_score: number | null;
  icp_score: number | null; persona_score: number | null; clarity_score: number | null;
  created_at: string;
}
interface Page {
  id: string; url: string; title: string | null;
  page_status: 'on_brand' | 'drifting' | 'off_brand' | null;
  headline_score: number | null;
  voice_score: number | null; icp_score: number | null;
  persona_score: number | null; clarity_score: number | null;
  voice_reasoning: string | null; icp_reasoning: string | null;
  persona_reasoning: string | null; clarity_reasoning: string | null;
  suggested_rewrite: string | null;
  excerpt: string | null;
  scrape_error: string | null;
}

function scoreColor(s: number | null | undefined) {
  if (s == null) return 'text-muted-foreground';
  if (s >= 80) return 'text-green-600';
  if (s >= 60) return 'text-orange-600';
  return 'text-red-600';
}
const statusBadge: Record<string, string> = {
  on_brand: 'bg-green-100 text-green-800',
  drifting: 'bg-orange-100 text-orange-800',
  off_brand: 'bg-red-100 text-red-800',
};

export default function BrandAuditDetail({ runId }: { runId: string }) {
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'on_brand' | 'drifting' | 'off_brand'>('all');
  const [selected, setSelected] = useState<Page | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteRun() {
    setDeleting(true);
    try {
      const { error: pErr } = await supabase.from('brand_audit_pages').delete().eq('run_id', runId);
      if (pErr) throw pErr;
      const { error: rErr } = await supabase.from('brand_audit_runs').delete().eq('id', runId);
      if (rErr) throw rErr;
      toast.success('Audit deleted');
      navigate('/project/brand-audit');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete audit');
      setDeleting(false);
      setConfirmDel(false);
    }
  }

  useEffect(() => {
    void load();
  }, [runId]);

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: ps }] = await Promise.all([
      supabase.from('brand_audit_runs').select('*').eq('id', runId).maybeSingle(),
      supabase.from('brand_audit_pages').select('*').eq('run_id', runId).order('headline_score', { ascending: true }),
    ]);
    setRun(r as unknown as Run);
    setPages((ps ?? []) as unknown as Page[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return pages;
    return pages.filter(p => p.page_status === filter);
  }, [pages, filter]);

  const counts = useMemo(() => ({
    on_brand: pages.filter(p => p.page_status === 'on_brand').length,
    drifting: pages.filter(p => p.page_status === 'drifting').length,
    off_brand: pages.filter(p => p.page_status === 'off_brand').length,
  }), [pages]);

  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit…</div>;
  if (!run) return <div className="p-8">Audit not found.</div>;

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/project/brand-audit')} className="-ml-2 mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Audits
          </Button>
          <h1 className="text-2xl font-bold" style={{ color: '#0f284c' }}>Audit · {run.base_url || 'custom URLs'}</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(run.created_at), 'MMM d, yyyy HH:mm')} · {run.pages_scored}/{run.pages_total} pages scored</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfirmDel(true)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
      </div>

      <AlertDialog open={confirmDel} onOpenChange={(o) => !deleting && setConfirmDel(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this audit run?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the run and all its scored pages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void deleteRun(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className={`text-4xl font-bold ${scoreColor(run.headline_score)}`}>{run.headline_score ?? '—'}</div>
            <div className="text-xs text-muted-foreground mt-1">Headline</div>
          </CardContent>
        </Card>
        {DIMENSIONS.map((d) => {
          const v = run[`${d.key}_score` as keyof Run] as number | null;
          const Icon = d.icon;
          return (
            <Card key={d.key} style={{ borderTop: `3px solid ${d.color}` }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center h-7 w-7 rounded-full"
                    style={{ backgroundColor: `${d.color}1A`, color: d.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-medium" style={{ color: d.color }}>{d.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{d.weight}</span>
                </div>
                <div className={`text-3xl font-semibold mt-2 ${scoreColor(v)}`}>{v ?? '—'}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pages</CardTitle>
          <div className="flex gap-2 text-xs">
            {(['all', 'off_brand', 'drifting', 'on_brand'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-full border ${filter === f ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
              >
                {f === 'all' ? `All (${pages.length})` : `${f.replace('_', '-')} (${counts[f]})`}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full px-4 py-3 grid grid-cols-12 gap-2 items-center text-left hover:bg-muted/40"
              >
                <div className="col-span-6 min-w-0">
                  <div className="text-sm font-medium truncate">{p.title || p.url}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.url}</div>
                </div>
                <div className="col-span-2">
                  {p.scrape_error ? (
                    <Badge variant="destructive" className="text-xs">scrape failed</Badge>
                  ) : p.page_status ? (
                    <span className={`text-xs px-2 py-0.5 rounded ${statusBadge[p.page_status]}`}>{p.page_status.replace('_', '-')}</span>
                  ) : null}
                </div>
                <div className="col-span-3 grid grid-cols-4 gap-1 text-[10px]">
                  {DIMENSIONS.map((d) => {
                    const s = p[`${d.key}_score` as keyof Page] as number | null;
                    const Icon = d.icon;
                    return (
                      <div key={d.key} className="text-center">
                        <div className={`font-semibold text-sm ${scoreColor(s)}`}>{s ?? '—'}</div>
                        <div className="inline-flex items-center justify-center gap-0.5" style={{ color: d.color }}>
                          <Icon className="h-2.5 w-2.5" />
                          <span>{d.short}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={`col-span-1 text-right text-xl font-bold ${scoreColor(p.headline_score)}`}>{p.headline_score ?? '—'}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">No pages match this filter.</div>}
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{selected.title || selected.url}</SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  <a href={selected.url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                    {selected.url} <ExternalLink className="h-3 w-3" />
                  </a>
                </SheetDescription>
              </SheetHeader>

              {selected.scrape_error ? (
                <div className="mt-6 p-4 border border-red-200 bg-red-50 rounded text-sm">
                  <p className="font-medium">Scrape error</p>
                  <p className="text-muted-foreground mt-1">{selected.scrape_error}</p>
                </div>
              ) : (
                <div className="space-y-5 mt-6">
                  <div className="grid grid-cols-5 gap-2 text-center">
                    <div className="border rounded p-2">
                      <div className={`text-2xl font-bold ${scoreColor(selected.headline_score)}`}>{selected.headline_score}</div>
                      <div className="text-[10px] uppercase text-muted-foreground mt-1">Headline</div>
                    </div>
                    {[['Voice', selected.voice_score], ['ICP', selected.icp_score], ['Persona', selected.persona_score], ['Clarity', selected.clarity_score]].map(([l, v]) => (
                      <div key={l as string} className="border rounded p-2">
                        <div className={`text-lg font-semibold ${scoreColor(v as number | null)}`}>{v as number | null}</div>
                        <div className="text-[10px] uppercase text-muted-foreground mt-1">{l}</div>
                      </div>
                    ))}
                  </div>

                  {([
                    ['Voice', selected.voice_reasoning],
                    ['ICP fit', selected.icp_reasoning],
                    ['Persona fit', selected.persona_reasoning],
                    ['Clarity', selected.clarity_reasoning],
                  ] as const).map(([l, r]) => (
                    <div key={l}>
                      <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#e33e23' }}>{l}</div>
                      <p className="text-sm text-foreground/80 leading-relaxed">{r || '—'}</p>
                    </div>
                  ))}

                  {selected.suggested_rewrite && (
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8833ff' }}>Suggested rewrite</div>
                        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(selected.suggested_rewrite!); toast.success('Copied'); }}>
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{selected.suggested_rewrite}</p>
                    </div>
                  )}

                  {selected.excerpt && (
                    <div>
                      <div className="text-xs uppercase tracking-wider font-semibold mb-1 text-muted-foreground">Page excerpt</div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed border rounded p-3 max-h-40 overflow-y-auto">{selected.excerpt}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
