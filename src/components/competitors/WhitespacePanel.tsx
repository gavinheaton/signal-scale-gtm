import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, ArrowRight, LayoutGrid, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  CompetitiveWhitespace, WhitespaceKind, WHITESPACE_LABELS,
  Competitor, CompetitorDimension, CompetitorScore,
} from '@/types/competitors';
import { WhitespaceChart } from './WhitespaceChart';

interface Props { projectId: string; confirmedCount: number }

const KIND_ORDER: WhitespaceKind[] = ['counter_position', 'unowned', 'commoditised'];
const KIND_STYLE: Record<WhitespaceKind, string> = {
  counter_position: 'bg-primary/10 text-primary',
  unowned: 'bg-emerald-100 text-emerald-800',
  commoditised: 'bg-amber-100 text-amber-800',
};

export function WhitespacePanel({ projectId, confirmedCount }: Props) {
  const [items, setItems] = useState<CompetitiveWhitespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [dimensions, setDimensions] = useState<CompetitorDimension[]>([]);
  const [scores, setScores] = useState<CompetitorScore[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [w, c, d, s] = await Promise.all([
      (supabase as any).from('competitive_whitespace').select('*').eq('project_id', projectId)
        .order('created_at', { ascending: true }),
      (supabase as any).from('competitors').select('*').eq('project_id', projectId).eq('status', 'confirmed').order('name'),
      (supabase as any).from('competitor_dimensions').select('*').eq('project_id', projectId).order('position'),
      (supabase as any).from('competitor_scores').select('*').eq('project_id', projectId),
    ]);
    setItems((w.data || []) as CompetitiveWhitespace[]);
    setCompetitors((c.data || []) as Competitor[]);
    setDimensions((d.data || []) as CompetitorDimension[]);
    setScores((s.data || []) as CompetitorScore[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function findGaps() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('competitor-whitespace', {
        body: { project_id: projectId, mode: 'whitespace' },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Gaps refreshed');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Could not analyse the gaps');
    } finally {
      setRunning(false);
    }
  }

  async function markApplied(item: CompetitiveWhitespace, target: string) {
    const applied = [...(item.applied_to || []), { target, at: new Date().toISOString() }];
    await (supabase as any).from('competitive_whitespace').update({ applied_to: applied }).eq('id', item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, applied_to: applied } : i)));
  }

  async function sendToValueProp(item: CompetitiveWhitespace) {
    setBusyId(item.id);
    try {
      const { data: vps } = await (supabase as any)
        .from('value_propositions').select('id, fields, is_primary')
        .eq('project_id', projectId)
        .order('is_primary', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1);
      const vp = (vps || [])[0];
      if (!vp) throw new Error('Create a value proposition first, then send this angle across.');

      const fields = { ...(vp.fields || {}), unlike: item.title };
      const { error: upErr } = await (supabase as any)
        .from('value_propositions').update({ fields }).eq('id', vp.id);
      if (upErr) throw upErr;

      const { error: varErr } = await (supabase as any).from('value_prop_variations').insert({
        project_id: projectId,
        value_prop_id: vp.id,
        label: 'Counter-position',
        angle: 'Competitive whitespace',
        statement: item.title,
      });
      if (varErr) throw varErr;

      await markApplied(item, 'value_prop');
      toast.success('Sent to your value proposition as a contrast and a saved variation.');
    } catch (e: any) {
      toast.error(e.message || 'Could not send to the value proposition');
    } finally {
      setBusyId(null);
    }
  }

  async function sendToCanvas(item: CompetitiveWhitespace) {
    setBusyId(item.id);
    try {
      const { data: canvases } = await (supabase as any)
        .from('canvases').select('id, variant').eq('project_id', projectId);
      if (!canvases || canvases.length === 0) {
        throw new Error('Open the Canvas page once to create your canvases, then send this across.');
      }
      const rows = canvases.map((c: any) => ({
        canvas_id: c.id,
        box: 'unfair_advantage',
        content: item.title,
        status: 'pending',
      }));
      const { error } = await (supabase as any).from('canvas_suggestions').insert(rows);
      if (error) throw error;
      await markApplied(item, 'canvas');
      toast.success('Added to your canvases as a suggestion in Unfair Advantage.');
    } catch (e: any) {
      toast.error(e.message || 'Could not send to the canvas');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Reads your confirmed competitors and the comparison grid, then names what nobody owns,
          what everybody claims, and the angles that are yours to take.
        </p>
        <Button size="sm" onClick={findGaps} disabled={running || confirmedCount === 0}>
          {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Find the gaps
        </Button>
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {confirmedCount === 0
            ? 'Confirm at least one competitor, fill in the grid, then come back and find the gaps.'
            : 'No analysis yet. Press "Find the gaps".'}
        </CardContent></Card>
      ) : (
        KIND_ORDER.filter((k) => items.some((i) => i.kind === k)).map((kind) => (
          <div key={kind} className="space-y-2">
            <h3 className="text-sm font-semibold text-[#e33e23] uppercase tracking-wide">{WHITESPACE_LABELS[kind]}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {items.filter((i) => i.kind === kind).map((item) => {
                const appliedTargets = (item.applied_to || []).map((a) => a.target);
                return (
                  <Card key={item.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm leading-snug">{item.title}</CardTitle>
                        <Badge className={KIND_STYLE[item.kind]}>{WHITESPACE_LABELS[item.kind]}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {item.rationale && <p className="text-sm text-muted-foreground">{item.rationale}</p>}
                      {item.evidence?.length > 0 && (
                        <p className="text-xs text-muted-foreground">Drawn from: {item.evidence.join(', ')}</p>
                      )}
                      {kind === 'counter_position' && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" disabled={busyId === item.id}
                            onClick={() => sendToValueProp(item)}>
                            {appliedTargets.includes('value_prop') ? <Check className="h-3.5 w-3.5 mr-1" /> : <ArrowRight className="h-3.5 w-3.5 mr-1" />}
                            Send to value prop
                          </Button>
                          <Button size="sm" variant="outline" disabled={busyId === item.id}
                            onClick={() => sendToCanvas(item)}>
                            {appliedTargets.includes('canvas') ? <Check className="h-3.5 w-3.5 mr-1" /> : <LayoutGrid className="h-3.5 w-3.5 mr-1" />}
                            Send to canvas
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
