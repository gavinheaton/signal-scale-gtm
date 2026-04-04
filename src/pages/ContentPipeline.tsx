import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { CampaignAsset, Campaign, AssetStatus, AssetType } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Navigate } from 'react-router-dom';

const statusColors: Record<AssetStatus, string> = {
  brief: 'bg-gray-100 text-gray-700',
  draft: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  published: 'bg-teal-100 text-teal-700',
};

export default function ContentPipeline() {
  const { currentProject } = useProject();
  const [assets, setAssets] = useState<(CampaignAsset & { campaign_name?: string })[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selected, setSelected] = useState<CampaignAsset | null>(null);

  useEffect(() => {
    if (!currentProject) return;
    const fetch = async () => {
      const { data: cData } = await supabase.from('campaigns').select('*').eq('project_id', currentProject.id);
      const campaignList = (cData || []) as unknown as Campaign[];
      setCampaigns(campaignList);
      const ids = campaignList.map(c => c.id);
      if (ids.length === 0) { setLoading(false); return; }
      const { data: aData } = await supabase.from('campaign_assets').select('*').in('campaign_id', ids);
      if (aData) {
        setAssets((aData as unknown as CampaignAsset[]).map(a => ({
          ...a,
          campaign_name: campaignList.find(c => c.id === a.campaign_id)?.name || '',
        })));
      }
      setLoading(false);
    };
    fetch();
  }, [currentProject]);

  if (!currentProject) return <Navigate to="/projects" replace />;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const filtered = assets.filter(a =>
    (statusFilter === 'all' || a.status === statusFilter) &&
    (typeFilter === 'all' || a.asset_type === typeFilter)
  );

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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Publish Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map(a => (
            <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelected(a)}>
              <TableCell className="font-medium">{a.title}</TableCell>
              <TableCell><Badge variant="outline">{a.asset_type.replace('_', ' ')}</Badge></TableCell>
              <TableCell className="text-sm">{(a as any).campaign_name}</TableCell>
              <TableCell><Badge className={statusColors[a.status]}>{a.status}</Badge></TableCell>
              <TableCell className="text-sm">{a.publish_date ? new Date(a.publish_date).toLocaleDateString() : '—'}</TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No assets found</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader><SheetTitle>{selected.title}</SheetTitle></SheetHeader>
              <div className="space-y-3 mt-4 text-sm">
                <div><strong>Type:</strong> {selected.asset_type.replace('_', ' ')}</div>
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
