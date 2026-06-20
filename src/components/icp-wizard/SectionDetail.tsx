import { Badge } from '@/components/ui/badge';
import { Check, Circle } from 'lucide-react';
import { getSectionStatus, type DraftOutput, type SectionStatus } from './types';

interface SectionDetailProps {
  sectionKey: string;
  label: string;
  desc: string;
  icon: string;
  draft: DraftOutput;
  isExpanded: boolean;
  onToggle: () => void;
}

function StatusIndicator({ status }: { status: SectionStatus }) {
  if (status === 'complete')
    return (
      <div className="h-5 w-5 rounded-full bg-green-500/20 flex items-center justify-center">
        <Check className="h-3 w-3 text-green-500" />
      </div>
    );
  if (status === 'partial')
    return <div className="h-5 w-5 rounded-full border-2 border-amber-400 bg-amber-400/20" />;
  return <Circle className="h-5 w-5 text-muted-foreground/30" />;
}

function formatValue(value: any): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

export function SectionDetail({ sectionKey, label, desc, icon, draft, isExpanded, onToggle }: SectionDetailProps) {
  const status = getSectionStatus(draft, sectionKey);
  const sectionData = (draft as any)[sectionKey];
  const hasData = sectionData && typeof sectionData === 'object' && Object.keys(sectionData).length > 0;

  return (
    <div
      className={`rounded-lg border transition-all duration-300 overflow-hidden ${
        status === 'complete'
          ? 'border-green-500/30 bg-green-500/5'
          : status === 'partial'
          ? 'border-amber-400/30 bg-amber-400/5'
          : 'border-border bg-card'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/5 transition-colors"
      >
        <span className="text-base">{icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <p className="text-[10px] text-muted-foreground truncate">{desc}</p>
        </div>
        <StatusIndicator status={status} />
      </button>

      {isExpanded && hasData && (
        <div className="px-3 pb-3 animate-fade-in">
          <div className="flex flex-wrap gap-1.5 pt-1">
            {Object.entries(sectionData).map(([key, value]) => (
              <Badge
                key={key}
                variant="secondary"
                className="text-[10px] font-normal max-w-[200px] truncate"
                title={`${key}: ${formatValue(value)}`}
              >
                <span className="text-muted-foreground mr-1">{key.replace(/_/g, ' ')}:</span>
                {formatValue(value)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {isExpanded && !hasData && (
        <div className="px-3 pb-3 animate-fade-in">
          <p className="text-[11px] text-muted-foreground italic">Waiting for data from conversation…</p>
        </div>
      )}
    </div>
  );
}
