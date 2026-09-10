import { useMemo } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, ReferenceLine, Tooltip, LabelList,
} from 'recharts';
import {
  Competitor, CompetitorArchetype, CompetitorDimension, MarketPosition,
  ARCHETYPE_LABELS, ARCHETYPE_ORDER,
} from '@/types/competitors';
import { ARCHETYPE_COLOUR } from './WhitespaceChart';

interface Props {
  competitors: Competitor[];
  dimensions: CompetitorDimension[];
  positions: MarketPosition[];
  usLabel?: string;
  print?: boolean;
  onSelectOrganisation?: (name: string) => void;
}

interface Point {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  archetype: CompetitorArchetype | 'us';
  isUs: boolean;
  rationale: string | null;
  cited: string[];
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
  const baselineY = y - (print ? 7 : 6);

  return (
    <text
      x={centreX}
      y={baselineY}
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

export function MarketPositionChart({
  competitors, dimensions, positions, usLabel, print, onSelectOrganisation,
}: Props) {
  const ourName = usLabel?.trim() || 'Us';
  const dimLabel = useMemo(
    () => new Map(dimensions.map((d) => [d.id, d.label])),
    [dimensions],
  );

  const points = useMemo<Point[]>(() => {
    const byComp = new Map<string, MarketPosition>();
    for (const p of positions) byComp.set(p.competitor_id ?? 'us', p);

    const rows: Point[] = [];
    const push = (
      id: string, name: string, archetype: CompetitorArchetype | 'us', isUs: boolean, claims: number,
    ) => {
      const p = byComp.get(id);
      if (!p) return;
      rows.push({
        id,
        name,
        x: p.leadership,
        y: p.differentiation,
        z: Math.max(1, claims),
        archetype,
        isUs,
        rationale: p.rationale,
        cited: (p.cited_dimension_ids || []).map((d) => dimLabel.get(d) || '').filter(Boolean),
      });
    };

    push('us', ourName, 'us', true, 4);
    [...competitors]
      .sort((a, b) => ARCHETYPE_ORDER.indexOf(a.archetype || 'other') - ARCHETYPE_ORDER.indexOf(b.archetype || 'other'))
      .forEach((c) => push(c.id, c.name, (c.archetype || 'other') as CompetitorArchetype, false,
        Array.isArray(c.claims) ? c.claims.length : 1));
    return rows;
  }, [competitors, positions, dimLabel, ourName]);

  if (points.length === 0) return null;

  const height = print ? 400 : 480;
  const tickStyle = { fontSize: print ? 11 : 11, fontWeight: 500, fill: '#334155' };
  const axisLabelStyle = { fontSize: print ? 12 : 12, fontWeight: 600, fill: '#334155' };
  const quadrantLabelStyle = { fontSize: print ? 11 : 11, fontWeight: 600 };
  const usedArchetypes = Array.from(new Set(points.filter((p) => !p.isUs).map((p) => p.archetype)));




  return (
    <div className="w-full">
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 34, right: 58, bottom: 46, left: 34 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.75} />
            <XAxis
              type="number" dataKey="x" name="Market traction"
              domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tickStyle}
              tickLine={{ stroke: '#94a3b8' }} axisLine={{ stroke: '#94a3b8' }}
              label={{ value: 'Market traction (evidenced) →', position: 'insideBottom', offset: -22, ...axisLabelStyle }}
            />
            <YAxis
              type="number" dataKey="y" name="Differentiation"
              domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tickStyle} width={64}
              tickLine={{ stroke: '#94a3b8' }} axisLine={{ stroke: '#94a3b8' }}
              label={{ value: 'Differentiation →', angle: -90, position: 'insideLeft', offset: 4, ...axisLabelStyle }}
            />
            <ZAxis type="number" dataKey="z" range={print ? [210, 620] : [180, 560]} />
            <ReferenceLine x={50} stroke="#cbd5e1" />
            <ReferenceLine y={50} stroke="#cbd5e1" />
            <ReferenceLine
              y={99} stroke="transparent"
              label={{ value: 'VISIONARIES', position: 'insideLeft', fill: '#8833ff', ...quadrantLabelStyle }}
            />
            <ReferenceLine
              y={99} stroke="transparent"
              label={{ value: 'LEADERS', position: 'insideRight', fill: '#16a34a', ...quadrantLabelStyle }}
            />
            <ReferenceLine
              y={1} stroke="transparent"
              label={{ value: 'NICHE PLAYERS', position: 'insideLeft', fill: '#64748b', ...quadrantLabelStyle }}
            />
            <ReferenceLine
              y={1} stroke="transparent"
              label={{ value: 'CHALLENGERS', position: 'insideRight', fill: '#e33e23', ...quadrantLabelStyle }}
            />
            {!print && (
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Point;
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md max-w-[300px] space-y-1">
                      <p className="font-semibold">{p.name}</p>
                      {!p.isUs && (
                        <p className="text-muted-foreground">{ARCHETYPE_LABELS[p.archetype as CompetitorArchetype]}</p>
                      )}
                      <p>Market traction {p.x} / 100 · Differentiation {p.y} / 100</p>
                      {p.rationale && <p className="text-muted-foreground">{p.rationale}</p>}
                      {p.cited.length > 0 && (
                        <p className="text-muted-foreground">Based on: {p.cited.join(', ')}</p>
                      )}
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
          <span className="h-3 w-3 rounded-full border-2 border-background ring-1 ring-foreground" style={{ background: ARCHETYPE_COLOUR.us }} /> {ourName}
        </span>
        {usedArchetypes.map((a) => (
          <span key={a} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="h-3 w-3 rounded-full border border-border" style={{ background: ARCHETYPE_COLOUR[a] }} />
            {ARCHETYPE_LABELS[a as CompetitorArchetype]}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Across: evidenced traction — how widely known, adopted and shortlisted an organisation already is with
        your buyers. Up: how distinct its position is from everyone else. Top-right leads on both; top-left is
        distinct but yet to build traction; bottom-right is well known but interchangeable.
      </p>
      
    </div>
  );
}
