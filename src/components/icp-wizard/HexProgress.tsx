import { ICP_SECTIONS, getSectionStatus, type DraftOutput } from './types';

interface HexProgressProps {
  draft: DraftOutput;
  onSectionClick: (key: string) => void;
  activeSection?: string;
}

const HEX_POSITIONS = [
  { x: 90, y: 10 },   // top
  { x: 155, y: 45 },  // top-right
  { x: 155, y: 110 }, // bottom-right
  { x: 90, y: 145 },  // bottom
  { x: 25, y: 110 },  // bottom-left
  { x: 25, y: 45 },   // top-left
];

const STATUS_COLORS = {
  empty: { fill: 'hsl(var(--muted))', opacity: 0.4 },
  partial: { fill: 'hsl(var(--orange))', opacity: 0.7 },
  complete: { fill: 'hsl(var(--purple))', opacity: 1 },
};

export function HexProgress({ draft, onSectionClick, activeSection }: HexProgressProps) {
  return (
    <div className="relative w-full flex justify-center">
      <svg viewBox="0 0 220 170" className="w-full max-w-[260px]">
        {/* Center connecting lines */}
        {HEX_POSITIONS.map((pos, i) => (
          <line
            key={`line-${i}`}
            x1={110}
            y1={85}
            x2={pos.x + 20}
            y2={pos.y + 20}
            stroke="hsl(var(--border))"
            strokeWidth={1.5}
          />
        ))}

        {/* Hex nodes */}
        {ICP_SECTIONS.map((section, i) => {
          const pos = HEX_POSITIONS[i];
          const status = getSectionStatus(draft, section.key);
          const colors = STATUS_COLORS[status];
          const isActive = activeSection === section.key;

          return (
            <g
              key={section.key}
              onClick={() => onSectionClick(section.key)}
              className="cursor-pointer"
            >
              {/* Hex shape */}
              <HexagonShape
                cx={pos.x + 20}
                cy={pos.y + 20}
                size={22}
                fill={colors.fill}
                opacity={colors.opacity}
                isActive={isActive}
              />
              {/* Icon */}
              <text
                x={pos.x + 20}
                y={pos.y + 25}
                textAnchor="middle"
                fontSize={14}
              >
                {section.icon}
              </text>
            </g>
          );
        })}

        {/* Center label */}
        <text x={110} y={82} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))" fontWeight={500}>
          ICP
        </text>
        <text x={110} y={95} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
          Progress
        </text>
      </svg>
    </div>
  );
}

function HexagonShape({
  cx, cy, size, fill, opacity, isActive,
}: {
  cx: number; cy: number; size: number; fill: string; opacity: number; isActive: boolean;
}) {
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(' ');

  return (
    <>
      <polygon
        points={points}
        fill={fill}
        opacity={opacity}
        stroke={isActive ? 'hsl(var(--purple))' : 'hsl(var(--border))'}
        strokeWidth={isActive ? 2.5 : 1.5}
        className="transition-all duration-500"
      />
    </>
  );
}
