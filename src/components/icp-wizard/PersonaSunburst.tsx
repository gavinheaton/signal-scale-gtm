import { useMemo, useState } from 'react';
import { ICP, Persona, RoleInBuying, MatrixCategory } from '@/types/database';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const ALL_ROLES: RoleInBuying[] = ['champion', 'economic_buyer', 'influencer', 'end_user', 'blocker'];

const ROLE_LABELS: Record<RoleInBuying, string> = {
  champion: 'Champion',
  economic_buyer: 'Economic Buyer',
  influencer: 'Influencer',
  end_user: 'End User',
  blocker: 'Blocker',
};

const ROLE_COLORS: Record<RoleInBuying, string> = {
  champion: 'hsl(263, 70%, 55%)',
  economic_buyer: 'hsl(142, 60%, 45%)',
  influencer: 'hsl(217, 70%, 55%)',
  end_user: 'hsl(38, 85%, 55%)',
  blocker: 'hsl(8, 75%, 55%)',
};

const ROLE_COLORS_MUTED: Record<RoleInBuying, string> = {
  champion: 'hsl(263, 30%, 85%)',
  economic_buyer: 'hsl(142, 25%, 85%)',
  influencer: 'hsl(217, 30%, 85%)',
  end_user: 'hsl(38, 30%, 85%)',
  blocker: 'hsl(8, 30%, 85%)',
};

const MATRIX_COLORS: Record<MatrixCategory, string> = {
  now_account: 'hsl(142, 60%, 45%)',
  strategic_nurture: 'hsl(217, 70%, 55%)',
  trap_account: 'hsl(38, 85%, 55%)',
  no_go: 'hsl(8, 75%, 55%)',
};

interface ArcData {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  fill: string;
  stroke?: string;
  strokeDasharray?: string;
  label: string;
  tooltip: string;
  isGap?: boolean;
}

