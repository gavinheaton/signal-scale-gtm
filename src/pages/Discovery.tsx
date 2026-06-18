import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, MessagesSquare, Loader2, Building2, Users, MessageCircle } from 'lucide-react';
import { DiscoveryCampaign } from '@/types/discovery';

interface CampaignWithCounts extends DiscoveryCampaign {
  org_count: number;
  contact_count: number;
  conversation_count: number;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
  archived: 'bg-muted text-muted-foreground',
};

export default function Discovery() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentProject) return;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('discovery_campaigns')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      const list = (data || []) as DiscoveryCampaign[];
      const enriched = await Promise.all(
        list.map(async (c) => {
          const [{ count: orgs }, contactsRes, convsRes] = await Promise.all([
            (supabase as any).from('discovery_organizations').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id),
            (supabase as any).from('discovery_organizations').select('id, discovery_contacts(id)').eq('campaign_id', c.id),
            (supabase as any).from('discovery_organizations').select('id, discovery_contacts(id, discovery_conversations(id))').eq('campaign_id', c.id),
          ]);
          let contact_count = 0;
          for (const o of (contactsRes.data || []) as any[]) contact_count += (o.discovery_contacts || []).length;
          let conversation_count = 0;
          for (const o of (convsRes.data || []) as any[]) for (const ct of o.discovery_contacts || []) conversation_count += (ct.discovery_conversations || []).length;
          return { ...c, org_count: orgs || 0, contact_count, conversation_count } as CampaignWithCounts;
        })
      );
      setCampaigns(enriched);
      setLoading(false);
    })();
  }, [currentProject]);

  if (!currentProject) {
    return <div className="p-6 text-muted-foreground">Select a project to view discovery campaigns.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessagesSquare className="h-6 w-6 text-primary" />
            Discovery
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Turn ICPs and personas into named, contactable people. Find organisations, identify role-holders,
            enrich to contacts, run sequenced outreach, and synthesise customer conversations into themes.
          </p>
        </div>
        <Button onClick={() => navigate('/project/discovery/new')}>
          <Plus className="h-4 w-4 mr-1" /> New Campaign
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading campaigns…
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessagesSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No discovery campaigns yet.</p>
            <p className="text-sm mt-1">Create one to start moving from unknown personas to known contacts.</p>
            <Button className="mt-4" onClick={() => navigate('/project/discovery/new')}>
              <Plus className="h-4 w-4 mr-1" /> Create your first campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/project/discovery/${c.id}`)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <Badge className={statusColors[c.status]}>{c.status}</Badge>
                </div>
                {c.target_segment && <p className="text-xs text-muted-foreground mt-1">{c.target_segment}</p>}
              </CardHeader>
              <CardContent className="pt-0">
                {c.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.description}</p>}
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {c.org_count} orgs</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.contact_count} contacts</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {c.conversation_count} conversations</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
