import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Save, Sparkles } from 'lucide-react';
import { BRAND_VOICE_SECTIONS, getSectionStatus, type BrandVoiceDraft } from './types';

interface Props {
  draft: BrandVoiceDraft;
  saving: boolean;
  onSave: () => void;
  hasAnyData: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  complete: 'bg-green-500',
  partial: 'bg-amber-500',
  empty: 'bg-muted-foreground/20',
};

export function BrandVoicePreviewPanel({ draft, saving, onSave, hasAnyData }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const isComplete = draft.is_complete === true;

  useEffect(() => {
    if (isComplete) {
      setExpandedSections(new Set(BRAND_VOICE_SECTIONS.map(s => s.key)));
      panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isComplete]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const completedCount = BRAND_VOICE_SECTIONS.filter(s => getSectionStatus(draft, s.key) === 'complete').length;
  const partialCount = BRAND_VOICE_SECTIONS.filter(s => getSectionStatus(draft, s.key) === 'partial').length;
  const total = BRAND_VOICE_SECTIONS.length;
  const pct = Math.round(((completedCount + partialCount * 0.5) / total) * 100);

  return (
    <div ref={panelRef} className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {draft.brand_identity?.brand_name || 'Brand Voice'}
            </h2>
            {draft.personality_adjectives && draft.personality_adjectives.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {draft.personality_adjectives.map((adj, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{adj}</Badge>
                ))}
              </div>
            )}
          </div>
          <Sparkles className="h-5 w-5 text-muted-foreground/30" />
        </div>

        {/* Completion bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {completedCount} of {total} sections complete
              {partialCount > 0 && ` · ${partialCount} in progress`}
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
      </div>

      {/* Section cards */}
      <div className="space-y-2">
        {BRAND_VOICE_SECTIONS.map(section => {
          const status = getSectionStatus(draft, section.key);
          const isExpanded = expandedSections.has(section.key);
          const sectionData = (draft as any)[section.key];

          return (
            <div key={section.key} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
              >
                <div className={`h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} />
                <span className="text-sm">{section.icon}</span>
                <span className="text-sm font-medium flex-1">{section.label}</span>
                <span className="text-[10px] text-muted-foreground">{section.desc}</span>
              </button>
              {isExpanded && sectionData && (
                <div className="px-3 pb-3 text-xs text-muted-foreground">
                  <SectionContent sectionKey={section.key} data={sectionData} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="sticky bottom-0 pt-3 pb-1 bg-gradient-to-t from-card via-card to-transparent space-y-2">
        {isComplete ? (
          <Button
            onClick={onSave}
            disabled={saving}
            className="w-full animate-[pulse_2s_ease-in-out_infinite] shadow-lg shadow-primary/25"
            size="lg"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
            ) : (
              <><Check className="h-4 w-4 mr-2" /> Brand Voice Complete — Save</>
            )}
          </Button>
        ) : (
          <Button
            onClick={onSave}
            disabled={saving || !hasAnyData}
            variant="outline"
            className="w-full"
            size="lg"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
            ) : hasAnyData ? (
              <><Save className="h-4 w-4 mr-2" /> Save Draft</>
            ) : (
              <span className="text-muted-foreground">Chat to start building your brand voice</span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function SectionContent({ sectionKey, data }: { sectionKey: string; data: any }) {
  if (!data) return null;

  const safeString = (val: any): string => {
    if (typeof val === 'string') return val;
    if (val == null) return '';
    return JSON.stringify(val);
  };

  if (sectionKey === 'personality_adjectives' && Array.isArray(data)) {
    return <div className="flex flex-wrap gap-1">{data.map((a: any, i: number) => <Badge key={i} variant="outline" className="text-[10px]">{safeString(a)}</Badge>)}</div>;
  }
  if (sectionKey === 'tone_description' && typeof data === 'string') {
    return <p className="leading-relaxed">{data}</p>;
  }
  if (sectionKey === 'writing_principles' && Array.isArray(data)) {
    return (
      <div className="space-y-2">
        {data.map((p: any, i: number) => (
          <div key={i} className="border-l-2 border-primary/30 pl-2">
            <p className="font-medium text-foreground">{safeString(p.principle)}</p>
            <p>{safeString(p.explanation)}</p>
            {p.bad_example && <p className="text-destructive">✗ {safeString(p.bad_example)}</p>}
            {p.good_example && <p className="text-green-600">✓ {safeString(p.good_example)}</p>}
          </div>
        ))}
      </div>
    );
  }
  if ((sectionKey === 'banned_phrases' || sectionKey === 'formatting_rules') && Array.isArray(data)) {
    return <div className="flex flex-wrap gap-1">{data.map((p: any, i: number) => <Badge key={i} variant="outline" className="text-[10px]">{safeString(p)}</Badge>)}</div>;
  }
  if (sectionKey === 'preferred_vocabulary' && Array.isArray(data)) {
    return (
      <div className="space-y-1">
        {data.map((v: any, i: number) => (
          <p key={i}>Use "<span className="text-foreground font-medium">{safeString(v.use || v.phrase)}</span>" instead of "<span className="line-through">{safeString(v.instead_of || v.alternative)}</span>"</p>
        ))}
      </div>
    );
  }
  if (sectionKey === 'content_type_guidance' && typeof data === 'object') {
    return (
      <div className="space-y-1">
        {Object.entries(data).filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><span className="font-medium text-foreground">{k.replace(/_/g, ' ')}:</span> {v as string}</div>
        ))}
      </div>
    );
  }
  if (sectionKey === 'writing_samples' && Array.isArray(data)) {
    return (
      <div className="space-y-2">
        {data.map((s: any, i: number) => (
          <div key={i} className="bg-muted/50 rounded p-2">
            <p className="font-medium text-foreground mb-1">{s.type}</p>
            <p className="italic">"{s.sample}"</p>
          </div>
        ))}
      </div>
    );
  }
  if (sectionKey === 'target_audiences' && Array.isArray(data)) {
    return (
      <div className="space-y-1">
        {data.map((a: any, i: number) => (
          <div key={i}><span className="font-medium text-foreground">{a.segment}:</span> {a.tone_adjustment}</div>
        ))}
      </div>
    );
  }
  if (sectionKey === 'brand_identity' && typeof data === 'object') {
    return (
      <div className="space-y-1">
        {Object.entries(data).filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><span className="font-medium text-foreground">{k.replace(/_/g, ' ')}:</span> {v as string}</div>
        ))}
      </div>
    );
  }
  return <pre className="text-[10px] overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>;
}
