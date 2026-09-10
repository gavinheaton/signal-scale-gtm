import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Sparkles, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  Competitor, CompetitorDimension, CompetitorScore, CompetitorRating, RATING_BADGE, RATING_LABELS,
  ARCHETYPE_LABELS, ARCHETYPE_ORDER,
} from '@/types/competitors';

interface Props { projectId: string; competitors: Competitor[] }

const RATINGS: CompetitorRating[] = ['strong', 'parity', 'weak'];

export function ComparisonGrid({ projectId, competitors }: Props) {
  const [dims, setDims] = useState<CompetitorDimension[]>([]);
  const [scores, setScores] = useState<CompetitorScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [d, s] = await Promise.all([
      (supabase as any).from('competitor_dimensions').select('*').eq('project_id', projectId).order('position'),
      (supabase as any).from('competitor_scores').select('*').eq('project_id', projectId),
    ]);
    setDims((d.data || []) as CompetitorDimension[]);
    setScores((s.data || []) as CompetitorScore[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const cell = (dimId: string, compId: string | null) =>
    scores.find((s) => s.dimension_id === dimId && (s.competitor_id ?? null) === compId);

  async function upsertCell(dimId: string, compId: string | null, patch: Partial<CompetitorScore>) {
    const existing = cell(dimId, compId);
    if (existing) {
      setScores((prev) => prev.map((s) => (s.id === existing.id ? { ...s, ...patch } : s)));
      const { error } = await (supabase as any).from('competitor_scores').update(patch).eq('id', existing.id);
      if (error) toast.error(error.message);
    } else {
      const row = { project_id: projectId, dimension_id: dimId, competitor_id: compId, claim: null, rating: null, ...patch };
      const { data, error } = await (supabase as any).from('competitor_scores').insert(row).select('*').single();
      if (error) { toast.error(error.message); return; }
      setScores((prev) => [...prev, data as CompetitorScore]);
    }
  }

  async function suggestDimensions() {
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('competitor-whitespace', {
        body: { project_id: projectId, mode: 'dimensions' },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Dimensions added — edit any of them to suit your buyers.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Could not suggest dimensions');
    } finally {
      setSuggesting(false);
    }
  }

  async function mapFromResearch() {
    if (dims.length === 0) { toast.error('Add some dimensions first.'); return; }
    setMapping(true);
    setMapped(0);
    try {
      const { data, error } = await supabase.functions.invoke('competitor-whitespace', {
        body: { project_id: projectId, mode: 'map_grid', overwrite },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const runId = (data as any)?.run_id;
      if (!runId) throw new Error('Could not start mapping');

      const started = Date.now();
      const timer = window.setInterval(async () => {
        const { data: run } = await (supabase as any)
          .from('competitor_runs').select('*').eq('id', runId).maybeSingle();
        if (run?.saved_count != null) setMapped(run.saved_count);
        if (run) await refreshScores();
        if (run?.status === 'complete' || run?.status === 'error' || Date.now() - started > 5 * 60 * 1000) {
          window.clearInterval(timer);
          if (pollRef.current === timer) pollRef.current = null;
          setMapping(false);
          await load();
          if (run?.status === 'error') toast.error(run.error || 'Mapping stopped early — anything already filled is saved.');
          else toast.success(`Grid mapped — ${run?.saved_count ?? 0} cells filled from the research.`);
        }
      }, 4000);
      pollRef.current = timer;
    } catch (e: any) {
      toast.error(e.message || 'Could not map the grid');
      setMapping(false);
    }
  }


  async function addDimension() {
    if (!newLabel.trim()) return;
    const { data, error } = await (supabase as any).from('competitor_dimensions')
      .insert({ project_id: projectId, label: newLabel.trim(), position: dims.length })
      .select('*').single();
    if (error) { toast.error(error.message); return; }
    setDims((prev) => [...prev, data as CompetitorDimension]);
    setNewLabel('');
  }

  async function renameDimension(id: string, label: string) {
    setDims((prev) => prev.map((d) => (d.id === id ? { ...d, label } : d)));
    await (supabase as any).from('competitor_dimensions').update({ label }).eq('id', id);
  }

  async function setImportance(id: string, importance: number) {
    setDims((prev) => prev.map((d) => (d.id === id ? { ...d, importance } : d)));
    await (supabase as any).from('competitor_dimensions').update({ importance }).eq('id', id);
  }

  async function removeDimension(id: string) {
    const { error } = await (supabase as any).from('competitor_dimensions').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setDims((prev) => prev.filter((d) => d.id !== id));
    setScores((prev) => prev.filter((s) => s.dimension_id !== id));
  }

  async function move(id: string, dir: -1 | 1) {
    const i = dims.findIndex((d) => d.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= dims.length) return;
    const next = [...dims];
    [next[i], next[j]] = [next[j], next[i]];
    setDims(next);
    await Promise.all(next.map((d, idx) => (supabase as any).from('competitor_dimensions').update({ position: idx }).eq('id', d.id)));
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading grid…</div>;
  }

  const ordered = [...competitors].sort(
    (a, b) => ARCHETYPE_ORDER.indexOf(a.archetype || 'other') - ARCHETYPE_ORDER.indexOf(b.archetype || 'other'),
  );
  const columns: { id: string | null; name: string; archetype: string | null }[] = [
    { id: null, name: 'Us', archetype: null },
    ...ordered.map((c) => ({
      id: c.id,
      name: c.name,
      archetype: c.archetype ? ARCHETYPE_LABELS[c.archetype] : null,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={suggestDimensions} disabled={suggesting}>
          {suggesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Suggest dimensions
        </Button>
        <div className="flex items-center gap-1">
          <Input className="h-9 w-56" placeholder="Add your own dimension" value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDimension()} />
          <Button size="sm" variant="ghost" onClick={addDimension}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>

      {competitors.length === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Confirm a competitor first — the grid compares you against your confirmed list.
        </CardContent></Card>
      )}

      {dims.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No dimensions yet. Let the AI suggest a starting set, or add your own.
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto border rounded-md bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left p-2 min-w-[220px] font-medium">Dimension</th>
                {columns.map((c) => (
                  <th key={c.id ?? 'us'} className={`text-left p-2 min-w-[200px] font-medium ${c.id === null ? 'text-primary' : ''}`}>
                    {c.name}
                    {c.archetype && (
                      <span className="block text-xs font-normal text-muted-foreground">{c.archetype}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dims.map((d, i) => (
                <tr key={d.id} className="border-b align-top">
                  <td className="p-2">
                    <div className="flex items-start gap-1">
                      <Input className="h-8 text-sm" value={d.label}
                        onChange={(e) => renameDimension(d.id, e.target.value)} />
                      <div className="flex flex-col">
                        <button className="text-muted-foreground hover:text-foreground" onClick={() => move(d.id, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-3 w-3" /></button>
                        <button className="text-muted-foreground hover:text-foreground" onClick={() => move(d.id, 1)} disabled={i === dims.length - 1} aria-label="Move down"><ArrowDown className="h-3 w-3" /></button>
                      </div>
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => removeDimension(d.id)} aria-label="Remove dimension"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Matters</span>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setImportance(d.id, n)}
                          aria-label={`Importance ${n} of 5`}
                          className={`h-2.5 w-2.5 rounded-full border ${
                            n <= (d.importance ?? 3) ? 'bg-primary border-primary' : 'border-border'
                          }`} />
                      ))}
                    </div>
                    {d.description && <p className="text-[11px] text-muted-foreground mt-1">{d.description}</p>}
                  </td>
                  {columns.map((c) => {
                    const sc = cell(d.id, c.id);
                    return (
                      <td key={(c.id ?? 'us') + d.id} className="p-2">
                        <Input className="h-8 text-sm mb-1" placeholder="Short claim"
                          defaultValue={sc?.claim || ''}
                          onBlur={(e) => {
                            if ((sc?.claim || '') !== e.target.value) upsertCell(d.id, c.id, { claim: e.target.value });
                          }} />
                        <div className="flex gap-1">
                          {RATINGS.map((r) => (
                            <button key={r}
                              onClick={() => upsertCell(d.id, c.id, { rating: sc?.rating === r ? null : r })}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                sc?.rating === r ? RATING_BADGE[r] : 'border-border text-muted-foreground hover:bg-muted'
                              }`}
                            >{RATING_LABELS[r]}</button>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
