import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Campaign, CampaignAsset, PhaseStatus, MethodologyPhase } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Target, Megaphone, TrendingUp, RefreshCw, Loader2, ExternalLink } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';


const phases: { key: MethodologyPhase; label: string }[] = [
  { key: 'icp', label: 'ICP' },
  { key: 'personas', label: 'Personas' },
  { key: 'customer_conversations', label: 'Conversations' },
  { key: 'competitor_mapping', label: 'Competitors' },
  { key: 'ecosystem_map', label: 'Ecosystem' },
  { key: 'value_proposition', label: 'Value Prop' },
  { key: 'campaign_strategy', label: 'Strategy' },
  { key: 'execution', label: 'Execution' },
];

const phaseColors: Record<PhaseStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-amber-100 text-amber-800',
  complete: 'bg-green-100 text-green-800',
};

export default function Home() {
  const { currentProject } = useProject();
  const [icpCount, setIcpCount] = useState(0);
  const [personaCount, setPersonaCount] = useState(0);
  const [activeCampaigns, setActiveCampaigns] = useState<Campaign[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [thisWeekAssets, setThisWeekAssets] = useState<CampaignAsset[]>([]);
  const [pipeline, setPipeline] = useState(0);
  const [brandVoiceStatus, setBrandVoiceStatus] = useState<string | null>(null);
  const [assetStatuses, setAssetStatuses] = useState<string[]>([]);
  const [icpWizardComplete, setIcpWizardComplete] = useState(false);

  useEffect(() => {
    if (!currentProject) return;
    const pid = currentProject.id;

    supabase.from('icps').select('id', { count: 'exact' }).eq('project_id', pid).then(({ count }) => setIcpCount(count || 0));
    supabase.from('personas').select('id', { count: 'exact' }).eq('project_id', pid).then(({ count }) => setPersonaCount(count || 0));
    supabase.from('campaigns').select('*').eq('project_id', pid).then(({ data }) => {
      if (data) {
        setAllCampaigns(data as unknown as Campaign[]);
        setActiveCampaigns((data as unknown as Campaign[]).filter(c => c.status === 'active'));
      }
    });

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    supabase.from('campaign_assets').select('*').gte('publish_date', now.toISOString().slice(0, 10)).lte('publish_date', nextWeek.toISOString().slice(0, 10)).then(({ data }) => {
      if (data) setThisWeekAssets(data as unknown as CampaignAsset[]);
    });

    supabase.from('campaign_metrics').select('pipeline_influenced').then(({ data }) => {
      if (data) setPipeline(data.reduce((sum: number, r: any) => sum + (r.pipeline_influenced || 0), 0));
    });

    // Additional queries for methodology progress
    supabase.from('brand_voices').select('status').eq('project_id', pid).limit(1).single()
      .then(({ data }) => setBrandVoiceStatus(data?.status || null));

    supabase.from('wizard_sessions').select('status')
      .eq('project_id', pid).eq('session_type', 'icp').eq('status', 'complete')
      .then(({ data }) => setIcpWizardComplete((data?.length || 0) > 0));

    supabase.from('campaign_assets').select('status, campaign_id').then(({ data }) => {
      if (data) setAssetStatuses(data.map((a: any) => a.status));
    });
  }, [currentProject]);

  if (!currentProject) return <Navigate to="/projects" replace />;

  // Derive methodology progress from real data
  const computedProgress: Record<string, PhaseStatus> = {
    icp: icpCount === 0 ? 'not_started' : icpWizardComplete ? 'complete' : 'in_progress',
    personas: personaCount === 0 ? 'not_started' : personaCount >= 3 ? 'complete' : 'in_progress',
    customer_conversations: 'not_started',
    competitor_mapping: 'not_started',
    ecosystem_map: 'not_started',
    value_proposition: !brandVoiceStatus ? 'not_started' : brandVoiceStatus === 'complete' ? 'complete' : 'in_progress',
    campaign_strategy: allCampaigns.length === 0 ? 'not_started' :
      allCampaigns.some(c => ['active', 'complete'].includes(c.status)) ? 'complete' : 'in_progress',
    execution: assetStatuses.length === 0 ? 'not_started' :
      assetStatuses.includes('published') ? 'complete' : 'in_progress',
  };

  const captureCount = activeCampaigns.filter(c => c.track === 'demand_capture').length;
  const creationCount = activeCampaigns.filter(c => c.track === 'demand_creation').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{currentProject.name}</h1>
          <p className="text-sm" style={{ color: 'hsl(var(--orange))' }}>GTM Overview</p>
        </div>
        <SyncToNotionButton />
      </div>


      {/* Methodology Progress */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Methodology Progress</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {phases.map((phase, i) => {
              const status = computedProgress[phase.key] || 'not_started';
              return (
                <div key={phase.key} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[90px]">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      status === 'complete' ? 'bg-green-500 text-white' :
                      status === 'in_progress' ? 'bg-amber-500 text-white' :
                      'bg-muted text-muted-foreground'
                    }`}>{i + 1}</div>
                    <span className="text-[11px] mt-1 text-center font-medium">{phase.label}</span>
                    <Badge className={`${phaseColors[status as PhaseStatus]} text-[9px] mt-1`}>
                      {status.replace('_', ' ')}
                    </Badge>
                  </div>
                  {i < phases.length - 1 && <div className="w-6 h-0.5 bg-border mt-[-20px]" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total ICPs', value: icpCount, icon: Target, color: 'text-blue-600' },
          { label: 'Total Personas', value: personaCount, icon: Users, color: 'text-purple-600' },
          { label: 'Active Campaigns', value: activeCampaigns.length, icon: Megaphone, color: 'text-orange-600' },
          { label: 'Pipeline Influenced', value: `$${(pipeline / 1000).toFixed(0)}k`, icon: TrendingUp, color: 'text-green-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color} opacity-70`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Campaigns Split */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(var(--orange))' }}>
          <CardHeader>
            <CardTitle className="text-base">Demand Capture (5%)</CardTitle>
          </CardHeader>
          <CardContent>
            {captureCount === 0 ? <p className="text-sm text-muted-foreground">No active campaigns</p> :
              activeCampaigns.filter(c => c.track === 'demand_capture').map(c => (
                <p key={c.id} className="text-sm">{c.name}</p>
              ))
            }
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(var(--purple))' }}>
          <CardHeader>
            <CardTitle className="text-base">Demand Creation (95%)</CardTitle>
          </CardHeader>
          <CardContent>
            {creationCount === 0 ? <p className="text-sm text-muted-foreground">No active campaigns</p> :
              activeCampaigns.filter(c => c.track === 'demand_creation').map(c => (
                <p key={c.id} className="text-sm">{c.name}</p>
              ))
            }
          </CardContent>
        </Card>
      </div>

      {/* This Week */}
      <Card>
        <CardHeader><CardTitle className="text-lg">This Week</CardTitle></CardHeader>
        <CardContent>
          {thisWeekAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets publishing this week</p>
          ) : (
            <div className="space-y-2">
              {thisWeekAssets.map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm font-medium">{a.title}</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{a.asset_type.replace('_', ' ')}</Badge>
                    <Badge variant="secondary">{a.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SyncToNotionButton() {
  const { currentProject } = useProject();
  const [syncing, setSyncing] = useState(false);
  const pageId = (currentProject as any)?.notion_strategy_page_id;
  if (!pageId) return null;

  const handleSync = async () => {
    if (!currentProject) return;
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke('sync-strategy-to-notion', {
      body: { project_id: currentProject.id },
    });
    setSyncing(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Sync failed');
      return;
    }
    toast.success('Strategy synced to Notion', {
      action: {
        label: 'Open',
        onClick: () => window.open(`https://notion.so/${pageId.replace(/-/g, '')}`, '_blank'),
      },
    });
  };

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
      {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
      Sync to Notion
      <ExternalLink className="h-3 w-3 ml-1 opacity-60" />
    </Button>
  );
}
