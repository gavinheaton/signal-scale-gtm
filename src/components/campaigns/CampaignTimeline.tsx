import { Campaign, CampaignAsset } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';

interface CampaignTimelineProps {
  campaign: Campaign;
  assets: CampaignAsset[];
}

const phases = [
  { label: 'Foundation & Drafting', color: 'hsl(var(--muted))' },
  { label: 'Review & Approval', color: 'hsl(217 60% 30% / 0.15)' },
  { label: 'Publishing & Lead Gen', color: 'hsl(142 60% 40% / 0.15)' },
];

export default function CampaignTimeline({ campaign, assets }: CampaignTimelineProps) {
  if (!campaign.launch_date || !campaign.end_date) return null;

  const start = new Date(campaign.launch_date).getTime();
  const end = new Date(campaign.end_date).getTime();
  const range = end - start;
  if (range <= 0) return null;

  const now = Date.now();
  const todayPct = Math.min(100, Math.max(0, ((now - start) / range) * 100));

  const assetsWithDates = assets
    .filter(a => a.publish_date)
    .map(a => ({
      ...a,
      pct: Math.min(100, Math.max(0, ((new Date(a.publish_date!).getTime() - start) / range) * 100)),
    }));

  const statusDotColor: Record<string, string> = {
    brief: 'bg-muted-foreground',
    draft: 'bg-blue-500',
    review: 'bg-amber-500',
    approved: 'bg-green-500',
    published: 'bg-teal-500',
  };

  return (
    <Card>
      <CardContent className="pt-6 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            {new Date(campaign.launch_date).toLocaleDateString()}
          </span>
          <span className="text-xs font-semibold" style={{ color: 'hsl(var(--orange))' }}>
            Campaign Timeline
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {new Date(campaign.end_date).toLocaleDateString()}
          </span>
        </div>

        {/* Phase bar */}
        <div className="relative h-10 rounded-lg overflow-hidden flex">
          {phases.map((phase, i) => (
            <div
              key={i}
              className="flex-1 flex items-center justify-center border-r last:border-r-0 border-background/50"
              style={{ backgroundColor: phase.color }}
            >
              <span className="text-[10px] font-medium text-muted-foreground truncate px-1">
                {phase.label}
              </span>
            </div>
          ))}

          {/* Today marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
            style={{ left: `${todayPct}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-primary whitespace-nowrap">
              Today
            </div>
          </div>
        </div>

        {/* Asset milestone dots */}
        {assetsWithDates.length > 0 && (
          <div className="relative h-5 mt-3">
            {assetsWithDates.map(a => (
              <div
                key={a.id}
                className="absolute top-0 -translate-x-1/2 group"
                style={{ left: `${a.pct}%` }}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${statusDotColor[a.status] || 'bg-muted-foreground'} ring-2 ring-background cursor-pointer`}
                  title={`${a.title} (${a.asset_type.replace(/_/g, ' ')})`}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
