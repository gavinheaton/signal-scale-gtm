import { useMemo } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, ReferenceLine, Tooltip, Cell, LabelList,
} from 'recharts';
import { Competitor, CompetitorDimension, CompetitorScore, CompetitorRating } from '@/types/competitors';

interface Props {
  dimensions: CompetitorDimension[];
  competitors: Competitor[];
  scores: CompetitorScore[];
  /** print variant: no tooltip, no animation, always-on labels */
  print?: boolean;
  onSelectDimension?: (label: string) => void;
}

export interface WhitespacePoint {
  id: string;
  label: string;
  x: number;          // how many competitors are rated strong
  y: number;          // importance 1-5
  z: number;          // how many competitors have any claim/rating
  ours: CompetitorRating | 'unrated';
  strongNames: string[];
}

const OUR_COLOUR: Record<string, string> = {
  strong: '#16a34a',
  parity: '#f59e0b',
  weak: '#e11d48',
  unrated: '#94a3b8',
};

const OUR_LABEL: Record<string, string> = {
  strong: 'We are strong',
  parity: 'We are at parity',
  weak: 'We are weak',
  unrated: 'We are not rated',
};

export function buildWhitespacePoints(
  dimensions: any[], competitors: any[], scores: any[],
): WhitespacePoint[] {
  const confirmedIds = new Set(competitors.map((c) => c.id));
  const nameById = new Map(competitors.map((c) => [c.id, c.name]));
  return dimensions.map((d) => {
    const rows = scores.filter((s) => s.dimension_id === d.id);
    const compRows = rows.filter((s) => s.competitor_id && confirmedIds.has(s.competitor_id));
    const strong = compRows.filter((s) => s.rating === 'strong');
    const claimed = compRows.filter((s) => s.rating || (s.claim && String(s.claim).trim()));
    const us = rows.find((s) => !s.competitor_id);
    return {
      id: d.id,
      label: d.label,
      x: strong.length,
      y: Number(d.importance ?? 3),
      z: claimed.length,
      ours: (us?.rating as CompetitorRating) || 'unrated',
      strongNames: strong.map((s) => nameById.get(s.competitor_id) || 'Unknown'),
    };
  });
}

export function WhitespaceChart({ dimensions, competitors, scores, print, onSelectDimension }: Props) {
  const points = useMemo(
    () => buildWhitespacePoints(dimensions, competitors, scores),
    [dimensions, competitors, scores],
  );

  if (points.length === 0) return null;

  const maxX = Math.max(1, competitors.length);
  const midX = maxX / 2;
  const height = print ? 340 : 380;

  return (
    <div className="w-full">
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 24, right: 32, bottom: 36, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number" dataKey="x" name="Competitors rated strong"
              domain={[-0.4, maxX + 0.4]} tickCount={maxX + 1} allowDecimals={false}
              tick={{ fontSize: 11 }}
              label={{ value: 'How crowded — competitors rated strong', position: 'insideBottom', offset: -18, fontSize: 11 }}
            />
            <YAxis
              type="number" dataKey="y" name="Importance to buyers"
              domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }}
              label={{ value: 'How much it matters', angle: -90, position: 'insideLeft', fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="z" range={[80, 420]} />
            <ReferenceLine x={midX} stroke="#cbd5e1" />
            <ReferenceLine y={3} stroke="#cbd5e1" />
            <ReferenceLine
              x={midX} stroke="transparent"
              label={{ value: 'OPEN GROUND', position: 'insideTopLeft', fontSize: 10, fill: '#16a34a', offset: 12 }}
            />
            <ReferenceLine
              x={midX} stroke="transparent"
              label={{ value: 'HARD FIGHT', position: 'insideTopRight', fontSize: 10, fill: '#e11d48', offset: 12 }}
            />
            <ReferenceLine
              y={0.6} stroke="transparent"
              label={{ value: 'LOW STAKES', position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
            />
            <ReferenceLine
              y={0.6} stroke="transparent"
              label={{ value: 'CROWDED NOISE', position: 'insideRight', fontSize: 10, fill: '#94a3b8' }}
            />
            {!print && (
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as WhitespacePoint;
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md max-w-[260px]">
                      <p className="font-semibold">{p.label}</p>
                      <p className="text-muted-foreground">Matters: {p.y} of 5</p>
                      <p className="text-muted-foreground">{OUR_LABEL[p.ours]}</p>
                      <p className="text-muted-foreground">
                        {p.strongNames.length === 0
                          ? 'No competitor is strong here'
                          : `Strong: ${p.strongNames.join(', ')}`}
                      </p>
                    </div>
                  );
                }}
              />
            )}
            <Scatter
              data={points}
              isAnimationActive={!print}
              onClick={(d: any) => onSelectDimension?.(d?.label)}
              cursor={onSelectDimension ? 'pointer' : 'default'}
            >
              {points.map((p) => (
                <Cell key={p.id} fill={OUR_COLOUR[p.ours]} fillOpacity={0.75} stroke={OUR_COLOUR[p.ours]} />
              ))}
              <LabelList dataKey="label" position="top" style={{ fontSize: 10, fill: '#475569' }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Each dot is a comparison dimension. Left and high is open ground; right and high is a hard fight.
        Bigger dots mean more competitors claim it. Green means we are already strong, amber parity, red weak, grey unrated.
      </p>
    </div>
  );
}
