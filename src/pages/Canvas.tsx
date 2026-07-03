import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Sparkles, FileText, ClipboardCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Canvas, CanvasEntry, STANDARD_BOXES, SHARED_VALUE_BOXES, BUSINESS_MODEL_BOXES, CanvasVariant } from '@/components/canvas/types';
import { CanvasBox } from '@/components/canvas/CanvasBox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ReactMarkdown from 'react-markdown';

export default function CanvasPage() {
  const { currentProject } = useProject();
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [entries, setEntries] = useState<CanvasEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [critiquing, setCritiquing] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [showNarrative, setShowNarrative] = useState(false);
  const [showCritique, setShowCritique] = useState(false);

  async function load() {
    if (!currentProject) return;
    setLoading(true);
    const { data } = await (supabase as any).from('canvases').select('*').eq('project_id', currentProject.id).maybeSingle();
    let c = data as Canvas | null;
    if (!c) {
      const ins = await (supabase as any).from('canvases').insert({ project_id: currentProject.id, variant: 'standard' }).select('*').single();
      c = ins.data as Canvas;
    }
    setCanvas(c);
    if (c) {
      const { data: er } = await (supabase as any).from('canvas_entries').select('*').eq('canvas_id', c.id).order('position');
      setEntries((er || []) as CanvasEntry[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentProject]);

  const boxes = canvas?.variant === 'shared_value' ? SHARED_VALUE_BOXES : canvas?.variant === 'business_model' ? BUSINESS_MODEL_BOXES : STANDARD_BOXES;
  const entriesByBox = useMemo(() => {
    const map: Record<string, CanvasEntry[]> = {};
    for (const e of entries) (map[e.box] = map[e.box] || []).push(e);
    return map;
  }, [entries]);

  const validationCoverage = useMemo(() => {
    const total = boxes.length;
    const validated = boxes.filter((b) => (entriesByBox[b.key] || []).some((e) => e.status === 'validated')).length;
    return { validated, total };
  }, [boxes, entriesByBox]);

  async function setVariant(variant: 'standard' | 'shared_value') {
    if (!canvas) return;
    await (supabase as any).from('canvases').update({ variant }).eq('id', canvas.id);
    setCanvas({ ...canvas, variant });
  }

  async function runSync() {
    if (!canvas) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('canvas-sync', { body: { canvas_id: canvas.id } });
      if (error) throw error;
      toast.success(`Synced ${(data as any)?.inserted || 0} entries from platform data`);
      await load();
    } catch (e: any) { toast.error(`Sync failed: ${e.message || e}`); }
    finally { setSyncing(false); }
  }

  async function runCritique() {
    if (!canvas) return;
    setCritiquing(true);
    try {
      const { data, error } = await supabase.functions.invoke('canvas-critique', { body: { canvas_id: canvas.id } });
      if (error) throw error;
      setCanvas({ ...canvas, critique: (data as any).critique, critique_generated_at: new Date().toISOString() });
      setShowCritique(true);
    } catch (e: any) { toast.error(`Critique failed: ${e.message || e}`); }
    finally { setCritiquing(false); }
  }

  async function runNarrative() {
    if (!canvas) return;
    setNarrating(true);
    try {
      const { data, error } = await supabase.functions.invoke('canvas-narrative', { body: { canvas_id: canvas.id } });
      if (error) throw error;
      setCanvas({ ...canvas, narrative_md: (data as any).narrative_md, narrative_generated_at: (data as any).narrative_generated_at });
      setShowNarrative(true);
    } catch (e: any) { toast.error(`Narrative failed: ${e.message || e}`); }
    finally { setNarrating(false); }
  }

  if (!currentProject) return <div className="p-8 text-muted-foreground">Select a project to view its canvas.</div>;
  if (loading || !canvas) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading canvas…</div>;

  const critique = canvas.critique as any;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between p-4 border-b bg-background gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Disruptors Canvas</h1>
          <p className="text-xs text-muted-foreground">
            Business model on a page · {validationCoverage.validated}/{validationCoverage.total} boxes have validated entries
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={canvas.variant} onValueChange={(v) => setVariant(v as any)}>
            <TabsList>
              <TabsTrigger value="standard">Standard</TabsTrigger>
              <TabsTrigger value="shared_value">Shared Value</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={runSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sync from data
          </Button>
          <Button size="sm" variant="outline" onClick={runCritique} disabled={critiquing}>
            {critiquing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-1" />}
            Critique
          </Button>
          <Button size="sm" onClick={runNarrative} disabled={narrating}>
            {narrating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            {canvas.narrative_md ? 'View narrative' : 'Generate narrative'}
          </Button>
          {canvas.narrative_md && !narrating && (
            <Button size="sm" variant="ghost" onClick={() => setShowNarrative(true)}>Open doc</Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 bg-muted/30">
        <div className={`grid gap-3 ${canvas.variant === 'shared_value' ? 'grid-cols-1 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-5'}`}>
          {boxes.map((b) => (
            <CanvasBox key={b.key} canvasId={canvas.id} boxKey={b.key} label={b.label} hint={b.hint}
              entries={entriesByBox[b.key] || []} onChange={load} />
          ))}
        </div>
      </div>

      <Sheet open={showNarrative} onOpenChange={setShowNarrative}>
        <SheetContent className="sm:max-w-3xl w-full overflow-auto">
          <SheetHeader>
            <SheetTitle>Expanded Business Model</SheetTitle>
            {canvas.narrative_generated_at && (
              <p className="text-xs text-muted-foreground">Generated {new Date(canvas.narrative_generated_at).toLocaleString()}</p>
            )}
          </SheetHeader>
          <div className="prose prose-sm max-w-none mt-4">
            {canvas.narrative_md ? <ReactMarkdown>{canvas.narrative_md}</ReactMarkdown> : <p className="text-muted-foreground">No narrative yet — click "Generate narrative".</p>}
          </div>
          <div className="mt-4">
            <Button size="sm" variant="outline" onClick={runNarrative} disabled={narrating}>
              {narrating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Regenerate
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showCritique} onOpenChange={setShowCritique}>
        <SheetContent className="sm:max-w-xl w-full overflow-auto">
          <SheetHeader>
            <SheetTitle>Canvas Critique</SheetTitle>
            {canvas.critique_generated_at && (
              <p className="text-xs text-muted-foreground">Generated {new Date(canvas.critique_generated_at).toLocaleString()}</p>
            )}
          </SheetHeader>
          {critique ? (
            <div className="space-y-4 mt-4 text-sm">
              {critique.summary && <div className="p-3 rounded bg-muted"><p>{critique.summary}</p></div>}
              {typeof critique.validation_coverage_pct === 'number' && (
                <div><p className="font-medium">Validation coverage: {critique.validation_coverage_pct}%</p></div>
              )}
              {critique.alignment_issues?.length > 0 && (
                <section>
                  <h3 className="font-semibold mb-1">Alignment issues</h3>
                  <ul className="space-y-2">
                    {critique.alignment_issues.map((i: any, k: number) => (
                      <li key={k} className="border-l-2 border-amber-400 pl-2">
                        <p className="text-xs uppercase text-muted-foreground">{(i.boxes || []).join(' ↔ ')}</p>
                        <p>{i.issue}</p>
                        {i.fix && <p className="text-xs text-purple-700 mt-0.5">Fix: {i.fix}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {critique.weak_boxes?.length > 0 && (
                <section>
                  <h3 className="font-semibold mb-1">Weak boxes</h3>
                  <ul className="space-y-1">
                    {critique.weak_boxes.map((w: any, k: number) => <li key={k}><span className="font-medium">{w.box}:</span> {w.issue}</li>)}
                  </ul>
                </section>
              )}
              {critique.gaps?.length > 0 && (
                <section>
                  <h3 className="font-semibold mb-1">Gaps</h3>
                  <ul className="space-y-1">
                    {critique.gaps.map((g: any, k: number) => <li key={k}><span className="font-medium">{g.box}:</span> {g.issue}</li>)}
                  </ul>
                </section>
              )}
            </div>
          ) : <p className="text-muted-foreground mt-4">No critique yet.</p>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
