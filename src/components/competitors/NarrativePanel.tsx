import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Sparkles, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Competitor, CompetitiveNarrative, NarrativeSection } from '@/types/competitors';
import { downloadCompetitiveNarrativeDocx } from '@/lib/competitiveNarrativeDocx';

interface Props {
  projectId: string;
  projectName: string;
  competitors: Competitor[];
}

export function NarrativePanel({ projectId, projectName, competitors }: Props) {
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [narratives, setNarratives] = useState<CompetitiveNarrative[]>([]);
  const [personas, setPersonas] = useState<{ id: string; persona_name: string }[]>([]);
  const [lens, setLens] = useState<string>('all');
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [n, p] = await Promise.all([
      (supabase as any).from('competitive_narratives').select('*').eq('project_id', projectId),
      (supabase as any).from('personas').select('id, persona_name').eq('project_id', projectId).order('persona_name'),
    ]);
    setNarratives((n.data || []) as CompetitiveNarrative[]);
    setPersonas((p.data || []) as { id: string; persona_name: string }[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const current = narratives.find((n) => (n.persona_id ?? 'all') === lens) || null;
  const sections: NarrativeSection[] = (current?.sections || []) as NarrativeSection[];
  const personaName = lens === 'all' ? null : personas.find((p) => p.id === lens)?.persona_name || null;

  async function write() {
    setWriting(true);
    try {
      const { data, error } = await supabase.functions.invoke('competitor-narrative', {
        body: { project_id: projectId, persona_id: lens === 'all' ? null : lens },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const runId = (data as any)?.run_id;
      if (!runId) throw new Error('Could not start writing the narrative');

      const started = Date.now();
      const timer = window.setInterval(async () => {
        const { data: run } = await (supabase as any)
          .from('competitor_runs').select('*').eq('id', runId).maybeSingle();
        if (run?.status === 'complete' || run?.status === 'error' || Date.now() - started > 5 * 60 * 1000) {
          window.clearInterval(timer);
          if (pollRef.current === timer) pollRef.current = null;
          setWriting(false);
          await load();
          if (run?.status === 'error') toast.error(run.error || 'The narrative stopped early.');
          else if (run?.status === 'complete') toast.success('Narrative written.');
          else toast.error('The narrative is taking longer than expected. Try again.');
        }
      }, 4000);
      pollRef.current = timer;
    } catch (e: any) {
      toast.error(e.message || 'Could not write the narrative');
      setWriting(false);
    }
  }

  async function download() {
    try {
      await downloadCompetitiveNarrativeDocx({
        projectName,
        sections,
        competitors,
        personaName,
        generatedAt: current?.generated_at,
      });
    } catch (e: any) {
      toast.error(e.message || 'Could not build the Word document');
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          A written read of your landscape — who is in the field, how buyers compare you, where you sit,
          the ground nobody owns, and what to do next. Download it as a Word document to drop into a board pack.
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Seen through
            <select className="h-9 rounded-md border bg-background px-2 text-xs"
              value={lens} onChange={(e) => setLens(e.target.value)}>
              <option value="all">All personas</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.persona_name}</option>)}
            </select>
          </label>
          <Button size="sm" onClick={write} disabled={writing || competitors.length === 0}>
            {writing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {writing ? 'Writing…' : sections.length > 0 ? 'Rewrite narrative' : 'Write narrative'}
          </Button>
          <Button size="sm" variant="outline" onClick={download} disabled={sections.length === 0}>
            <FileText className="h-4 w-4 mr-1" /> Download Word
          </Button>
        </div>
      </div>

      {sections.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {competitors.length === 0
            ? 'Confirm at least one competitor, fill in the grid, then come back and write the narrative.'
            : lens === 'all'
              ? 'No narrative yet. Press "Write narrative".'
              : 'No narrative for this persona yet. Press "Write narrative".'}
        </CardContent></Card>
      ) : (
        <>
          {current?.generated_at && (
            <p className="text-xs text-muted-foreground">
              Written {new Date(current.generated_at).toLocaleString('en-AU')}
              {personaName ? ` · through ${personaName}` : ' · across all personas'}
            </p>
          )}
          <div className="space-y-4">
            {sections.map((s) => (
              <Card key={s.key}>
                <CardContent className="py-5 space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#e33e23]">{s.heading}</h3>
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed">{p}</p>
                  ))}
                  {s.bullets.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1.5">
                      {s.bullets.map((b, i) => <li key={i} className="text-sm leading-relaxed">{b}</li>)}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
