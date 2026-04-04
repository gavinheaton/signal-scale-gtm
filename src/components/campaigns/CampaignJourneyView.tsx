import { useMemo, useRef, useCallback } from 'react';
import { Campaign, CampaignAsset, AssetStatus, AssetType } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, Linkedin, FileText, Video, PenLine, AlertTriangle, Plus } from 'lucide-react';

type Swimlane = 'LinkedIn' | 'Email' | 'Whitepaper / Report' | 'Webinar / Event' | 'Other';

const SWIMLANES: Swimlane[] = ['LinkedIn', 'Email', 'Whitepaper / Report', 'Webinar / Event', 'Other'];

const SWIMLANE_ICONS: Record<Swimlane, React.ReactNode> = {
  LinkedIn: <Linkedin className="h-4 w-4" />,
  Email: <Mail className="h-4 w-4" />,
  'Whitepaper / Report': <FileText className="h-4 w-4" />,
  'Webinar / Event': <Video className="h-4 w-4" />,
  Other: <PenLine className="h-4 w-4" />,
};

const STATUS_BORDER: Record<AssetStatus, string> = {
  brief: 'border-muted-foreground/50',
  draft: 'border-blue-500',
  review: 'border-orange-500',
  approved: 'border-green-500',
  published: 'border-teal-500',
};

function getSwimlaneName(type: AssetType): Swimlane {
  switch (type) {
    case 'linkedin_post': return 'LinkedIn';
    case 'email': return 'Email';
    case 'whitepaper':
    case 'press_release': return 'Whitepaper / Report';
    case 'webinar':
    case 'video':
    case 'podcast': return 'Webinar / Event';
    default: return 'Other';
  }
}

