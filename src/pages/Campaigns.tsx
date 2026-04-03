import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Campaign, ICP, CampaignAsset, CampaignTrack, CampaignStatus } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Calendar } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const statusColumns: CampaignStatus[] = ['brief', 'planning', 'active', 'complete'];
const trackColors = { demand_capture: 'bg-orange-100 text-orange-800', demand_creation: 'bg-purple-100 text-purple-800' };

export default function Campaigns() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [icps, setIcps] = useState<ICP[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [assets, setAssets] = useState<CampaignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', track: 'demand_creation' as CampaignTrack, objective: '', launch_date: '', end_date: '' });

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

  useEffect(() => {
    if (!selectedCampaign) return;
    supabase.from('campaign_assets').select('*').eq('campaign_id', selectedCampaign.id).then(({ data }) => {
      if (data) setAssets(data as unknown as CampaignAsset[]);
    });
  }, [selectedCampaign]);

  if (!currentProject) return <Navigate to="/projects" replace />;

  const handleCreate = async () => {
    const { error } = await supabase.from('campaigns').insert({
      project_id: currentProject.id,
      name: form.name,
      track: form.track,
      status: 'brief',
      objective: form.objective,
      launch_date: form.launch_date || null,
      end_date: form.end_date || null,
      target_icp_ids: [],
      channel_mix: {},
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Campaign created');
    setFormOpen(false);
    fetchData();
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const captureActive = activeCampaigns.filter(c => c.track === 'demand_capture').length;
  const creationActive = activeCampaigns.filter(c => c.track === 'demand_creation').length;
  const total = captureActive + creationActive;
  const capturePercent = total > 0 ? (captureActive / total * 100) : 0;

  if (selectedCampaign) {
    const assetStatuses: CampaignAsset['status'][] = ['brief', 'draft', 'review', 'approved', 'published'];
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedCampaign(null)}>← Back to Campaigns</Button>
        <div>
          <h1 className="text-2xl font-bold">{selectedCampaign.name}</h1>
          <Badge className={trackColors[selectedCampaign.track]}>{selectedCampaign.track.replace('_', ' ')}</Badge>
        </div>
        {selectedCampaign.objective && <Card><CardContent className="pt-6"><p className="text-sm">{selectedCampaign.objective}</p></CardContent></Card>}
        <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--orange))' }}>Asset Pipeline</h2>
        <div className="grid grid-cols-5 gap-3">
          {assetStatuses.map(s => (
            <div key={s} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">{s}</h3>
              {assets.filter(a => a.status === s).map(a => (
                <Card key={a.id} className="p-3"><p className="text-sm font-medium">{a.title}</p><Badge variant="outline" className="text-[10px] mt-1">{a.asset_type.replace('_', ' ')}</Badge></Card>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
        <Sheet open={formOpen} onOpenChange={setFormOpen}>
          <SheetTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Campaign</Button></SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>New Campaign</SheetTitle></SheetHeader>
            <div className="space-y-4 mt-4">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div>
                <Label>Track</Label>
                <Select value={form.track} onValueChange={v => setForm(f => ({ ...f, track: v as CampaignTrack }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demand_capture">Demand Capture</SelectItem>
                    <SelectItem value="demand_creation">Demand Creation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Objective</Label><Textarea value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} /></div>
              <div><Label>Launch Date</Label><Input type="date" value={form.launch_date} onChange={e => setForm(f => ({ ...f, launch_date: e.target.value }))} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
              <Button onClick={handleCreate} className="w-full">Create Campaign</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* 95-5 Split */}
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

      {/* Kanban */}
      <div className="grid grid-cols-4 gap-4">
        {statusColumns.map(status => (
          <div key={status}>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3">{status}</h3>
            <div className="space-y-3">
              {campaigns.filter(c => c.status === status).map(c => (
                <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedCampaign(c)}>
                  <CardContent className="pt-4 pb-3">
                    <p className="font-medium text-sm mb-2">{c.name}</p>
                    <Badge className={`${trackColors[c.track]} text-[10px]`}>{c.track.replace('_', ' ')}</Badge>
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
