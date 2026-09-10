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
import { WhitespaceChart } from '@/components/competitors/WhitespaceChart';

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

      {competitors.length > 0 && (
        <section className="print-page p-10">
          <h2 className="text-xl font-semibold mb-1">Competitive Landscape</h2>
          <p className="text-xs text-muted-foreground mb-4">{projectName}</p>
          <div className="space-y-4 text-sm">
            {competitors.map((c) => (
              <div key={c.id} className="border rounded p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{c.name}</h3>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {String(c.type || '').replace('_', ' ')}
                  </span>
                </div>
                {c.domain && <p className="text-xs text-muted-foreground">{c.domain}</p>}
                {c.positioning && <p className="mt-1">{c.positioning}</p>}
                <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                  {(c.strengths || []).length > 0 && (
                    <div>
                      <p className="font-medium">Strengths</p>
                      <ul className="list-disc pl-4">
                        {(c.strengths || []).map((s: string, k: number) => <li key={k}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {(c.weaknesses || []).length > 0 && (
                    <div>
                      <p className="font-medium">Weaknesses</p>
                      <ul className="list-disc pl-4">
                        {(c.weaknesses || []).map((s: string, k: number) => <li key={k}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {dimensions.length > 0 && (
        <section className="print-page print-landscape p-6">
          <h2 className="text-xl font-semibold mb-1">Whitespace opportunity map</h2>
          <p className="text-xs text-muted-foreground mb-2">
            Dots sitting high and to the left are dimensions buyers care about that no competitor owns.
          </p>
          <WhitespaceChart dimensions={dimensions} competitors={competitors} scores={scores} print />
          <h2 className="text-xl font-semibold mt-6 mb-3">Positioning comparison</h2>
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr>
                <th className="border p-1 text-left">Dimension</th>
                <th className="border p-1 text-left">Us</th>
                {competitors.map((c) => (
                  <th key={c.id} className="border p-1 text-left">{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dimensions.map((d) => {
                const cell = (competitorId: string | null) =>
                  scores.find((s) => s.dimension_id === d.id && (s.competitor_id || null) === competitorId);
                const render = (s: any) =>
                  s ? (
                    <>
                      {s.rating && <span className="uppercase font-semibold">{s.rating}</span>}
                      {s.claim && <span className="block">{s.claim}</span>}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  );
                return (
                  <tr key={d.id}>
                    <td className="border p-1 font-medium align-top">{d.label}</td>
                    <td className="border p-1 align-top">{render(cell(null))}</td>
                    {competitors.map((c) => (
                      <td key={c.id} className="border p-1 align-top">{render(cell(c.id))}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {whitespace.length > 0 && (
        <section className="print-page p-10">
          <h2 className="text-xl font-semibold mb-3">Whitespace &amp; counter-positioning</h2>
          <div className="space-y-3 text-sm">
            {whitespace.map((w) => (
              <div key={w.id} className="border-l-2 border-primary pl-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {String(w.kind || '').replace('_', ' ')}
                </p>
                <p className="font-medium">{w.title}</p>
                {w.rationale && <p className="text-xs mt-0.5">{w.rationale}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
