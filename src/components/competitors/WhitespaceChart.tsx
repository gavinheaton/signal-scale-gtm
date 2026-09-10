import { useMemo } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, ReferenceArea, ReferenceLine, Tooltip, LabelList,
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

function OrganisationDot({ cx, cy, size, payload }: any) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null;
  const radius = Math.max(7, Math.sqrt(Math.max(Number(size) || 0, 1) / Math.PI));
  const colour = ARCHETYPE_COLOUR[payload.archetype] || ARCHETYPE_COLOUR.other;

  return (
    <g>
      {payload.isUs && (
        <circle cx={cx} cy={cy} r={radius + 3} fill="none" stroke="#0f284c" strokeWidth={2} />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={colour}
        stroke={payload.isUs ? '#ffffff' : colour}
        strokeWidth={payload.isUs ? 2 : 1.5}
      />
    </g>
  );
}

function OrganisationLabel({ x, y, width, value, print }: any) {
  if (typeof x !== 'number' || typeof y !== 'number' || value == null) return null;
  const centreX = x + (Number(width) || 0) / 2;

  return (
    <text
      x={centreX}
      y={y - (print ? 7 : 6)}
      textAnchor="middle"
      fontFamily="Poppins, sans-serif"
      fontSize={print ? 12 : 11}
      fontWeight={600}
      fill="#334155"
      stroke="#ffffff"
      strokeWidth={4}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {String(value)}
    </text>
  );
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
  const height = print ? 380 : 440;
  const tickStyle = { fontSize: 11, fontWeight: 500, fill: '#334155' };
  const axisLabelStyle = { fontSize: 12, fontWeight: 600, fill: '#334155' };
  const cornerLabelStyle = { fontSize: 11, fontWeight: 600 };

  const usedArchetypes = Array.from(new Set(points.filter((p) => !p.isUs).map((p) => p.archetype)));

  if (points.length <= 1) return null;

  return (
    <div className="w-full">
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 30, right: 58, bottom: 48, left: 34 }}>
            {/* the open corner: strong where others are not */}
            <ReferenceArea x1={2.5} x2={3.5} y1={2.5} y2={3.5} fill="#16a34a" fillOpacity={0.06} />
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.75} />
            <XAxis
              type="number" dataKey="x" name={xLabel}
              domain={[-0.5, 3.5]} ticks={TICKS} allowDecimals={false}
              tickFormatter={(v: number) => TICK_TEXT[v] ?? ''}
              tick={tickStyle} tickLine={{ stroke: '#94a3b8' }} axisLine={{ stroke: '#94a3b8' }}
              label={{ value: xLabel, position: 'insideBottom', offset: -24, ...axisLabelStyle }}
            />
            <YAxis
              type="number" dataKey="y" name={yLabel}
              domain={[-0.5, 3.5]} ticks={TICKS}
              tickFormatter={(v: number) => TICK_TEXT[v] ?? ''}
              tick={tickStyle} width={88}
              tickLine={{ stroke: '#94a3b8' }} axisLine={{ stroke: '#94a3b8' }}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: -12, ...axisLabelStyle }}
            />
            <ZAxis type="number" dataKey="z" range={print ? [190, 580] : [160, 520]} />
            <ReferenceLine x={1.5} stroke="#cbd5e1" />
            <ReferenceLine y={1.5} stroke="#cbd5e1" />
            <ReferenceLine
              y={3.4} stroke="transparent"
              label={{ value: 'CROWDED CORNER', position: 'insideRight', fill: '#e11d48', ...cornerLabelStyle }}
            />
            <ReferenceLine
              y={-0.4} stroke="transparent"
              label={{ value: 'OPEN GROUND', position: 'insideLeft', fill: '#16a34a', ...cornerLabelStyle }}
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
              shape={<OrganisationDot />}
            >
              <LabelList dataKey="name" content={(props: any) => <OrganisationLabel {...props} print={print} />} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-3 mt-1">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="h-3 w-3 rounded-full border-2 border-background ring-1 ring-foreground" style={{ background: ARCHETYPE_COLOUR.us }} /> Us
        </span>
        {usedArchetypes.map((a) => (
          <span key={a} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="h-3 w-3 rounded-full border border-border" style={{ background: ARCHETYPE_COLOUR[a] }} />
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
