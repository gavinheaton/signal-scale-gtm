import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ExternalLink, Save, Loader2, CheckCircle2, Circle, CircleDot, Download, CalendarIcon } from 'lucide-react';
import { CampaignDraft, CAMPAIGN_SECTIONS, getCampaignSectionStatus } from './types';
import { format, parseISO } from 'date-fns';

interface CampaignPreviewPanelProps {
  draft: CampaignDraft;
  saving: boolean;
  onSave: () => void;
  onSaveDraft: () => void;
  onNameChange: (name: string) => void;
  notionUrl: string | null;
}

export function CampaignPreviewPanel({ draft, saving, onSave, onSaveDraft, onNameChange, notionUrl }: CampaignPreviewPanelProps) {
  const calendar = draft.content_calendar || [];
  const captureCount = calendar.filter(c => c.track === 'demand_capture').length;
  const creationCount = calendar.filter(c => c.track === 'demand_creation').length;
  const totalAssets = captureCount + creationCount;
  const creationPct = totalAssets > 0 ? Math.round((creationCount / totalAssets) * 100) : 0;
  const capturePct = totalAssets > 0 ? 100 - creationPct : 0;

  const completedCount = CAMPAIGN_SECTIONS.filter(s => getCampaignSectionStatus(draft, s.key) === 'complete').length;
  const hasDraftContent = !!(draft.campaign_name || draft.track);

  return (
    <div className="flex flex-col h-full overflow-y-auto space-y-4">
      {/* Campaign Name */}
      <div>
        <Input
          value={draft.campaign_name || ''}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Campaign Name"
          className="text-lg font-bold border-none bg-transparent px-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Track Badge */}
      {draft.track && (
        <div>
          {draft.track === 'demand_capture' ? (
            <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
              Demand Capture (5%)
            </Badge>
          ) : (
            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
              Demand Creation (95%)
            </Badge>
          )}
        </div>
      )}

      {/* Progress */}
      <p className="text-xs text-muted-foreground">{completedCount}/{CAMPAIGN_SECTIONS.length} sections complete</p>

      {/* Section Cards */}
      <div className="grid grid-cols-2 gap-2">
        {CAMPAIGN_SECTIONS.map(section => {
          const status = getCampaignSectionStatus(draft, section.key);
          const StatusIcon = status === 'complete' ? CheckCircle2 : status === 'partial' ? CircleDot : Circle;
          return (
            <Card key={section.key} className={`${status === 'complete' ? 'border-green-300 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10' : status === 'partial' ? 'border-primary/30' : ''}`}>
              <CardContent className="p-3 flex items-center gap-2">
                <span className="text-base">{section.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{section.label}</p>
                </div>
                <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${status === 'complete' ? 'text-green-600' : status === 'partial' ? 'text-primary' : 'text-muted-foreground/40'}`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Content Calendar Table */}
      {calendar.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Content Calendar</h3>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Title</th>
                  <th className="text-left p-2 font-medium">Format</th>
                  <th className="text-left p-2 font-medium">Persona</th>
                  <th className="text-left p-2 font-medium">Week</th>
                </tr>
              </thead>
              <tbody>
                {calendar.map((item, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{item.title}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-[10px]">{item.format}</Badge>
                    </td>
                    <td className="p-2 text-muted-foreground">{item.persona}</td>
                    <td className="p-2 text-muted-foreground">{item.week}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 95-5 Balance Bar */}
      {totalAssets > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">95-5 Balance</h3>
          <div className="h-4 rounded-full overflow-hidden flex bg-muted">
            {capturePct > 0 && (
              <div className="bg-orange-400 transition-all" style={{ width: `${capturePct}%` }} />
            )}
            <div className="bg-purple-500 flex-1" />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>Capture: {capturePct}%</span>
            <span>Creation: {creationPct}%</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-auto pt-4 space-y-2">
        <Button
          onClick={onSaveDraft}
          disabled={!hasDraftContent || saving}
          variant="outline"
          className="w-full"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Save Draft
        </Button>
        <Button
          onClick={onSave}
          disabled={!draft.is_complete || saving}
          className="w-full"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Finalize Campaign
        </Button>
        {notionUrl && (
          <Button variant="outline" className="w-full" asChild>
            <a href={notionUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Brief in Notion
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