function daysBetween(a: Date, b: Date) {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

interface Props {
  campaign: Campaign;
  assets: CampaignAsset[];
  onAssetClick: (asset: CampaignAsset) => void;
  onRefresh: () => void;
  onSwitchTab?: () => void;
}

export default function CampaignJourneyView({ campaign, assets, onAssetClick, onRefresh, onSwitchTab }: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);

  const startDate = campaign.launch_date ? new Date(campaign.launch_date) : null;
  const endDate = campaign.end_date ? new Date(campaign.end_date) : null;

  const datedAssets = useMemo(() =>
    assets.filter(a => a.publish_date).sort((a, b) =>
      new Date(a.publish_date!).getTime() - new Date(b.publish_date!).getTime()
    ), [assets]);

  // Summary stats
  const stats = useMemo(() => {
    const total = datedAssets.length;
    if (total < 2) return { total, avg: 0, longest: 0 };
    let maxGap = 0;
    let totalDays = 0;
    for (let i = 1; i < datedAssets.length; i++) {
      const gap = daysBetween(new Date(datedAssets[i - 1].publish_date!), new Date(datedAssets[i].publish_date!));
      totalDays += gap;
      if (gap > maxGap) maxGap = gap;
    }
    return { total, avg: Math.round(totalDays / (total - 1)), longest: maxGap };
  }, [datedAssets]);

  // 95-5 balance — count assets by track inference (not available per-asset, use campaign track)
  const balanceLabel = campaign.track === 'demand_creation' ? '100% Creation' : '100% Capture';

  // Week markers
  const weeks = useMemo(() => {
    if (!startDate || !endDate) return [];
    const result: { pct: number; label: string }[] = [];
    const s = startDate.getTime();
    const range = endDate.getTime() - s;
    if (range <= 0) return [];
    let cursor = new Date(startDate);
    while (cursor.getTime() <= endDate.getTime()) {
      const pct = ((cursor.getTime() - s) / range) * 100;
      result.push({ pct, label: cursor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    return result;
  }, [startDate, endDate]);

  // Journey stage widths
  const stageWidths = useMemo(() => {
    if (campaign.track === 'demand_creation') return { awareness: 40, nurture: 40, conversion: 20 };
    if (campaign.track === 'demand_capture') return { awareness: 20, nurture: 30, conversion: 50 };
    return { awareness: 33, nurture: 33, conversion: 34 };
  }, [campaign.track]);

  // Swimlane data
  const swimlaneData = useMemo(() => {
    const map: Record<Swimlane, CampaignAsset[]> = {
      LinkedIn: [], Email: [], 'Whitepaper / Report': [], 'Webinar / Event': [], Other: [],
    };
    datedAssets.forEach(a => map[getSwimlaneName(a.asset_type)].push(a));
    return map;
  }, [datedAssets]);

  // Gap detection per swimlane
  const swimlaneGaps = useMemo(() => {
    const gaps: Record<Swimlane, { midDate: Date; days: number }[]> = {
      LinkedIn: [], Email: [], 'Whitepaper / Report': [], 'Webinar / Event': [], Other: [],
    };
    SWIMLANES.forEach(lane => {
      const items = swimlaneData[lane];
      for (let i = 1; i < items.length; i++) {
        const d1 = new Date(items[i - 1].publish_date!);
        const d2 = new Date(items[i].publish_date!);
        const days = daysBetween(d1, d2);
        if (days > 14) {
          gaps[lane].push({ midDate: new Date((d1.getTime() + d2.getTime()) / 2), days });
        }
      }
    });
    return gaps;
  }, [swimlaneData]);

  // Cross-channel gap
  const crossChannelGap = useMemo(() => {
    if (datedAssets.length < 2) return null;
    let maxGapStart: Date | null = null;
    let maxGapEnd: Date | null = null;
    let maxDays = 0;
    for (let i = 1; i < datedAssets.length; i++) {
      const d1 = new Date(datedAssets[i - 1].publish_date!);
      const d2 = new Date(datedAssets[i].publish_date!);
      const days = daysBetween(d1, d2);
      if (days > maxDays) { maxDays = days; maxGapStart = d1; maxGapEnd = d2; }
    }
    if (maxDays > 7 && maxGapStart && maxGapEnd) return { start: maxGapStart, end: maxGapEnd, days: maxDays };
    return null;
  }, [datedAssets]);

  const getPct = useCallback((date: Date) => {
    if (!startDate || !endDate) return 0;
    const range = endDate.getTime() - startDate.getTime();
    if (range <= 0) return 0;
    return Math.min(100, Math.max(0, ((date.getTime() - startDate.getTime()) / range) * 100));
  }, [startDate, endDate]);

  // Drag to reschedule
  const handleDrop = useCallback(async (e: React.DragEvent, _lane: Swimlane) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData('assetId');
    if (!assetId || !timelineRef.current || !startDate || !endDate) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, x / rect.width));
    const range = endDate.getTime() - startDate.getTime();
    const newDate = new Date(startDate.getTime() + pct * range);
    const formatted = newDate.toISOString().split('T')[0];
    const { error } = await supabase.from('campaign_assets').update({ publish_date: formatted }).eq('id', assetId);
    if (error) { toast.error('Failed to reschedule'); return; }
    toast.success(`Rescheduled to ${newDate.toLocaleDateString()}`);
    onRefresh();
  }, [startDate, endDate, onRefresh]);

  // Empty state
  if (!startDate || !endDate) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground mb-4">Set launch and end dates on this campaign to see the Journey View.</p>
      </div>
    );
  }

  if (datedAssets.length < 3) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground mb-4">Add publish dates to your assets to see the journey view.</p>
        {onSwitchTab && <Button variant="outline" onClick={onSwitchTab}>Go to Pipeline</Button>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="outline" className="px-3 py-1.5 text-sm">
          Total touchpoints: {stats.total}
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-sm">
          Avg. {stats.avg} days between
        </Badge>
        <Badge variant="outline" className={`px-3 py-1.5 text-sm ${stats.longest > 14 ? 'border-destructive text-destructive' : ''}`}>
          Longest gap: {stats.longest} days
        </Badge>
        <Badge variant="outline" className="px-3 py-1.5 text-sm">
          {balanceLabel}
        </Badge>
      </div>

      {/* Journey stage overlay */}
      <div className="flex rounded-md overflow-hidden h-6 text-[10px] font-semibold">
        <div className="flex items-center justify-center bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" style={{ width: `${stageWidths.awareness}%` }}>
          Awareness
        </div>
        <div className="flex items-center justify-center bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" style={{ width: `${stageWidths.nurture}%` }}>
          Nurture
        </div>
        <div className="flex items-center justify-center bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" style={{ width: `${stageWidths.conversion}%` }}>
          Conversion
        </div>
      </div>

      {/* Timeline + swimlanes container */}
      <div className="relative overflow-x-auto border rounded-lg bg-card" ref={timelineRef}>
        {/* Week markers */}
        <div className="relative h-8 border-b bg-muted/30">
          {weeks.map((w, i) => (
            <div key={i} className="absolute top-0 h-full flex flex-col items-center" style={{ left: `${w.pct}%` }}>
              <div className="w-px h-full bg-border" />
              <span className="text-[9px] text-muted-foreground whitespace-nowrap -translate-x-1/2 absolute -bottom-4">
                {w.label}
              </span>
            </div>
          ))}
        </div>

        {/* Cross-channel gap band */}
        {crossChannelGap && (
          <div
            className="absolute top-8 bottom-0 bg-destructive/10 border-l border-r border-destructive/30 z-10 flex items-start justify-center pt-2"
            style={{
              left: `${getPct(crossChannelGap.start)}%`,
              width: `${getPct(crossChannelGap.end) - getPct(crossChannelGap.start)}%`,
            }}
          >
            <span className="text-[9px] font-medium text-destructive bg-card/80 px-1.5 py-0.5 rounded">
              No touchpoints ({crossChannelGap.days}d)
            </span>
          </div>
        )}

        {/* Swimlanes */}
        <div className="pt-5">
          {SWIMLANES.map(lane => {
            const laneAssets = swimlaneData[lane];
            const laneGaps = swimlaneGaps[lane];
            return (
              <div
                key={lane}
                className="relative flex items-stretch border-b last:border-b-0 min-h-[72px]"
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, lane)}
              >
                {/* Lane label */}
                <div className="w-[120px] shrink-0 flex items-center gap-1.5 px-3 bg-muted/20 border-r text-xs font-medium text-muted-foreground">
                  {SWIMLANE_ICONS[lane]}
                  {lane}
                </div>

                {/* Lane timeline area */}
                <div className="flex-1 relative min-h-[72px]">
                  {/* Week grid lines */}
                  {weeks.map((w, i) => (
                    <div key={i} className="absolute top-0 bottom-0 w-px bg-border/40" style={{ left: `${w.pct}%` }} />
                  ))}

                  {/* Asset cards */}
                  {laneAssets.map(asset => {
                    const pct = getPct(new Date(asset.publish_date!));
                    return (
                      <div
                        key={asset.id}
                        draggable
                        onDragStart={e => e.dataTransfer.setData('assetId', asset.id)}
                        className={`absolute top-2 w-[120px] cursor-pointer transition-shadow hover:shadow-md z-20`}
                        style={{ left: `calc(${pct}% - 60px)` }}
                        onClick={() => onAssetClick(asset)}
                      >
                        <Card className={`p-2 border-2 ${STATUS_BORDER[asset.status]} bg-card`}>
                          <p className="text-[11px] font-medium truncate">{asset.title}</p>
                          <Badge className="text-[9px] mt-1" variant="outline">
                            {asset.asset_type.replace(/_/g, ' ')}
                          </Badge>
                        </Card>
                      </div>
                    );
                  })}

                  {/* Gap placeholders */}
                  {laneGaps.map((gap, i) => {
                    const pct = getPct(gap.midDate);
                    return (
                      <div
                        key={`gap-${i}`}
                        className="absolute top-2 w-[120px] z-20"
                        style={{ left: `calc(${pct}% - 60px)` }}
                      >
                        <div className="border-2 border-dashed border-amber-400/60 rounded-lg p-2 bg-amber-50/50 dark:bg-amber-950/20 text-center">
                          <div className="flex items-center justify-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            Gap: {gap.days}d
                          </div>
                          <button className="text-[9px] text-primary hover:underline flex items-center gap-0.5 mx-auto mt-1">
                            <Plus className="h-2.5 w-2.5" /> Add content
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
