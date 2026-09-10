import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Swords, Sparkles, Loader2, Plus, Check, X, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Competitor, CompetitorRun, TYPE_BADGE, TYPE_LABELS } from '@/types/competitors';
import { CompetitorProfileDrawer } from '@/components/competitors/CompetitorProfileDrawer';
import { ComparisonGrid } from '@/components/competitors/ComparisonGrid';
import { WhitespacePanel } from '@/components/competitors/WhitespacePanel';

export default function CompetitiveLandscape() {
  const { currentProject } = useProject();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Competitor | null>(null);
  const [newName, setNewName] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);
  const pollRef = useRef<number | null>(null);

  const projectId = currentProject?.id;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('competitors').select('*').eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (error) toast.error(error.message);
    setCompetitors((data || []) as Competitor[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  function pollRun(runId: string, onDone: (run: CompetitorRun) => void) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const { data } = await (supabase as any).from('competitor_runs').select('*').eq('id', runId).maybeSingle();
      const run = data as CompetitorRun | null;
      if (!run || run.status === 'running') return;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      onDone(run);
    }, 3000);
  }

  async function findCompetitors() {
    if (!projectId) return;
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke('competitor-discover', { body: { project_id: projectId } });
      if (error) throw new Error((data as any)?.error || error.message);
      const runId = (data as any)?.run_id;
      if (!runId) throw new Error((data as any)?.error || 'Could not start the research');
      toast.info('Researching your competitive set — this takes up to a minute.');
      pollRun(runId, (run) => {
        setDiscovering(false);
        if (run.status === 'error') { toast.error(run.error || 'Research failed'); return; }
        toast.success(run.saved_count > 0 ? `${run.saved_count} competitors proposed for your review.` : 'No new competitors found.');
        load();
      });
    } catch (e: any) {
      setDiscovering(false);
      toast.error(e.message || 'Could not start the research');
    }
  }

  async function research(c: Competitor) {
    setEnrichingId(c.id);
    try {
      const { data, error } = await supabase.functions.invoke('competitor-enrich', { body: { competitor_id: c.id } });
      if (error) throw new Error((data as any)?.error || error.message);
      const runId = (data as any)?.run_id;
      if (!runId) throw new Error((data as any)?.error || 'Could not start the research');
      pollRun(runId, async (run) => {
        setEnrichingId(null);
        if (run.status === 'error') { toast.error(run.error || 'Research failed'); return; }
        toast.success(`${c.name} profile updated.`);
        const { data: fresh } = await (supabase as any).from('competitors').select('*').eq('id', c.id).maybeSingle();
        if (fresh) {
          setCompetitors((prev) => prev.map((x) => (x.id === c.id ? (fresh as Competitor) : x)));
          setSelected((cur) => (cur?.id === c.id ? (fresh as Competitor) : cur));
        }
      });
    } catch (e: any) {
      setEnrichingId(null);
      toast.error(e.message || 'Could not start the research');
    }
  }

  async function setStatus(c: Competitor, status: Competitor['status']) {
    const { error } = await (supabase as any).from('competitors').update({ status }).eq('id', c.id);
    if (error) { toast.error(error.message); return; }
    setCompetitors((prev) => prev.map((x) => (x.id === c.id ? { ...x, status } : x)));
    if (status === 'confirmed' && !c.researched_at && (c.type === 'direct' || c.type === 'adjacent')) {
      research({ ...c, status });
    }
  }

  async function addManual() {
    if (!projectId || !newName.trim()) return;
    const { data, error } = await (supabase as any).from('competitors')
      .insert({ project_id: projectId, name: newName.trim(), status: 'confirmed', type: 'direct' })
      .select('*').single();
    if (error) { toast.error(error.message); return; }
    setNewName('');
    setCompetitors((prev) => [...prev, data as Competitor]);
    research(data as Competitor);
  }

  if (!currentProject) {
    return <div className="p-6 text-muted-foreground">Select a project to view its competitive landscape.</div>;
  }

  const suggested = competitors.filter((c) => c.status === 'suggested');
  const confirmed = competitors.filter((c) => c.status === 'confirmed');
  const dismissed = competitors.filter((c) => c.status === 'dismissed');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Swords className="h-6 w-6 text-primary" />
            Competitive Landscape
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Phase 4 · Who your buyers weigh you against, how you compare on what matters to them,
            and the ground nobody has claimed yet.
          </p>
        </div>
        <Button onClick={findCompetitors} disabled={discovering}>
          {discovering ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Find competitors
        </Button>
      </div>

      <Tabs defaultValue="profiles">
        <TabsList>
          <TabsTrigger value="profiles">Profiles {confirmed.length > 0 && `(${confirmed.length})`}</TabsTrigger>
          <TabsTrigger value="grid">Comparison grid</TabsTrigger>
          <TabsTrigger value="whitespace">Whitespace</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="mt-4 space-y-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {suggested.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-[#e33e23] uppercase tracking-wide">
                    Suggested — confirm or dismiss ({suggested.length})
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {suggested.map((c) => (
                      <Card key={c.id}>
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{c.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={TYPE_BADGE[c.type]}>{TYPE_LABELS[c.type]}</Badge>
                                {c.domain && (
                                  <a href={`https://${c.domain}`} target="_blank" rel="noreferrer"
                                    className="text-xs text-primary underline inline-flex items-center gap-1">
                                    {c.domain} <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => setStatus(c, 'confirmed')}>
                                <Check className="h-4 w-4 mr-1" /> Confirm
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setStatus(c, 'dismissed')} aria-label="Dismiss">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {c.why_suggested && <p className="text-sm text-muted-foreground mt-2">{c.why_suggested}</p>}
                          <button className="text-xs text-primary underline mt-2" onClick={() => setSelected(c)}>Edit details</button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Your landscape ({confirmed.length})
                  </h2>
                  <div className="flex items-center gap-1">
                    <Input className="h-9 w-56" placeholder="Add a competitor by name" value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addManual()} />
                    <Button size="sm" variant="ghost" onClick={addManual}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>

                {confirmed.length === 0 ? (
                  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Nothing confirmed yet. Press “Find competitors” for a proposed shortlist, or add one by name.
                  </CardContent></Card>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {confirmed.map((c) => (
                      <Card key={c.id}
                        className={`cursor-pointer hover:shadow-md transition-shadow ${enrichingId === c.id ? 'ring-2 ring-primary animate-pulse' : ''}`}
                        onClick={() => setSelected(c)}>
                        <CardContent className="py-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium truncate">{c.name}</p>
                            <Badge className={TYPE_BADGE[c.type]}>{TYPE_LABELS[c.type]}</Badge>
                          </div>
                          {c.positioning
                            ? <p className="text-sm text-muted-foreground line-clamp-3">{c.positioning}</p>
                            : <p className="text-sm text-muted-foreground italic">
                                {enrichingId === c.id ? 'Researching…' : 'Not researched yet'}
                              </p>}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {c.claims?.length > 0 && <span>{c.claims.length} claims</span>}
                            {c.proof_points?.length > 0 && <span>{c.proof_points.length} proof points</span>}
                            {c.weaknesses?.length > 0 && <span>{c.weaknesses.length} weaknesses</span>}
                          </div>
                          {!c.researched_at && enrichingId !== c.id && (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); research(c); }}>
                              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Research
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {dismissed.length > 0 && (
                <div>
                  <button className="text-xs text-muted-foreground underline"
                    onClick={() => setShowDismissed((v) => !v)}>
                    {showDismissed ? 'Hide' : 'Show'} dismissed ({dismissed.length})
                  </button>
                  {showDismissed && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dismissed.map((c) => (
                        <button key={c.id} onClick={() => setStatus(c, 'suggested')}
                          className="text-xs border rounded-full px-3 py-1 hover:bg-muted">
                          {c.name} · restore
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="grid" className="mt-4">
          <ComparisonGrid projectId={currentProject.id} competitors={confirmed} />
        </TabsContent>

        <TabsContent value="whitespace" className="mt-4">
          <WhitespacePanel projectId={currentProject.id} confirmedCount={confirmed.length} />
        </TabsContent>
      </Tabs>

      <CompetitorProfileDrawer
        competitor={selected}
        onClose={() => setSelected(null)}
        onChanged={load}
        onResearch={research}
        researching={enrichingId === selected?.id}
      />
    </div>
  );
}
