import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Save, Sparkles } from 'lucide-react';
import { ScoreRing } from './ScoreRing';
import { HexProgress } from './HexProgress';
import { SectionDetail } from './SectionDetail';
import { CompletionBar } from './CompletionBar';
import { ICP_SECTIONS, type DraftOutput } from './types';

interface ICPPreviewPanelProps {
  draft: DraftOutput;
  saving: boolean;
  onSave: () => void;
  hasAnyData: boolean;
}

const MATRIX_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  now_account: { bg: 'bg-green-500/15', text: 'text-green-600', label: 'Now Account' },
  strategic_nurture: { bg: 'bg-blue-500/15', text: 'text-blue-600', label: 'Strategic Nurture' },
  trap_account: { bg: 'bg-amber-500/15', text: 'text-amber-600', label: 'Trap Account' },
  no_go: { bg: 'bg-red-500/15', text: 'text-red-600', label: 'No-Go Zone' },
};

export function ICPPreviewPanel({ draft, saving, onSave, hasAnyData }: ICPPreviewPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeHexSection, setActiveHexSection] = useState<string | undefined>();
  const [showSuccess, setShowSuccess] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isComplete = draft.is_complete === true;
  const matrixInfo = MATRIX_COLORS[draft.matrix_category || ''];

  useEffect(() => {
    if (isComplete) {
      setExpandedSections(new Set(ICP_SECTIONS.map(s => s.key)));
      panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isComplete]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleHexClick = (key: string) => {
    setActiveHexSection(key);
    setExpandedSections(prev => new Set(prev).add(key));
  };

  const handleSave = () => {
    onSave();
    setShowSuccess(true);
  };

  if (showSuccess && !saving) {
    return (
      <div className="flex-1 flex items-center justify-center animate-scale-in">
        <div className="text-center space-y-4">
          <div className="h-20 w-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="h-10 w-10 text-green-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">ICP Saved!</h3>
            <p className="text-sm text-muted-foreground">Redirecting to ICP & Personas…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {draft.segment_name || 'New ICP Segment'}
            </h2>
            {matrixInfo && (
              <Badge className={`${matrixInfo.bg} ${matrixInfo.text} border-0 text-[10px] mt-1`}>
                {matrixInfo.label}
              </Badge>
            )}
          </div>
          <Sparkles className="h-5 w-5 text-muted-foreground/30" />
        </div>

        {(draft.fit_score || draft.access_score) && (
          <div className="flex justify-center gap-8 py-2">
            <ScoreRing score={draft.fit_score || 0} maxScore={10} label="Fit" color="hsl(var(--purple))" />
            <ScoreRing score={draft.access_score || 0} maxScore={10} label="Access" color="hsl(var(--orange))" />
          </div>
        )}

        <CompletionBar draft={draft} />
      </div>

      <HexProgress draft={draft} onSectionClick={handleHexClick} activeSection={activeHexSection} />

      <div className="space-y-2">
        {ICP_SECTIONS.map(section => (
          <SectionDetail
            key={section.key}
            sectionKey={section.key}
            label={section.label}
            desc={section.desc}
            icon={section.icon}
            draft={draft}
            isExpanded={expandedSections.has(section.key)}
            onToggle={() => toggleSection(section.key)}
          />
        ))}
      </div>

      {/* Save buttons — always visible */}
      <div className="sticky bottom-0 pt-3 pb-1 bg-gradient-to-t from-background via-background to-transparent space-y-2">
        {isComplete ? (
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full animate-[pulse_2s_ease-in-out_infinite] shadow-lg shadow-primary/25"
            size="lg"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
            ) : (
              <><Check className="h-4 w-4 mr-2" /> Your ICP is ready — Save to Platform</>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            disabled={saving || !hasAnyData}
            variant="outline"
            className="w-full"
            size="lg"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
            ) : hasAnyData ? (
              <><Save className="h-4 w-4 mr-2" /> Save Draft to Platform</>
            ) : (
              <span className="text-muted-foreground">Chat to start building your ICP</span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
