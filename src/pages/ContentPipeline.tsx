import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { CampaignAsset, Campaign, AssetStatus } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const statusColors: Record<AssetStatus, string> = {
  brief: 'bg-gray-100 text-gray-700',
  draft: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  published: 'bg-teal-100 text-teal-700',
};

const campaignStatusColors: Record<string, string> = {
  brief: 'bg-gray-100 text-gray-700',
  planning: 'bg-purple-100 text-purple-700',
  active: 'bg-green-100 text-green-700',
  complete: 'bg-teal-100 text-teal-700',
};

function formatDateRange(launch?: string | null, end?: string | null) {
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!launch && !end) return 'No dates set';
  if (launch && end) return `${fmt(launch)} → ${fmt(end)}`;
  if (launch) return `From ${fmt(launch)}`;
  return `Until ${fmt(end!)}`;
}

export default function ContentPipeline() {
  const { currentProject } = useProject();
  const [assets, setAssets] = useState<CampaignAsset[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selected, setSelected] = useState<CampaignAsset | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentProject) return;
    const fetchData = async () => {
      const { data: cData } = await supabase.from('campaigns').select('*').eq('project_id', currentProject.id);
      const campaignList = (cData || []) as unknown as Campaign[];
      // Sort by launch_date desc, nulls last
      campaignList.sort((a, b) => {
        if (!a.launch_date && !b.launch_date) return 0;
        if (!a.launch_date) return 1;
        if (!b.launch_date) return -1;
        return new Date(b.launch_date).getTime() - new Date(a.launch_date).getTime();
      });
      setCampaigns(campaignList);
      // Expand the most recent campaign by default
      if (campaignList.length > 0) setExpanded(new Set([campaignList[0].id]));
      const ids = campaignList.map(c => c.id);
      if (ids.length === 0) { setLoading(false); return; }
      const { data: aData } = await supabase.from('campaign_assets').select('*').in('campaign_id', ids);
      if (aData) setAssets(aData as unknown as CampaignAsset[]);
      setLoading(false);
    };
    fetchData();
  }, [currentProject]);

  const filteredByCampaign = useMemo(() => {
    const map = new Map<string, CampaignAsset[]>();
    const totals = new Map<string, number>();
    for (const c of campaigns) {
      map.set(c.id, []);
      totals.set(c.id, 0);
    }
    for (const a of assets) {
      totals.set(a.campaign_id, (totals.get(a.campaign_id) ?? 0) + 1);
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      const matchesType = typeFilter === 'all' || a.asset_type === typeFilter;
      if (matchesStatus && matchesType) {
        map.get(a.campaign_id)?.push(a);
      }
    }
    // Sort assets within each group by publish_date asc (nulls last), then sequence_order
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.publish_date && b.publish_date) return new Date(a.publish_date).getTime() - new Date(b.publish_date).getTime();
        if (a.publish_date) return -1;
        if (b.publish_date) return 1;
        return (a.sequence_order ?? 0) - (b.sequence_order ?? 0);
      });
    }
    return { map, totals };
  }, [assets, campaigns, statusFilter, typeFilter]);

  if (!currentProject) return <Navigate to="/projects" replace />;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const visibleCampaigns = campaigns.filter(c => {
    const filteredCount = filteredByCampaign.map.get(c.id)?.length ?? 0;
    const total = filteredByCampaign.totals.get(c.id) ?? 0;
    // Hide campaigns that have assets but none match the filters
    if (total > 0 && filteredCount === 0) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Content Pipeline</h1>
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(['brief', 'draft', 'review', 'approved', 'published'] as const).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(['blog', 'video', 'podcast', 'linkedin_post', 'email', 'webinar', 'whitepaper', 'press_release'] as const).map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 border rounded-lg">
          No campaigns yet — create a campaign to start building your content pipeline.
        </div>
      ) : visibleCampaigns.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 border rounded-lg">
          No assets match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleCampaigns.map(c => {
            const items = filteredByCampaign.map.get(c.id) ?? [];
            const total = filteredByCampaign.totals.get(c.id) ?? 0;
            const isOpen = expanded.has(c.id);
            const isEmpty = total === 0;
            return (
              <Collapsible key={c.id} open={isOpen} onOpenChange={() => toggle(c.id)}>
                <div className={`border rounded-lg ${isEmpty ? 'opacity-60' : ''}`}>
                  <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="font-semibold text-foreground">{c.name}</span>
                    <Badge className={campaignStatusColors[c.status] ?? ''}>{c.status}</Badge>
                    <span className="text-sm text-muted-foreground ml-auto">
                      {formatDateRange(c.launch_date, c.end_date)} · {total === items.length ? `${total} assets` : `${items.length} / ${total} assets`}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {isEmpty ? (
                      <div className="px-4 py-6 text-sm text-muted-foreground border-t">No assets in this campaign yet.</div>
                    ) : (
                      <div className="border-t">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Title</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Publish Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map(a => (
                              <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelected(a)}>
                                <TableCell className="font-medium">{a.title}</TableCell>
                                <TableCell><Badge variant="outline">{a.asset_type.replace(/_/g, ' ')}</Badge></TableCell>
                                <TableCell><Badge className={statusColors[a.status]}>{a.status}</Badge></TableCell>
                                <TableCell className="text-sm">{a.publish_date ? new Date(a.publish_date).toLocaleDateString() : '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader><SheetTitle>{selected.title}</SheetTitle></SheetHeader>
              <div className="space-y-3 mt-4 text-sm">
                <div><strong>Type:</strong> {selected.asset_type.replace(/_/g, ' ')}</div>
                <div><strong>Status:</strong> <Badge className={statusColors[selected.status]}>{selected.status}</Badge></div>
                <div><strong>Publish Date:</strong> {selected.publish_date ? new Date(selected.publish_date).toLocaleDateString() : '—'}</div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
