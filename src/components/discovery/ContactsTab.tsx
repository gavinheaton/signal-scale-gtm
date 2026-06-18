import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Sparkles, Loader2, Users, ExternalLink, Linkedin, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  DiscoveryCampaign,
  DiscoveryContact,
  DiscoveryOrganization,
  DiscoveryOrgRole,
  DiscoveryOutreachStatus,
} from '@/types/discovery';
import { Persona } from '@/types/database';

type OrgWithChildren = DiscoveryOrganization & {
  discovery_contacts: DiscoveryContact[];
  discovery_org_roles: DiscoveryOrgRole[];
};

const outreachOptions: DiscoveryOutreachStatus[] = [
  'not_started', 'connection_sent', 'connected', 'dm_sent', 'email_sent', 'responded', 'closed_no_response',
];

interface ApolloCandidate {
  name: string;
  title: string;
  email: string | null;
  linkedin_url: string | null;
  seniority: string | null;
  apollo_person_id: string;
}

export default function ContactsTab({ campaign, personas }: { campaign: DiscoveryCampaign; personas: Persona[] }) {
  const [orgs, setOrgs] = useState<OrgWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingFor, setAddingFor] = useState<DiscoveryOrganization | null>(null);
  const [enrichingRole, setEnrichingRole] = useState<{ org: DiscoveryOrganization; role: DiscoveryOrgRole } | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('discovery_organizations')
      .select('*, discovery_contacts(*), discovery_org_roles(*)')
      .eq('campaign_id', campaign.id)
      .order('name');
    setOrgs((data || []) as OrgWithChildren[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [campaign.id]);

  const personaLabel = (id: string | null) => personas.find((p) => p.id === id)?.persona_name || '—';

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
      ) : orgs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No organisations yet. Add some in the Organisations tab first.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {orgs.map((org) => {
            const unenriched = org.discovery_org_roles.filter((r) => r.status === 'identified');
            return (
              <Card key={org.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{org.name}</h3>
                      <p className="text-xs text-muted-foreground">{org.discovery_contacts.length} contacts · {org.discovery_org_roles.length} roles identified</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setAddingFor(org)}><Plus className="h-4 w-4 mr-1" /> Add manually</Button>
                  </div>

                  {unenriched.length > 0 && (
                    <div className="mb-3 p-2 rounded bg-amber-50 border border-amber-200">
                      <p className="text-xs font-medium text-amber-900 mb-2">{unenriched.length} role{unenriched.length === 1 ? '' : 's'} ready to enrich with Apollo</p>
                      <div className="space-y-1">
                        {unenriched.map((r) => (
                          <div key={r.id} className="flex items-center justify-between text-xs">
                            <span>{r.role_title} <Badge variant="outline" className="ml-1 text-[10px]">{personaLabel(r.persona_id)}</Badge></span>
                            <Button size="sm" variant="ghost" onClick={() => setEnrichingRole({ org, role: r })}>
                              <Sparkles className="h-3 w-3 mr-1" /> Enrich
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {org.discovery_contacts.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Persona</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>LinkedIn</TableHead>
                          <TableHead>Outreach</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {org.discovery_contacts.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell className="text-xs">{c.title}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{personaLabel(c.persona_id)}</Badge></TableCell>
                            <TableCell className="text-xs">{c.email ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Mail className="h-3 w-3" />{c.email}</a> : '—'}</TableCell>
                            <TableCell>{c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-primary"><Linkedin className="h-4 w-4" /></a> : '—'}</TableCell>
                            <TableCell>
                              <Select value={c.outreach_status} onValueChange={async (v) => {
                                await (supabase as any).from('discovery_contacts').update({ outreach_status: v }).eq('id', c.id);
                                refresh();
                              }}>
                                <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                                <SelectContent>{outreachOptions.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {addingFor && <AddContactSheet org={addingFor} personas={personas} onClose={() => { setAddingFor(null); refresh(); }} />}
      {enrichingRole && <EnrichApolloSheet org={enrichingRole.org} role={enrichingRole.role} onClose={() => { setEnrichingRole(null); refresh(); }} />}
    </div>
  );
}

function AddContactSheet({ org, personas, onClose }: { org: DiscoveryOrganization; personas: Persona[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [personaId, setPersonaId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await (supabase as any).from('discovery_contacts').insert({
      organization_id: org.id,
      persona_id: personaId || null,
      name: name.trim(), title: title || null, email: email || null,
      linkedin_url: linkedin || null, notes: notes || null,
      enrichment_source: 'manual',
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onClose();
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Add contact at {org.name}</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div>
            <Label>Persona</Label>
            <Select value={personaId} onValueChange={setPersonaId}>
              <SelectTrigger><SelectValue placeholder="Select persona" /></SelectTrigger>
              <SelectContent>{personas.map((p) => <SelectItem key={p.id} value={p.id}>{p.persona_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>LinkedIn URL</Label><Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EnrichApolloSheet({ org, role, onClose }: { org: DiscoveryOrganization; role: DiscoveryOrgRole; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState<ApolloCandidate[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const run = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('discovery-enrich-apollo', { body: { org_role_id: role.id } });
    setRunning(false);
    if (error) { toast.error(error.message || 'Apollo enrichment failed'); return; }
    setCandidates((data?.candidates || []) as ApolloCandidate[]);
  };

  const save = async () => {
    if (picked.size === 0) return;
    setSaving(true);
    const rows = Array.from(picked).map((i) => candidates[i]).map((c) => ({
      organization_id: org.id,
      org_role_id: role.id,
      persona_id: role.persona_id,
      name: c.name,
      title: c.title,
      email: c.email,
      linkedin_url: c.linkedin_url,
      enrichment_source: 'apollo',
      apollo_person_id: c.apollo_person_id,
    }));
    const { error: insErr } = await (supabase as any).from('discovery_contacts').insert(rows);
    if (insErr) { setSaving(false); toast.error(insErr.message); return; }
    await (supabase as any).from('discovery_org_roles').update({ status: 'enriched' }).eq('id', role.id);
    setSaving(false);
    toast.success(`Added ${rows.length} contact${rows.length === 1 ? '' : 's'}`);
    onClose();
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>Enrich "{role.role_title}" with Apollo</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Searches Apollo for people matching this role title at <strong>{org.name}</strong>. Review candidates before adding — Apollo never auto-saves.</p>
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {running ? 'Searching Apollo…' : 'Run search'}
          </Button>

          {candidates.length > 0 && (
            <>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto border rounded p-2">
                {candidates.map((c, i) => (
                  <div key={i} className="flex gap-2 p-2 rounded hover:bg-muted/50">
                    <Checkbox checked={picked.has(i)} onCheckedChange={(v) => {
                      const next = new Set(picked);
                      v ? next.add(i) : next.delete(i);
                      setPicked(next);
                    }} />
                    <div className="flex-1 text-sm">
                      <div className="flex items-center gap-2"><strong>{c.name}</strong>{c.seniority && <Badge variant="secondary" className="text-[10px]">{c.seniority}</Badge>}</div>
                      <p className="text-xs text-muted-foreground">{c.title}</p>
                      <div className="flex gap-3 text-xs mt-1">
                        {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn</a>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={save} disabled={saving || picked.size === 0}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Add {picked.size} contact{picked.size === 1 ? '' : 's'}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
