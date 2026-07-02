import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, Sparkles, Loader2, ExternalLink, Linkedin, Mail, ChevronDown, ChevronRight,
  Pencil, Building2, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DiscoveryCampaign,
  DiscoveryContact,
  DiscoveryOrganization,
  DiscoveryOrgRole,
  DiscoveryOutreachStatus,
  DiscoveryEnrichmentSource,
} from '@/types/discovery';
import { Persona } from '@/types/database';
import { maybeAdvanceOrgStatus } from '@/lib/discoveryStatus';

type OrgWithChildren = DiscoveryOrganization & {
  discovery_contacts: DiscoveryContact[];
  discovery_org_roles: DiscoveryOrgRole[];
};

const outreachOptions: DiscoveryOutreachStatus[] = [
  'not_started', 'connection_sent', 'connected', 'dm_sent', 'email_sent', 'responded', 'closed_no_response',
];

function SourceBadge({ source }: { source: DiscoveryEnrichmentSource }) {
  const map: Record<DiscoveryEnrichmentSource, { label: string; icon: any; variant: any }> = {
    firecrawl: { label: 'AI', icon: Sparkles, variant: 'secondary' },
    apollo: { label: 'Apollo', icon: Building2, variant: 'default' },
    manual: { label: 'Manual', icon: Pencil, variant: 'outline' },
  };
  const m = map[source] || map.manual;
  const Icon = m.icon;
  return (
    <Badge variant={m.variant} className="text-[10px] gap-1" title={`Source: ${source}`}>
      <Icon className="h-2.5 w-2.5" /> {m.label}
    </Badge>
  );
}

export default function ContactsTab({ campaign, personas }: { campaign: DiscoveryCampaign; personas: Persona[] }) {
  const [orgs, setOrgs] = useState<OrgWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingFor, setAddingFor] = useState<DiscoveryOrganization | null>(null);
  const [enrichingRole, setEnrichingRole] = useState<{ org: DiscoveryOrganization; role: DiscoveryOrgRole } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const personaLabel = (id: string | null) => personas.find((p) => p.id === id)?.persona_name || null;
  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

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
            const rolesById = new Map(org.discovery_org_roles.map((r) => [r.id, r]));
            const combined: (
              | { kind: 'contact'; data: DiscoveryContact }
              | { kind: 'role'; data: DiscoveryOrgRole }
            )[] = [
              ...org.discovery_contacts.map((c) => ({ kind: 'contact' as const, data: c })),
              ...unenriched.map((r) => ({ kind: 'role' as const, data: r })),
            ];
            combined.sort((a, b) => {
              const aLabel = a.kind === 'contact' ? a.data.name : a.data.role_title;
              const bLabel = b.kind === 'contact' ? b.data.name : b.data.role_title;
              return aLabel.localeCompare(bLabel);
            });
            return (
              <Card key={org.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        {org.name}
                        {org.linkedin_url && (
                          <a href={org.linkedin_url} target="_blank" rel="noreferrer" className="text-primary" title="Company LinkedIn">
                            <Linkedin className="h-4 w-4" />
                          </a>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {org.discovery_contacts.length} contacts · {org.discovery_org_roles.length} roles identified
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setAddingFor(org)}><Plus className="h-4 w-4 mr-1" /> Add manually</Button>
                  </div>


                  {org.discovery_contacts.length > 0 && (
                    <div className="border rounded divide-y">
                      {org.discovery_contacts.map((c) => {
                        const isOpen = expanded.has(c.id);
                        const role = c.org_role_id ? rolesById.get(c.org_role_id) : null;
                        const pLabel = personaLabel(c.persona_id);
                        return (
                          <div key={c.id} className="text-sm">
                            <div className="flex items-center gap-2 p-2">
                              <button className="p-0.5 hover:bg-muted rounded" onClick={() => toggleExpand(c.id)} aria-label="Expand">
                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium truncate">{c.name}</span>
                                  <SourceBadge source={c.enrichment_source} />
                                  {pLabel && <Badge variant="outline" className="text-[10px]">{pLabel}</Badge>}
                                </div>
                                {c.title && <div className="text-xs text-muted-foreground truncate">{c.title}</div>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {c.email && <a href={`mailto:${c.email}`} title={c.email} className="text-primary"><Mail className="h-4 w-4" /></a>}
                                {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" title="LinkedIn" className="text-primary"><Linkedin className="h-4 w-4" /></a>}
                                <Select value={c.outreach_status} onValueChange={async (v) => {
                                  await (supabase as any).from('discovery_contacts').update({ outreach_status: v }).eq('id', c.id);
                                  refresh();
                                }}>
                                  <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                                  <SelectContent>{outreachOptions.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                            </div>

                            {isOpen && (
                              <div className="px-3 pb-3 pt-1 grid grid-cols-1 md:grid-cols-3 gap-3 bg-muted/30 text-xs">
                                <div className="space-y-1">
                                  <div className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Contact details</div>
                                  {c.email ? (
                                    <div className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</div>
                                  ) : <div className="text-muted-foreground">Email: —</div>}
                                  {c.linkedin_url ? (
                                    <div><a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> LinkedIn profile</a></div>
                                  ) : <div className="text-muted-foreground">LinkedIn: —</div>}
                                  <PersonaAssign
                                    contactId={c.id}
                                    personaId={c.persona_id}
                                    personas={personas}
                                    onSaved={refresh}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <div className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Role & source</div>
                                  {role && <div>Role: <span className="font-medium">{role.role_title}</span></div>}
                                  {role?.source_url && (
                                    <div className="truncate">
                                      <a href={role.source_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 truncate">
                                        <ExternalLink className="h-3 w-3" /> Found via
                                      </a>
                                    </div>
                                  )}
                                  <div className="text-muted-foreground">Enrichment: {c.enrichment_source}</div>
                                  {c.apollo_person_id && <div className="text-muted-foreground truncate">Apollo id: {c.apollo_person_id.slice(0, 12)}…</div>}
                                </div>
                                <div className="space-y-1">
                                  <div className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Notes</div>
                                  <div className="whitespace-pre-wrap">{c.notes || <span className="text-muted-foreground">No notes.</span>}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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

function PersonaAssign({
  contactId, personaId, personas, onSaved,
}: { contactId: string; personaId: string | null; personas: Persona[]; onSaved: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">Persona:</span>
      <Select value={personaId || ''} onValueChange={async (v) => {
        await (supabase as any).from('discovery_contacts').update({ persona_id: v || null }).eq('id', contactId);
        onSaved();
      }}>
        <SelectTrigger className="h-6 text-[11px] w-40"><SelectValue placeholder="Assign" /></SelectTrigger>
        <SelectContent>{personas.map((p) => <SelectItem key={p.id} value={p.id}>{p.persona_name}</SelectItem>)}</SelectContent>
      </Select>
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
    await maybeAdvanceOrgStatus(org.id, 'targeted');
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

interface ApolloCandidate {
  name: string;
  title: string;
  email: string | null;
  linkedin_url: string | null;
  seniority: string | null;
  apollo_person_id: string;
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
    await maybeAdvanceOrgStatus(org.id, 'targeted');
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
