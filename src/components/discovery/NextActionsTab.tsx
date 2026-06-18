import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Bell, CheckCircle2, Loader2, Calendar as CalendarIcon, Mail, MessageSquare, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { DiscoveryCampaign, DiscoveryContact } from '@/types/discovery';
import { format, differenceInDays, differenceInHours, parseISO } from 'date-fns';

type Action = {
  contact: DiscoveryContact;
  org_name: string;
  kind: 'send_dm' | 'send_email' | 'close_no_response' | 'reminder';
  due: string;
  detail?: string;
};

export default function NextActionsTab({ campaign }: { campaign: DiscoveryCampaign }) {
  const [contacts, setContacts] = useState<(DiscoveryContact & { discovery_organizations: { name: string } })[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('discovery_contacts')
      .select('*, discovery_organizations!inner(name, campaign_id)')
      .eq('discovery_organizations.campaign_id', campaign.id);
    setContacts((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [campaign.id]);

  const actions = useMemo<Action[]>(() => {
    const out: Action[] = [];
    const today = new Date();
    const seq = campaign.outreach_sequence;
    for (const c of contacts) {
      const org_name = c.discovery_organizations?.name || '';
      // Reminder
      if (c.reminder_date && parseISO(c.reminder_date) <= today) {
        out.push({ contact: c, org_name, kind: 'reminder', due: c.reminder_date, detail: c.reminder_note || undefined });
      }
      // DM follow-up: accepted + no dm yet, >= step_2_trigger_hours after acceptance
      if (c.connection_accepted_at && !c.dm_sent_at && c.outreach_status !== 'closed_no_response') {
        const hrs = differenceInHours(today, parseISO(c.connection_accepted_at));
        if (hrs >= (seq.step_2_trigger_hours || 48)) {
          out.push({ contact: c, org_name, kind: 'send_dm', due: c.connection_accepted_at, detail: seq.step_2 });
        }
      }
      // Email follow-up: dm sent + no response, >= step_3_trigger_days
      if (c.dm_sent_at && !c.email_sent_at && c.outreach_status !== 'responded' && c.outreach_status !== 'closed_no_response') {
        const d = differenceInDays(today, parseISO(c.dm_sent_at));
        if (d >= (seq.step_3_trigger_days || 7)) {
          out.push({ contact: c, org_name, kind: 'send_email', due: c.dm_sent_at, detail: seq.step_3 });
        }
      }
      // Close: email sent + no response, >= close_after_days
      if (c.email_sent_at && c.outreach_status !== 'responded' && c.outreach_status !== 'closed_no_response') {
        const d = differenceInDays(today, parseISO(c.email_sent_at));
        if (d >= (seq.close_after_days || 7)) {
          out.push({ contact: c, org_name, kind: 'close_no_response', due: c.email_sent_at });
        }
      }
    }
    return out;
  }, [contacts, campaign]);

  const updateContact = async (id: string, patch: Partial<DiscoveryContact>) => {
    const { error } = await (supabase as any).from('discovery_contacts').update(patch).eq('id', id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{actions.length} action{actions.length === 1 ? '' : 's'} due. Outreach send is manual — record what happened here.</p>
      {actions.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
          You're all caught up. New actions surface as outreach timers elapse.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {actions.map((a, i) => <ActionRow key={`${a.contact.id}-${a.kind}-${i}`} action={a} onUpdate={updateContact} />)}
        </div>
      )}
    </div>
  );
}

function ActionRow({ action, onUpdate }: { action: Action; onUpdate: (id: string, patch: Partial<DiscoveryContact>) => Promise<void> }) {
  const { contact, org_name, kind, detail, due } = action;
  const today = new Date().toISOString().slice(0, 10);
  const meta = {
    reminder: { icon: Bell, color: 'text-amber-600', label: 'Reminder' },
    send_dm: { icon: MessageSquare, color: 'text-blue-600', label: 'Send follow-up DM' },
    send_email: { icon: Mail, color: 'text-purple-600', label: 'Send follow-up email' },
    close_no_response: { icon: X, color: 'text-red-600', label: 'Close — no response' },
  }[kind];
  const Icon = meta.icon;

  return (
    <Card><CardContent className="p-3 flex items-start gap-3">
      <Icon className={`h-5 w-5 mt-0.5 ${meta.color}`} />
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{meta.label}</span>
          <Badge variant="outline">{contact.name}</Badge>
          <span className="text-xs text-muted-foreground">at {org_name}</span>
        </div>
        {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
        <p className="text-[10px] text-muted-foreground mt-1">due since {format(parseISO(due), 'MMM d')}</p>
      </div>
      <div className="flex flex-col gap-1">
        {kind === 'send_dm' && (
          <Button size="sm" variant="outline" onClick={() => onUpdate(contact.id, { dm_sent_at: today, outreach_status: 'dm_sent' })}>
            <Send className="h-3 w-3 mr-1" /> Mark DM sent
          </Button>
        )}
        {kind === 'send_email' && (
          <Button size="sm" variant="outline" onClick={() => onUpdate(contact.id, { email_sent_at: today, outreach_status: 'email_sent' })}>
            <Send className="h-3 w-3 mr-1" /> Mark email sent
          </Button>
        )}
        {kind === 'close_no_response' && (
          <Button size="sm" variant="outline" onClick={() => onUpdate(contact.id, { outreach_status: 'closed_no_response' })}>
            <X className="h-3 w-3 mr-1" /> Close
          </Button>
        )}
        {(kind === 'send_dm' || kind === 'send_email') && (
          <Button size="sm" variant="ghost" onClick={() => onUpdate(contact.id, { outreach_status: 'responded' })}>
            Mark responded
          </Button>
        )}
        {kind === 'reminder' && (
          <Button size="sm" variant="ghost" onClick={() => onUpdate(contact.id, { reminder_date: null, reminder_note: null })}>
            Clear reminder
          </Button>
        )}
        <ReminderPopover contact={contact} onSave={onUpdate} />
      </div>
    </CardContent></Card>
  );
}

function ReminderPopover({ contact, onSave }: { contact: DiscoveryContact; onSave: (id: string, patch: Partial<DiscoveryContact>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(contact.reminder_date ? parseISO(contact.reminder_date) : undefined);
  const [note, setNote] = useState(contact.reminder_note || '');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="text-xs"><CalendarIcon className="h-3 w-3 mr-1" />Set reminder</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3">
        <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="pointer-events-auto" />
        <Input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" className="w-full" disabled={!date} onClick={async () => {
          await onSave(contact.id, { reminder_date: date ? date.toISOString().slice(0, 10) : null, reminder_note: note || null });
          setOpen(false);
        }}>Save</Button>
      </PopoverContent>
    </Popover>
  );
}
