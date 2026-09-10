import { useMemo } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, ReferenceArea, ReferenceLine, Tooltip, Cell, LabelList,
} from 'recharts';
import {
  Competitor, CompetitorDimension, CompetitorScore, CompetitorArchetype,
  ARCHETYPE_LABELS, ARCHETYPE_ORDER,
} from '@/types/competitors';

interface Props {
  dimensions: CompetitorDimension[];
  competitors: Competitor[];
  scores: CompetitorScore[];
  /** dimension ids for the two axes; defaults to the two most important */
  xDimensionId?: string | null;
  yDimensionId?: string | null;
  /** print variant: no tooltip, no animation, always-on labels */
  print?: boolean;
  onSelectOrganisation?: (name: string) => void;
}

export interface OrgPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  archetype: CompetitorArchetype | 'us';
  isUs: boolean;
  xClaim: string | null;
  yClaim: string | null;
  xRating: string;
  yRating: string;
}

const RATING_VALUE: Record<string, number> = { weak: 1, parity: 2, strong: 3 };
const RATING_TEXT: Record<string, string> = { weak: 'Weak', parity: 'Parity', strong: 'Strong', unrated: 'No evidence' };

export const ARCHETYPE_COLOUR: Record<string, string> = {
  capital_coalition: '#8833ff',
  engineering_systems: '#2563eb',
  applied_research: '#059669',
  place_alliance: '#e33e23',
  other: '#94a3b8',
  us: '#0f284c',
};

/** Pick the two dimensions that matter most to buyers. */
export function defaultAxes(dimensions: any[]): { x: string | null; y: string | null } {
  const sorted = [...dimensions].sort(
    (a, b) => (Number(b.importance ?? 3) - Number(a.importance ?? 3)) || (a.position ?? 0) - (b.position ?? 0),
  );
  return { x: sorted[0]?.id ?? null, y: sorted[1]?.id ?? sorted[0]?.id ?? null };
}

/** One point per organisation, positioned by its standing on the two chosen dimensions. */
export function buildOrgPoints(
  competitors: any[], scores: any[], xDimId: string | null, yDimId: string | null,
): OrgPoint[] {
  const rows: { id: string; name: string; archetype: CompetitorArchetype | 'us'; isUs: boolean; claims: number }[] = [
    { id: 'us', name: 'Us', archetype: 'us', isUs: true, claims: 0 },
    ...[...competitors]
      .sort((a, b) => ARCHETYPE_ORDER.indexOf(a.archetype || 'other') - ARCHETYPE_ORDER.indexOf(b.archetype || 'other'))
      .map((c) => ({
        id: c.id,
        name: c.name,
        archetype: (c.archetype || 'other') as CompetitorArchetype,
        isUs: false,
        claims: Array.isArray(c.claims) ? c.claims.length : 0,
      })),
  ];

  const cell = (dimId: string | null, compId: string | null) =>
    dimId ? scores.find((s) => s.dimension_id === dimId && (s.competitor_id ?? null) === compId) : undefined;

  // spread ties so overlapping names stay readable
  const bucket = new Map<string, number>();

  return rows.map((r) => {
    const compId = r.isUs ? null : r.id;
    const xs = cell(xDimId, compId);
    const ys = cell(yDimId, compId);
    const xr = (xs?.rating as string) || 'unrated';
    const yr = (ys?.rating as string) || 'unrated';
    const bx = RATING_VALUE[xr] ?? 0;
    const by = RATING_VALUE[yr] ?? 0;
    const key = `${bx}|${by}`;
    const n = bucket.get(key) ?? 0;
    bucket.set(key, n + 1);
    const angle = (n * 2.399) % (Math.PI * 2);
    const radius = n === 0 ? 0 : 0.12 + 0.07 * n;

    return {
      id: r.id,
      name: r.name,
      x: bx + Math.cos(angle) * radius,
      y: by + Math.sin(angle) * radius,
      z: Math.max(1, r.claims),
      archetype: r.archetype,
      isUs: r.isUs,
      xClaim: xs?.claim || null,
      yClaim: ys?.claim || null,
      xRating: xr,
      yRating: yr,
    };
  });
}

const TICKS = [0, 1, 2, 3];
const TICK_TEXT: Record<number, string> = { 0: 'No evidence', 1: 'Weak', 2: 'Parity', 3: 'Strong' };

