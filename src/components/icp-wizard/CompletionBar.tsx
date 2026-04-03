import { ICP_SECTIONS, getSectionStatus, type DraftOutput } from './types';

interface CompletionBarProps {
  draft: DraftOutput;
}

export function CompletionBar({ draft }: CompletionBarProps) {
  const completed = ICP_SECTIONS.filter(s => getSectionStatus(draft, s.key) === 'complete').length;
  const partial = ICP_SECTIONS.filter(s => getSectionStatus(draft, s.key) === 'partial').length;
  const total = ICP_SECTIONS.length;
  const pct = Math.round(((completed + partial * 0.5) / total) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {completed} of {total} sections complete
          {partial > 0 && ` · ${partial} in progress`}
        </span>
        <span className="font-semibold text-foreground">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: pct === 100
              ? 'hsl(var(--purple))'
              : 'linear-gradient(90deg, hsl(var(--orange)), hsl(var(--purple)))',
          }}
        />
      </div>
    </div>
  );
}
