import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Canvas,
  CanvasEntry,
  CanvasVariant,
  STANDARD_BOXES,
  SHARED_VALUE_BOXES,
  BUSINESS_MODEL_BOXES,
} from '@/components/canvas/types';
import ReactMarkdown from 'react-markdown';
import { Loader2 } from 'lucide-react';

const VARIANT_META: Record<CanvasVariant, { label: string; boxes: typeof STANDARD_BOXES }> = {
  standard: { label: 'Disruptors Canvas', boxes: STANDARD_BOXES },
  shared_value: { label: 'Shared Value Canvas', boxes: SHARED_VALUE_BOXES },
  business_model: { label: 'Business Model Canvas', boxes: BUSINESS_MODEL_BOXES },
};

interface Bundle {
  canvas: Canvas;
  entries: CanvasEntry[];
}

function CompletionChip({ done }: { done: boolean }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${
        done ? 'border-green-600 text-green-700 bg-green-50' : 'border-amber-400 text-amber-700 bg-amber-50'
      }`}
    >
      {done ? '✓ Complete' : '· In progress'}
    </span>
  );
}

export default function CanvasPrint() {
  const [params] = useSearchParams();
  const projectId = params.get('project');
  const auto = params.get('auto') === '1';
  const [projectName, setProjectName] = useState<string>('');
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [whitespace, setWhitespace] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!projectId) return;
      const { data: proj } = await (supabase as any).from('projects').select('name').eq('id', projectId).maybeSingle();
      setProjectName(proj?.name || 'Project');

      const { data: canvases } = await (supabase as any)
        .from('canvases')
        .select('*')
        .eq('project_id', projectId);
      const list = (canvases || []) as Canvas[];
      const out: Bundle[] = [];
      for (const c of list) {
        const { data: er } = await (supabase as any)
          .from('canvas_entries')
          .select('*')
          .eq('canvas_id', c.id)
          .order('position');
        out.push({ canvas: c, entries: (er || []) as CanvasEntry[] });
      }
      // Order: standard, shared_value, business_model
      const order: CanvasVariant[] = ['standard', 'shared_value', 'business_model'];
      out.sort((a, b) => order.indexOf(a.canvas.variant) - order.indexOf(b.canvas.variant));
      setBundles(out);

      const [cRes, dRes, sRes, wRes] = await Promise.all([
        (supabase as any).from('competitors').select('*').eq('project_id', projectId).eq('status', 'confirmed').order('name'),
        (supabase as any).from('competitor_dimensions').select('*').eq('project_id', projectId).order('position'),
        (supabase as any).from('competitor_scores').select('*').eq('project_id', projectId),
        (supabase as any).from('competitive_whitespace').select('*').eq('project_id', projectId).order('created_at'),
      ]);
      setCompetitors(cRes.data || []);
      setDimensions(dRes.data || []);
      setScores(sRes.data || []);
      setWhitespace(wRes.data || []);

      setLoading(false);
    })();
  }, [projectId]);

  useEffect(() => {
    if (!loading && auto) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, auto]);

  if (!projectId) return <div className="p-8">Missing project id.</div>;
  if (loading)
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparing board pack…
      </div>
    );

  const now = new Date();
  const totalBoxes = bundles.reduce((sum, b) => sum + VARIANT_META[b.canvas.variant].boxes.length, 0);
  const validatedBoxes = bundles.reduce((sum, b) => {
    const meta = VARIANT_META[b.canvas.variant];
    return (
      sum +
      meta.boxes.filter((box) => b.entries.some((e) => e.box === box.key && e.status === 'validated')).length
    );
  }, 0);

  return (
    <div className="print-root bg-white text-black">
      <div className="print-controls fixed top-2 right-2 z-50 flex gap-2 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm"
        >
          Print / Save as PDF
        </button>
        <button onClick={() => window.close()} className="px-3 py-1.5 rounded border text-sm">
          Close
        </button>
      </div>

      {/* Cover */}
      <section className="print-page p-10 flex flex-col justify-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Board Pack</p>
        <h1 className="text-4xl font-semibold mt-2">{projectName}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generated {now.toLocaleDateString()} · {now.toLocaleTimeString()}
        </p>
        <div className="mt-8 space-y-1 text-sm">
          <p>
            <strong>Canvases included:</strong> {bundles.length}
          </p>
          <p>
            <strong>Validation coverage:</strong> {validatedBoxes} of {totalBoxes} boxes have at least one
            validated entry
          </p>
        </div>
        <div className="mt-6 space-y-1 text-sm">
          {bundles.map((b) => {
            const comp = (b.canvas.completion || { canvas: false, critique: false, narrative: false }) as any;
            return (
              <div key={b.canvas.id} className="flex items-center gap-2">
                <span className="font-medium w-56">{VARIANT_META[b.canvas.variant].label}</span>
                <CompletionChip done={!!comp.canvas} />
                {b.canvas.critique && <CompletionChip done={!!comp.critique} />}
                {b.canvas.narrative_md && <CompletionChip done={!!comp.narrative} />}
              </div>
            );
          })}
        </div>
      </section>

      {bundles.map((b) => {
        const meta = VARIANT_META[b.canvas.variant];
        const comp = (b.canvas.completion || { canvas: false, critique: false, narrative: false }) as any;
        const byBox: Record<string, CanvasEntry[]> = {};
        for (const e of b.entries) (byBox[e.box] = byBox[e.box] || []).push(e);
        const cols = b.canvas.variant === 'business_model' ? 5 : b.canvas.variant === 'shared_value' ? 4 : 5;

        return (
          <div key={b.canvas.id}>
            {/* Canvas grid page — landscape */}
            <section className="print-page print-landscape p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xl font-semibold">{meta.label}</h2>
                  <p className="text-xs text-muted-foreground">{projectName}</p>
                </div>
                <CompletionChip done={!!comp.canvas} />
              </div>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {meta.boxes.map((box) => (
                  <div key={box.key} className="border rounded p-2 min-h-[140px]">
                    <h3 className="text-xs font-semibold">{box.label}</h3>
                    <p className="text-[9px] text-muted-foreground leading-tight mb-1">{box.hint}</p>
                    <ul className="space-y-1">
                      {(byBox[box.key] || []).map((e) => (
                        <li key={e.id} className="text-[10px] leading-snug flex gap-1">
                          <span className="uppercase text-[8px] mt-0.5">{e.status[0]}</span>
                          <span className="flex-1">{e.content}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Narrative */}
            {b.canvas.narrative_md && (
              <section className="print-page p-10">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-semibold">{meta.label} — Narrative</h2>
                  <CompletionChip done={!!comp.narrative} />
                </div>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{b.canvas.narrative_md}</ReactMarkdown>
                </div>
              </section>
            )}

            {/* Critique */}
            {b.canvas.critique && (
              <section className="print-page p-10">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-semibold">{meta.label} — Critique</h2>
                  <CompletionChip done={!!comp.critique} />
                </div>
                {(() => {
                  const c: any = b.canvas.critique;
                  return (
                    <div className="space-y-4 text-sm">
                      {c.summary && <p>{c.summary}</p>}
                      {typeof c.validation_coverage_pct === 'number' && (
                        <p className="font-medium">Validation coverage: {c.validation_coverage_pct}%</p>
                      )}
                      {c.alignment_issues?.length > 0 && (
                        <section>
                          <h3 className="font-semibold mb-1">Alignment issues</h3>
                          <ul className="space-y-2">
                            {c.alignment_issues.map((i: any, k: number) => (
                              <li key={k} className="border-l-2 border-amber-400 pl-2">
                                <p className="text-xs uppercase text-muted-foreground">
                                  {(i.boxes || []).join(' ↔ ')}
                                </p>
                                <p>{i.issue}</p>
                                {i.fix && <p className="text-xs mt-0.5">Fix: {i.fix}</p>}
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {c.weak_boxes?.length > 0 && (
                        <section>
                          <h3 className="font-semibold mb-1">Weak boxes</h3>
                          <ul className="space-y-1">
                            {c.weak_boxes.map((w: any, k: number) => (
                              <li key={k}>
                                <span className="font-medium">{w.box}:</span> {w.issue}
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {c.gaps?.length > 0 && (
                        <section>
                          <h3 className="font-semibold mb-1">Gaps</h3>
                          <ul className="space-y-1">
                            {c.gaps.map((g: any, k: number) => (
                              <li key={k}>
                                <span className="font-medium">{g.box}:</span> {g.issue}
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                    </div>
                  );
                })()}
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}
