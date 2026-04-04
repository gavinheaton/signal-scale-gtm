import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Campaign, ICP, CampaignAsset, AssetStatus, CampaignStatus } from '@/types/database';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Calendar as CalendarIcon, Sparkles, ExternalLink, Loader2, ChevronRight, Trash2, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import AssetDetailDrawer from '@/components/campaigns/AssetDetailDrawer';
import CampaignTimeline from '@/components/campaigns/CampaignTimeline';
import CampaignMetricsSummary from '@/components/campaigns/CampaignMetricsSummary';
import CampaignJourneyView from '@/components/campaigns/CampaignJourneyView';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const statusColumns: CampaignStatus[] = ['brief', 'planning', 'active', 'complete'];
const trackColors = { demand_capture: 'bg-orange-100 text-orange-800', demand_creation: 'bg-purple-100 text-purple-800' };

const assetStatusColors: Record<AssetStatus, string> = {
  brief: 'bg-muted text-muted-foreground',
  draft: 'bg-blue-100 text-blue-800',
  review: 'bg-orange-100 text-orange-800',
  approved: 'bg-green-100 text-green-800',
  published: 'bg-purple-100 text-purple-800',
};

function CampaignDatePicker({ label, value, onChange }: { label: string; value: string | null; onChange: (date: Date | undefined) => void }) {
  const parsed = value ? parseISO(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-7 text-xs gap-1', !value && 'text-muted-foreground')}>
          <CalendarIcon className="h-3 w-3" />
          {value ? `${label}: ${format(parsed!, 'MMM d, yyyy')}` : `Set ${label} Date`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={parsed} onSelect={onChange} initialFocus className={cn('p-3 pointer-events-auto')} />
      </PopoverContent>
    </Popover>
  );
}

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
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleDeleteCampaign = async (campaign: Campaign) => {
    setDeleting(true);
    try {
      await supabase.from('campaign_metrics').delete().eq('campaign_id', campaign.id);
      await supabase.from('campaign_assets').delete().eq('campaign_id', campaign.id);
      const { error } = await supabase.from('campaigns').delete().eq('id', campaign.id);
      if (error) throw error;
      toast.success(`"${campaign.name}" deleted`);
      if (selectedCampaign?.id === campaign.id) setSelectedCampaign(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete campaign');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
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
            <div className="flex items-center gap-3 mt-2">
              <CampaignDatePicker
                label="Launch"
                value={selectedCampaign.launch_date}
                onChange={async (date) => {
                  const dateStr = date ? format(date, 'yyyy-MM-dd') : null;
                  const { error } = await supabase.from('campaigns').update({ launch_date: dateStr }).eq('id', selectedCampaign.id);
                  if (error) { toast.error('Failed to update launch date'); return; }
                  setSelectedCampaign(prev => prev ? { ...prev, launch_date: dateStr } : null);
                  setCampaigns(prev => prev.map(c => c.id === selectedCampaign.id ? { ...c, launch_date: dateStr } : c));
                }}
              />
              <CampaignDatePicker
                label="End"
                value={selectedCampaign.end_date}
                onChange={async (date) => {
                  const dateStr = date ? format(date, 'yyyy-MM-dd') : null;
                  const { error } = await supabase.from('campaigns').update({ end_date: dateStr }).eq('id', selectedCampaign.id);
                  if (error) { toast.error('Failed to update end date'); return; }
                  setSelectedCampaign(prev => prev ? { ...prev, end_date: dateStr } : null);
                  setCampaigns(prev => prev.map(c => c.id === selectedCampaign.id ? { ...c, end_date: dateStr } : c));
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedCampaign.notion_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={selectedCampaign.notion_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> View in Notion
                </a>
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(selectedCampaign)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
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

        <Tabs defaultValue="pipeline" className="w-full">
          <TabsList>
            <TabsTrigger value="pipeline">Asset Pipeline</TabsTrigger>
            <TabsTrigger value="journey">Journey View</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-6">
            {/* Campaign Timeline */}
            <CampaignTimeline campaign={selectedCampaign} assets={assets} />

            {/* Metrics Summary */}
            <CampaignMetricsSummary assets={assets} />

            {/* Asset pipeline kanban */}
            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--orange))' }}>Asset Pipeline</h2>
            <div className="grid grid-cols-5 gap-3">
              {assetStatuses.map((s, i) => {
                const columnColors: Record<AssetStatus, string> = {
                  brief: 'border-muted-foreground/30 bg-muted/30',
                  draft: 'border-blue-400/30 bg-blue-50/50 dark:bg-blue-950/20',
                  review: 'border-amber-400/30 bg-amber-50/50 dark:bg-amber-950/20',
                  approved: 'border-green-400/30 bg-green-50/50 dark:bg-green-950/20',
                  published: 'border-teal-400/30 bg-teal-50/50 dark:bg-teal-950/20',
                };
                const headerColors: Record<AssetStatus, string> = {
                  brief: 'bg-muted text-muted-foreground',
                  draft: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
                  review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                  approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
                  published: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
                };
                const colAssets = assets.filter(a => a.status === s);
                return (
                  <div key={s} className="space-y-2 relative">
                    <div className={`flex items-center justify-between rounded-md px-2 py-1.5 ${headerColors[s]}`}>
                      <h3 className="text-xs font-semibold uppercase">{s}</h3>
                      <span className="text-[10px] font-medium">{colAssets.length}</span>
                    </div>
                    {i < assetStatuses.length - 1 && (
                      <ChevronRight className="absolute -right-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground/50 z-10" />
                    )}
                    <div className={`rounded-lg border p-1.5 min-h-[120px] space-y-2 ${columnColors[s]}`}>
                      {colAssets.map(a => (
                        <Card
                          key={a.id}
                          className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => { setSelectedAsset(a); setDrawerOpen(true); }}
                        >
                          <p className="text-sm font-medium">{a.title}</p>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{a.asset_type.replace(/_/g, ' ')}</Badge>
                            <Badge className={`${assetStatusColors[a.status]} text-[10px]`}>{a.status}</Badge>
                          </div>
                          {a.publish_date && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                              <CalendarIcon className="h-2.5 w-2.5" />
                              {new Date(a.publish_date).toLocaleDateString()}
                            </div>
                          )}
                          <div className="flex gap-2 mt-1">
                            {a.content && <span className="text-[10px] text-green-600">✓ Content</span>}
                            {a.notion_url && <span className="text-[10px] text-blue-600">✓ Notion</span>}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="journey">
            <CampaignJourneyView
              campaign={selectedCampaign}
              assets={assets}
              onAssetClick={(a) => { setSelectedAsset(a); setDrawerOpen(true); }}
              onRefresh={fetchAssets}
            />
          </TabsContent>
        </Tabs>

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
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-sm mb-2">{c.name}</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-1">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Badge className={`${trackColors[c.track]} text-[10px]`}>{c.track.replace(/_/g, ' ')}</Badge>
                    {c.launch_date && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <CalendarIcon className="h-3 w-3" />{new Date(c.launch_date).toLocaleDateString()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this campaign along with all its assets and metrics. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDeleteCampaign(deleteTarget)}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
