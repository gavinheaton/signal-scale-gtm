import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Campaign, ICP, CampaignAsset, AssetStatus, CampaignStatus } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, Sparkles, ExternalLink, Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import AssetDetailDrawer from '@/components/campaigns/AssetDetailDrawer';
import CampaignTimeline from '@/components/campaigns/CampaignTimeline';
import CampaignMetricsSummary from '@/components/campaigns/CampaignMetricsSummary';

const statusColumns: CampaignStatus[] = ['brief', 'planning', 'active', 'complete'];
const trackColors = { demand_capture: 'bg-orange-100 text-orange-800', demand_creation: 'bg-purple-100 text-purple-800' };

const assetStatusColors: Record<AssetStatus, string> = {
  brief: 'bg-muted text-muted-foreground',
  draft: 'bg-blue-100 text-blue-800',
  review: 'bg-orange-100 text-orange-800',
  approved: 'bg-green-100 text-green-800',
  published: 'bg-purple-100 text-purple-800',
};

export default function Campaigns() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [icps, setIcps] = useState<ICP[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [assets, setAssets] = useState<CampaignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<CampaignAsset | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkPushing, setBulkPushing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  const fetchData = async () => {
    if (!currentProject) return;
    const [{ data: cData }, { data: iData }] = await Promise.all([
      supabase.from('campaigns').select('*').eq('project_id', currentProject.id),
      supabase.from('icps').select('*').eq('project_id', currentProject.id),
    ]);
    if (cData) setCampaigns(cData as unknown as Campaign[]);
    if (iData) setIcps(iData as unknown as ICP[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [currentProject]);

  const fetchAssets = async () => {
    if (!selectedCampaign) return;
    const { data } = await supabase.from('campaign_assets').select('*').eq('campaign_id', selectedCampaign.id);
    if (data) setAssets(data as unknown as CampaignAsset[]);
  };

  useEffect(() => { fetchAssets(); }, [selectedCampaign]);

  const handleBulkGenerate = async () => {
    if (!selectedCampaign) return;
    setBulkGenerating(true);
    setBulkProgress(10);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-generate-campaign-content', {
        body: { campaign_id: selectedCampaign.id },
      });
      if (error) throw error;
      setBulkProgress(100);
      toast.success(`Generated content for ${data.generated} assets${data.failed > 0 ? ` (${data.failed} failed)` : ''}`);
      fetchAssets();
    } catch (err: any) {
      toast.error(err.message || 'Bulk generation failed');
    } finally {
      setBulkGenerating(false);
      setTimeout(() => setBulkProgress(0), 1500);
    }
  };

  const handleBulkPush = async () => {
    if (!selectedCampaign) return;
    setBulkPushing(true);
    setBulkProgress(10);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-push-campaign-to-notion', {
        body: { campaign_id: selectedCampaign.id },
      });
      if (error) throw error;
      setBulkProgress(100);
      toast.success(`Pushed ${data.assets_pushed} assets to Notion`);
      if (data.notion_url) {
        // Update local campaign state
        setSelectedCampaign(prev => prev ? { ...prev, notion_url: data.notion_url } : null);
      }
      fetchAssets();
    } catch (err: any) {
      toast.error(err.message || 'Bulk push failed');
    } finally {
      setBulkPushing(false);
      setTimeout(() => setBulkProgress(0), 1500);
    }
  };

  const briefCount = assets.filter(a => a.status === 'brief').length;
  const pushableCount = assets.filter(a => a.content && !a.notion_url).length;
  const alreadyPushed = assets.filter(a => a.notion_url).length;

  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const captureActive = activeCampaigns.filter(c => c.track === 'demand_capture').length;
  const creationActive = activeCampaigns.filter(c => c.track === 'demand_creation').length;
  const total = captureActive + creationActive;
  const capturePercent = total > 0 ? (captureActive / total * 100) : 0;

  // Campaign detail view
  if (selectedCampaign) {
    const assetStatuses: AssetStatus[] = ['brief', 'draft', 'review', 'approved', 'published'];
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedCampaign(null)}>← Back to Campaigns</Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selectedCampaign.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={trackColors[selectedCampaign.track]}>{selectedCampaign.track.replace(/_/g, ' ')}</Badge>
              <Badge variant="outline">{selectedCampaign.status}</Badge>
              <span className="text-sm text-muted-foreground">{assets.length} assets</span>
            </div>
          </div>
          {selectedCampaign.notion_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={selectedCampaign.notion_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" /> View in Notion
              </a>
            </Button>
          )}
        </div>

        {selectedCampaign.objective && (
          <Card><CardContent className="pt-6"><p className="text-sm">{selectedCampaign.objective}</p></CardContent></Card>
        )}

        {/* Bulk actions toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleBulkGenerate} disabled={bulkGenerating || briefCount === 0}>
            {bulkGenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Generate All Content {briefCount > 0 && `(${briefCount})`}
          </Button>
          <Button variant="outline" onClick={handleBulkPush} disabled={bulkPushing || pushableCount === 0}>
            {bulkPushing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />}
            Push to Notion {pushableCount > 0 && `(${pushableCount})`}
          </Button>
          {alreadyPushed > 0 && (
            <span className="text-xs text-muted-foreground">{alreadyPushed} already in Notion</span>
          )}
          {(bulkGenerating || bulkPushing) && (
            <div className="flex-1 min-w-[120px]">
              <Progress value={bulkProgress} className="h-2" />
            </div>
          )}
        </div>

        {/* Asset pipeline kanban */}
        <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--orange))' }}>Asset Pipeline</h2>
        <div className="grid grid-cols-5 gap-3">
          {assetStatuses.map(s => (
            <div key={s} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">{s}</h3>
              {assets.filter(a => a.status === s).map(a => (
                <Card
                  key={a.id}
                  className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => { setSelectedAsset(a); setDrawerOpen(true); }}
                >
                  <p className="text-sm font-medium">{a.title}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Badge variant="outline" className="text-[10px]">{a.asset_type.replace(/_/g, ' ')}</Badge>
                    <Badge className={`${assetStatusColors[a.status]} text-[10px]`}>{a.status}</Badge>
                  </div>
                  {a.content && <span className="text-[10px] text-green-600 mt-1 block">✓ Content</span>}
                  {a.notion_url && <span className="text-[10px] text-blue-600 block">✓ Notion</span>}
                </Card>
              ))}
            </div>
          ))}
        </div>

        <AssetDetailDrawer
          asset={selectedAsset}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onUpdated={() => { fetchAssets(); }}
        />
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
        <Button onClick={() => navigate('/project/campaign-wizard')}><Plus className="h-4 w-4 mr-1" /> New Campaign</Button>
      </div>

      {total > 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium mb-2">Your 95-5 Balance</p>
            <div className="h-4 rounded-full overflow-hidden flex bg-muted">
              <div className="bg-orange-400 transition-all" style={{ width: `${capturePercent}%` }} />
              <div className="bg-purple-500 flex-1" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Capture: {captureActive}</span>
              <span>Creation: {creationActive}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-4">
        {statusColumns.map(status => (
          <div key={status}>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3">{status}</h3>
            <div className="space-y-3">
              {campaigns.filter(c => c.status === status).map(c => (
                <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedCampaign(c)}>
                  <CardContent className="pt-4 pb-3">
                    <p className="font-medium text-sm mb-2">{c.name}</p>
                    <Badge className={`${trackColors[c.track]} text-[10px]`}>{c.track.replace(/_/g, ' ')}</Badge>
                    {c.launch_date && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />{new Date(c.launch_date).toLocaleDateString()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
