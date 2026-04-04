import { CampaignAsset, AssetStatus } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';

interface CampaignMetricsSummaryProps {
  assets: CampaignAsset[];
}

const statusConfig: { status: AssetStatus; label: string; color: string }[] = [
  { status: 'brief', label: 'Brief', color: 'hsl(var(--muted-foreground))' },
  { status: 'draft', label: 'Draft', color: 'hsl(217 91% 60%)' },
  { status: 'review', label: 'Review', color: 'hsl(38 92% 50%)' },
  { status: 'approved', label: 'Approved', color: 'hsl(142 71% 45%)' },
  { status: 'published', label: 'Published', color: 'hsl(172 66% 50%)' },
];

export default function CampaignMetricsSummary({ assets }: CampaignMetricsSummaryProps) {
  const total = assets.length;
  const published = assets.filter(a => a.status === 'published').length;
  const withContent = assets.filter(a => a.content).length;
  const notionSynced = assets.filter(a => a.notion_url).length;
  const pastBrief = assets.filter(a => a.status !== 'brief').length;
  const progressPct = total > 0 ? (pastBrief / total) * 100 : 0;

  const counts = statusConfig.map(s => ({
    ...s,
    count: assets.filter(a => a.status === s.status).length,
  }));

  // SVG ring
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progressPct / 100) * circumference;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Pipeline Progress Ring */}
      <Card>
        <CardContent className="pt-4 pb-3 flex items-center gap-3">
          <svg width="68" height="68" className="flex-shrink-0">
            <circle cx="34" cy="34" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
            <circle
              cx="34" cy="34" r={radius} fill="none"
              stroke="hsl(var(--primary))" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 34 34)"
              className="transition-all duration-500"
            />
            <text x="34" y="38" textAnchor="middle" className="fill-foreground text-xs font-bold">
              {Math.round(progressPct)}%
            </text>
          </svg>
          <div>
            <p className="text-xs text-muted-foreground">Pipeline Progress</p>
            <p className="text-lg font-bold">{pastBrief}/{total}</p>
            <p className="text-[10px] text-muted-foreground">past brief stage</p>
          </div>
        </CardContent>
      </Card>

      {/* Published count */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Published</p>
          <p className="text-2xl font-bold" style={{ color: 'hsl(172 66% 50%)' }}>{published}</p>
          <p className="text-[10px] text-muted-foreground mt-1">of {total} assets</p>
        </CardContent>
      </Card>

      {/* Content & Notion */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Content Ready</p>
          <p className="text-2xl font-bold text-foreground">{withContent}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {notionSynced} synced to Notion
          </p>
        </CardContent>
      </Card>

      {/* Status breakdown bar */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground mb-2">Status Breakdown</p>
          {total > 0 ? (
            <>
              <div className="flex h-3 rounded-full overflow-hidden">
                {counts.map(s => s.count > 0 && (
                  <div
                    key={s.status}
                    className="transition-all"
                    style={{
                      width: `${(s.count / total) * 100}%`,
                      backgroundColor: s.color,
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-2 mt-1.5">
                {counts.filter(s => s.count > 0).map(s => (
                  <span key={s.status} className="text-[9px] flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                    {s.label} {s.count}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No assets</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