export function WhitespaceChart({
  dimensions, competitors, scores, xDimensionId, yDimensionId, print, onSelectOrganisation,
}: Props) {
  const axes = useMemo(() => {
    const fallback = defaultAxes(dimensions);
    return {
      x: xDimensionId ?? fallback.x,
      y: yDimensionId ?? fallback.y,
    };
  }, [dimensions, xDimensionId, yDimensionId]);

  const points = useMemo(
    () => buildOrgPoints(competitors, scores, axes.x, axes.y),
    [competitors, scores, axes.x, axes.y],
  );

  const xLabel = dimensions.find((d) => d.id === axes.x)?.label || 'Dimension';
  const yLabel = dimensions.find((d) => d.id === axes.y)?.label || 'Dimension';
  const height = print ? 360 : 420;

  const usedArchetypes = Array.from(new Set(points.filter((p) => !p.isUs).map((p) => p.archetype)));

  if (points.length <= 1) return null;

  return (
    <div className="w-full">
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 20, right: 40, bottom: 44, left: 24 }}>
            {/* the open corner: strong where others are not */}
            <ReferenceArea x1={2.5} x2={3.5} y1={2.5} y2={3.5} fill="#16a34a" fillOpacity={0.06} />
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number" dataKey="x" name={xLabel}
              domain={[-0.5, 3.5]} ticks={TICKS} allowDecimals={false}
              tickFormatter={(v: number) => TICK_TEXT[v] ?? ''}
              tick={{ fontSize: 10 }}
              label={{ value: xLabel, position: 'insideBottom', offset: -22, fontSize: 11 }}
            />
            <YAxis
              type="number" dataKey="y" name={yLabel}
              domain={[-0.5, 3.5]} ticks={TICKS}
              tickFormatter={(v: number) => TICK_TEXT[v] ?? ''}
              tick={{ fontSize: 10 }} width={78}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: -10, fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="z" range={[90, 400]} />
            <ReferenceLine x={1.5} stroke="#cbd5e1" />
            <ReferenceLine y={1.5} stroke="#cbd5e1" />
            <ReferenceLine
              y={3.4} stroke="transparent"
              label={{ value: 'CROWDED CORNER', position: 'insideRight', fontSize: 10, fill: '#e11d48' }}
            />
            <ReferenceLine
              y={-0.4} stroke="transparent"
              label={{ value: 'OPEN GROUND', position: 'insideLeft', fontSize: 10, fill: '#16a34a' }}
            />
            {!print && (
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as OrgPoint;
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md max-w-[280px] space-y-1">
                      <p className="font-semibold">{p.name}</p>
                      {!p.isUs && (
                        <p className="text-muted-foreground">{ARCHETYPE_LABELS[p.archetype as CompetitorArchetype]}</p>
                      )}
                      <p><span className="font-medium">{xLabel}:</span> {RATING_TEXT[p.xRating]}{p.xClaim ? ` — ${p.xClaim}` : ''}</p>
                      <p><span className="font-medium">{yLabel}:</span> {RATING_TEXT[p.yRating]}{p.yClaim ? ` — ${p.yClaim}` : ''}</p>
                    </div>
                  );
                }}
              />
            )}
            <Scatter
              data={points}
              isAnimationActive={!print}
              onClick={(d: any) => onSelectOrganisation?.(d?.name)}
              cursor={onSelectOrganisation ? 'pointer' : 'default'}
            >
              {points.map((p) => (
                <Cell
                  key={p.id}
                  fill={ARCHETYPE_COLOUR[p.archetype]}
                  fillOpacity={p.isUs ? 0.95 : 0.7}
                  stroke={p.isUs ? '#0f284c' : ARCHETYPE_COLOUR[p.archetype]}
                  strokeWidth={p.isUs ? 3 : 1}
                />
              ))}
              <LabelList dataKey="name" position="top" style={{ fontSize: 10, fill: '#475569' }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-3 mt-1">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: ARCHETYPE_COLOUR.us }} /> Us
        </span>
        {usedArchetypes.map((a) => (
          <span key={a} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ARCHETYPE_COLOUR[a] }} />
            {ARCHETYPE_LABELS[a as CompetitorArchetype]}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Each dot is an organisation. Bigger dots make more claims overall. The shaded top-right corner is
        where everyone is strong — the empty space is where you can stand alone.
      </p>
    </div>
  );
}
