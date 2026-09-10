import { useMemo } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, ReferenceLine, Tooltip, Cell, LabelList,
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

  const height = print ? 380 : 460;
  const usedArchetypes = Array.from(new Set(points.filter((p) => !p.isUs).map((p) => p.archetype)));




  return (
    <div className="w-full">
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 24, right: 40, bottom: 40, left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number" dataKey="x" name="Market traction"
              domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10 }}
              label={{ value: 'Market traction (evidenced) →', position: 'insideBottom', offset: -18, fontSize: 11 }}
            />
            <YAxis
              type="number" dataKey="y" name="Differentiation"
              domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10 }} width={54}
              label={{ value: 'Differentiation →', angle: -90, position: 'insideLeft', offset: 6, fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="z" range={[110, 420]} />
            <ReferenceLine x={50} stroke="#cbd5e1" />
            <ReferenceLine y={50} stroke="#cbd5e1" />
            <ReferenceLine
              y={99} stroke="transparent"
              label={{ value: 'VISIONARIES', position: 'insideLeft', fontSize: 10, fill: '#8833ff' }}
            />
            <ReferenceLine
              y={99} stroke="transparent"
              label={{ value: 'LEADERS', position: 'insideRight', fontSize: 10, fill: '#16a34a' }}
            />
            <ReferenceLine
              y={1} stroke="transparent"
              label={{ value: 'NICHE PLAYERS', position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
            />
            <ReferenceLine
              y={1} stroke="transparent"
              label={{ value: 'CHALLENGERS', position: 'insideRight', fontSize: 10, fill: '#e33e23' }}
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
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: ARCHETYPE_COLOUR.us }} /> {ourName}
        </span>
        {usedArchetypes.map((a) => (
          <span key={a} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ARCHETYPE_COLOUR[a] }} />
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