function describeArc(cx: number, cy: number, innerR: number, outerR: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const s = startAngle - 90;
  const e = endAngle - 90;
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  const outerStart = { x: cx + outerR * Math.cos(toRad(s)), y: cy + outerR * Math.sin(toRad(s)) };
  const outerEnd = { x: cx + outerR * Math.cos(toRad(e)), y: cy + outerR * Math.sin(toRad(e)) };
  const innerStart = { x: cx + innerR * Math.cos(toRad(e)), y: cy + innerR * Math.sin(toRad(e)) };
  const innerEnd = { x: cx + innerR * Math.cos(toRad(s)), y: cy + innerR * Math.sin(toRad(s)) };

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function midAngle(start: number, end: number) {
  return (start + end) / 2;
}

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

interface Props {
  icps: ICP[];
  personas: Persona[];
}

export default function PersonaSunburst({ icps, personas }: Props) {
  const [hoveredArc, setHoveredArc] = useState<string | null>(null);

  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 55;
  const midR1 = 90;
  const midR2 = 140;
  const outerR = 190;

  const arcs = useMemo(() => {
    if (icps.length === 0) return [];

    const result: ArcData[] = [];
    const icpAngle = 360 / icps.length;

    icps.forEach((icp, icpIdx) => {
      const icpStart = icpIdx * icpAngle;
      const icpEnd = icpStart + icpAngle;

      // Center ring: ICP segment
      result.push({
        startAngle: icpStart,
        endAngle: icpEnd,
        innerRadius: innerR,
        outerRadius: midR1,
        fill: MATRIX_COLORS[icp.matrix_category],
        label: icp.segment_name,
        tooltip: `${icp.segment_name}\nFit: ${icp.fit_score}/10 | Access: ${icp.access_score}/10`,
      });

      // Middle ring: roles
      const roleAngle = icpAngle / ALL_ROLES.length;
      ALL_ROLES.forEach((role, roleIdx) => {
        const roleStart = icpStart + roleIdx * roleAngle;
        const roleEnd = roleStart + roleAngle;

        const rolePersonas = personas.filter(p => p.icp_id === icp.id && p.role_in_buying === role);
        const hasPersonas = rolePersonas.length > 0;

        result.push({
          startAngle: roleStart,
          endAngle: roleEnd,
          innerRadius: midR1,
          outerRadius: midR2,
          fill: hasPersonas ? ROLE_COLORS[role] : ROLE_COLORS_MUTED[role],
          stroke: hasPersonas ? undefined : ROLE_COLORS[role],
          strokeDasharray: hasPersonas ? undefined : '4 3',
          label: ROLE_LABELS[role],
          tooltip: `${ROLE_LABELS[role]}\n${icp.segment_name}\n${hasPersonas ? `${rolePersonas.length} archetype(s)` : 'No archetypes mapped'}`,
          isGap: !hasPersonas,
        });

        // Outer ring: individual archetypes or gap
        if (rolePersonas.length > 0) {
          const personaAngle = (roleEnd - roleStart) / rolePersonas.length;
          rolePersonas.forEach((persona, pIdx) => {
            const pStart = roleStart + pIdx * personaAngle;
            const pEnd = pStart + personaAngle;
            result.push({
              startAngle: pStart,
              endAngle: pEnd,
              innerRadius: midR2,
              outerRadius: outerR,
              fill: ROLE_COLORS[role],
              label: persona.persona_name,
              tooltip: `${persona.persona_name}\nRole: ${ROLE_LABELS[role]}\nICP: ${icp.segment_name}${persona.how_we_help ? `\n${persona.how_we_help}` : ''}`,
            });
          });
        } else {
          // Gap segment
          result.push({
            startAngle: roleStart,
            endAngle: roleEnd,
            innerRadius: midR2,
            outerRadius: outerR,
            fill: 'hsl(240, 15%, 93%)',
            stroke: ROLE_COLORS[role],
            strokeDasharray: '3 3',
            label: '—',
            tooltip: `Gap: No ${ROLE_LABELS[role]} archetype\nfor ${icp.segment_name}`,
            isGap: true,
          });
        }
      });
    });

    return result;
  }, [icps, personas]);

  if (icps.length === 0) return null;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center justify-center gap-8">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[420px] h-auto">
          {arcs.map((arc, i) => {
            const key = `${arc.label}-${i}`;
            const isHovered = hoveredArc === key;
            const angleDiff = arc.endAngle - arc.startAngle;
            // Only render text labels for segments wide enough
            const mid = midAngle(arc.startAngle, arc.endAngle);
            const labelR = (arc.innerRadius + arc.outerRadius) / 2;
            const { x: lx, y: ly } = polarToCart(cx, cy, labelR, mid);
            const showLabel = angleDiff > 18 && arc.innerRadius >= midR1;

            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <g
                    onMouseEnter={() => setHoveredArc(key)}
                    onMouseLeave={() => setHoveredArc(null)}
                    className="cursor-pointer"
                  >
                    <path
                      d={describeArc(cx, cy, arc.innerRadius, arc.outerRadius, arc.startAngle + 0.5, arc.endAngle - 0.5)}
                      fill={arc.fill}
                      stroke={arc.stroke || 'hsl(0, 0%, 100%)'}
                      strokeWidth={arc.stroke ? 1.5 : 1}
                      strokeDasharray={arc.strokeDasharray}
                      opacity={isHovered ? 1 : arc.isGap ? 0.5 : 0.85}
                      style={{ transition: 'opacity 0.15s' }}
                    />
                    {/* Center ring label */}
                    {arc.innerRadius === innerR && angleDiff > 30 && (
                      <text
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="fill-white font-semibold pointer-events-none"
                        style={{ fontSize: angleDiff > 60 ? 10 : 8 }}
                      >
                        {arc.label.length > 12 ? arc.label.slice(0, 11) + '…' : arc.label}
                      </text>
                    )}
                    {/* Middle/outer ring labels */}
                    {showLabel && (
                      <text
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="fill-white font-medium pointer-events-none"
                        style={{ fontSize: angleDiff > 30 ? 9 : 7 }}
                        transform={`rotate(${mid > 90 && mid < 270 ? mid + 180 : mid}, ${lx}, ${ly})`}
                      >
                        {arc.label.length > 14 ? arc.label.slice(0, 13) + '…' : arc.label}
                      </text>
                    )}
                  </g>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] whitespace-pre-line text-xs">
                  {arc.tooltip}
                </TooltipContent>
              </Tooltip>
            );
          })}
          {/* Center circle */}
          <circle cx={cx} cy={cy} r={innerR - 2} fill="hsl(240, 20%, 98%)" />
          <text x={cx} y={cy - 8} textAnchor="middle" className="fill-foreground font-semibold" style={{ fontSize: 11 }}>
            Buying
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" className="fill-foreground font-semibold" style={{ fontSize: 11 }}>
            Influence
          </text>
        </svg>

        {/* Legend */}
        <div className="space-y-3 text-xs shrink-0">
          <div className="font-semibold text-sm text-foreground mb-2">Roles</div>
          {ALL_ROLES.map(role => (
            <div key={role} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ROLE_COLORS[role] }} />
              <span className="text-muted-foreground">{ROLE_LABELS[role]}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-3 pt-2 border-t">
            <div className="w-3 h-3 rounded border border-dashed shrink-0" style={{ borderColor: 'hsl(var(--muted-foreground))' }} />
            <span className="text-muted-foreground">Gap (unmapped)</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
