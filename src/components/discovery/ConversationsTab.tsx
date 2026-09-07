import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, MessageCircle } from 'lucide-react';
import { DiscoveryCampaign, DiscoveryContact, DiscoveryConversation } from '@/types/discovery';
import { Persona } from '@/types/database';
import ConversationCanvas from '@/components/discovery/ConversationCanvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { format, parseISO } from 'date-fns';

type ContactWithOrg = DiscoveryContact & { discovery_organizations: { name: string; campaign_id: string } };

export default function ConversationsTab({ campaign, personas }: { campaign: DiscoveryCampaign; personas: Persona[] }) {
  const [conversations, setConversations] = useState<(DiscoveryConversation & { discovery_contacts: ContactWithOrg })[]>([]);
  const [contacts, setContacts] = useState<ContactWithOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [openConv, setOpenConv] = useState<string | null>(null);
  const [pickContact, setPickContact] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [convRes, contactsRes] = await Promise.all([
      (supabase as any)
        .from('discovery_conversations')
        .select('*, discovery_contacts!inner(*, discovery_organizations!inner(name, campaign_id))')
        .eq('discovery_contacts.discovery_organizations.campaign_id', campaign.id)
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('discovery_contacts')
        .select('*, discovery_organizations!inner(name, campaign_id)')
        .eq('discovery_organizations.campaign_id', campaign.id),
    ]);
    setConversations((convRes.data || []) as any);
    setContacts((contactsRes.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [campaign.id]);

  const createConversation = async (contact_id: string) => {
    const { data, error } = await (supabase as any).from('discovery_conversations').insert({ contact_id, date: new Date().toISOString().slice(0, 10) }).select().maybeSingle();
    if (error) return;
    // Auto-advance the parent org's status
    const contact = contacts.find((c) => c.id === contact_id);
    if (contact?.organization_id) {
      const { maybeAdvanceOrgStatus } = await import('@/lib/discoveryStatus');
      await maybeAdvanceOrgStatus(contact.organization_id, 'in_conversation');
    }
    setPickContact(false);
    setOpenConv(data.id);
    refresh();
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{conversations.length} conversation{conversations.length === 1 ? '' : 's'} logged</p>
        <Button size="sm" onClick={() => setPickContact(true)} disabled={contacts.length === 0}><Plus className="h-4 w-4 mr-1" /> New conversation</Button>
      </div>

      {conversations.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No conversations logged yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:shadow-sm" onClick={() => setOpenConv(c.id)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{c.discovery_contacts.name} <span className="text-muted-foreground font-normal">· {c.discovery_contacts.discovery_organizations.name}</span></p>
                    <p className="text-xs text-muted-foreground mt-1">{c.objective || 'No objective set'}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {c.date && <div>{format(parseISO(c.date), 'MMM d, yyyy')}</div>}
                    <div className="flex gap-1 mt-1">
                      {c.key_topics?.slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pickContact && (
        <Sheet open onOpenChange={() => setPickContact(false)}>
          <SheetContent className="w-full sm:max-w-md">
            <SheetHeader><SheetTitle>New conversation</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground">Choose a contact to start a conversation with.</p>
              <Select onValueChange={createConversation}>
                <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                <SelectContent>{contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.discovery_organizations.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {openConv && (
        <Sheet open onOpenChange={() => { setOpenConv(null); refresh(); }}>
          <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
            <ConversationCanvas conversationId={openConv} campaign={campaign} personas={personas} onClose={() => { setOpenConv(null); refresh(); }} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
