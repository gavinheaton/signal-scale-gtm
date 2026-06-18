import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Loader2 } from 'lucide-react';
import { DiscoveryCampaign as Campaign } from '@/types/discovery';
import { Persona, ICP } from '@/types/database';
import OrganizationsTab from '@/components/discovery/OrganizationsTab';
import ContactsTab from '@/components/discovery/ContactsTab';
import NextActionsTab from '@/components/discovery/NextActionsTab';
import ConversationsTab from '@/components/discovery/ConversationsTab';
import InsightsTab from '@/components/discovery/InsightsTab';

export default function DiscoveryCampaignPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [icps, setIcps] = useState<ICP[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaign = useCallback(async () => {
    if (!id) return;
    const { data, error } = await (supabase as any).from('discovery_campaigns').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      setLoading(false);
      return;
    }
    setCampaign(data as Campaign);
    const [personasRes, icpsRes] = await Promise.all([
      (data as Campaign).persona_ids?.length
        ? supabase.from('personas').select('*').in('id', (data as Campaign).persona_ids)
        : Promise.resolve({ data: [] }),
      (data as Campaign).icp_ids?.length
        ? supabase.from('icps').select('*').in('id', (data as Campaign).icp_ids)
        : Promise.resolve({ data: [] }),
    ]);
    setPersonas((personasRes.data || []) as unknown as Persona[]);
    setIcps((icpsRes.data || []) as unknown as ICP[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!campaign) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="ghost" onClick={() => navigate('/project/discovery')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <p>Campaign not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/project/discovery')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Discovery
        </Button>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            {campaign.target_segment && <p className="text-sm text-muted-foreground mt-1">{campaign.target_segment}</p>}
            <div className="flex flex-wrap gap-1 mt-2">
              <Badge variant="outline">{campaign.status}</Badge>
              {icps.map((i) => <Badge key={i.id} variant="secondary">ICP: {i.segment_name}</Badge>)}
              {personas.map((p) => <Badge key={p.id} variant="outline">{p.persona_name}</Badge>)}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/project/discovery/${campaign.id}/edit`)}>
            <Edit className="h-4 w-4 mr-1" /> Edit
          </Button>
        </div>
      </div>

      <Tabs defaultValue="organizations" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="organizations">Organisations</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="next">Next Actions</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="organizations" className="mt-4">
          <OrganizationsTab campaign={campaign} personas={personas} />
        </TabsContent>
        <TabsContent value="contacts" className="mt-4">
          <ContactsTab campaign={campaign} personas={personas} />
        </TabsContent>
        <TabsContent value="next" className="mt-4">
          <NextActionsTab campaign={campaign} />
        </TabsContent>
        <TabsContent value="conversations" className="mt-4">
          <ConversationsTab campaign={campaign} personas={personas} />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <InsightsTab campaign={campaign} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
