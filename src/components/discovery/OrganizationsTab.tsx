import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Sparkles, Loader2, Building2, ExternalLink, Users, Trash2, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  DiscoveryCampaign,
  DiscoveryOrganization,
  DiscoveryOrgRole,
  DiscoveryOrgStatus,
} from '@/types/discovery';
import { Persona } from '@/types/database';

const statusOptions: DiscoveryOrgStatus[] = ['researching', 'targeted', 'in_conversation', 'validated', 'disqualified'];

interface FindCandidate {
  name: string;
  domain: string;
  suggested_tier: string;
  matched_signals: string[];
  rationale: string;
  source_url: string;
}

interface RoleCandidate {
  persona_id: string | null;
  role_title: string;
  source_url: string | null;
  source_snippet: string | null;
}

export default function OrganizationsTab({ campaign, personas }: { campaign: DiscoveryCampaign; personas: Persona[] }) {
  const [orgs, setOrgs] = useState<DiscoveryOrganization[]>([]);
  const [roleCounts, setRoleCounts] = useState<Record<string, { roles: number; contacts: number }>>({});
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [rolesFor, setRolesFor] = useState<DiscoveryOrganization | null>(null);
  const [deleting, setDeleting] = useState<DiscoveryOrganization | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('discovery_organizations')
      .select('*, discovery_org_roles(id), discovery_contacts(id)')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false });
    const list = (data || []) as (DiscoveryOrganization & { discovery_org_roles: any[]; discovery_contacts: any[] })[];
    setOrgs(list);
    const counts: Record<string, { roles: number; contacts: number }> = {};
    for (const o of list) {
      counts[o.id] = { roles: o.discovery_org_roles?.length || 0, contacts: o.discovery_contacts?.length || 0 };
    }
    setRoleCounts(counts);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [campaign.id]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{orgs.length} organisations</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add manually</Button>
          <Button size="sm" onClick={() => setSearchOpen((v) => !v)}>
            {searchOpen ? <X className="h-4 w-4 mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {searchOpen ? 'Close search' : 'Find organisations'}
          </Button>
        </div>
      </div>

      {searchOpen && (
        <SearchPanel campaign={campaign} onAdded={refresh} onClose={() => setSearchOpen(false)} />
      )}

      {loading ? (
        <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
      ) : orgs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No organisations yet. Use <strong>Find organisations</strong> to discover candidates via Firecrawl, or add them manually.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signals</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell className="text-xs">
                    {o.domain ? <a href={`https://${o.domain}`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{o.domain}<ExternalLink className="h-3 w-3" /></a> : '—'}
                  </TableCell>
                  <TableCell><Badge variant="outline">{o.tier || '—'}</Badge></TableCell>
                  <TableCell>
                    <Select value={o.status} onValueChange={async (v) => {
                      await (supabase as any).from('discovery_organizations').update({ status: v }).eq('id', o.id);
                      refresh();
                    }}>
                      <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs">{o.signals_matched.slice(0, 2).join(', ')}{o.signals_matched.length > 2 ? ` +${o.signals_matched.length - 2}` : ''}</TableCell>
                  <TableCell>{roleCounts[o.id]?.roles || 0}</TableCell>
                  <TableCell>{roleCounts[o.id]?.contacts || 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setRolesFor(o)}><Users className="h-3 w-3 mr-1" /> Find roles</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(o)} aria-label={`Delete ${o.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {addOpen && <AddOrgSheet campaign={campaign} onClose={() => { setAddOpen(false); refresh(); }} />}
      {rolesFor && <FindRolesSheet org={rolesFor} personas={personas} onClose={() => { setRolesFor(null); refresh(); }} />}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the organisation along with its roles, contacts, and conversations. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              onClick={async (e) => {
                e.preventDefault();
                if (!deleting) return;
                setDeleteBusy(true);
                try {
                  const orgId = deleting.id;
                  const { data: contacts } = await (supabase as any)
                    .from('discovery_contacts').select('id').eq('organization_id', orgId);
                  const contactIds = (contacts || []).map((c: any) => c.id);
                  if (contactIds.length) {
                    await (supabase as any).from('discovery_conversations').delete().in('contact_id', contactIds);
                  }
                  await (supabase as any).from('discovery_contacts').delete().eq('organization_id', orgId);
                  await (supabase as any).from('discovery_org_roles').delete().eq('organization_id', orgId);
                  const { error } = await (supabase as any).from('discovery_organizations').delete().eq('id', orgId);
                  if (error) throw error;
                  toast.success(`Deleted ${deleting.name}`);
                  setDeleting(null);
                  await refresh();
                } catch (err: any) {
                  toast.error(err?.message || 'Failed to delete');
                } finally {
                  setDeleteBusy(false);
                }
              }}
            >
              {deleteBusy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SearchPanel({ campaign, onAdded, onClose }: { campaign: DiscoveryCampaign; onAdded: () => void | Promise<void>; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState<FindCandidate[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [debug, setDebug] = useState<any | null>(null);
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const run = async () => {
    setRunning(true);
    setCandidates([]);
    setDebug(null);
    setLastAdded(null);
    const { data, error } = await supabase.functions.invoke('discovery-find-orgs', { body: { campaign_id: campaign.id } });
    setRunning(false);
    setHasRun(true);
    if (error) {
      const detail = (data as any)?.error || (data as any)?.detail;
      toast.error(detail ? `${error.message}: ${detail}` : (error.message || 'Failed to find organisations'));
      console.error('[find-orgs] error', error, data);
      return;
    }
    const cands = (data?.candidates || []) as FindCandidate[];
    setCandidates(cands);
    setPicked(new Set(cands.map((_: any, i: number) => i)));
    setDebug((data as any)?.debug || null);
  };

  const save = async () => {
    if (picked.size === 0) return;
    setSaving(true);
    const rows = Array.from(picked).map((i) => candidates[i]).map((c) => ({
      campaign_id: campaign.id,
      name: c.name,
      domain: c.domain,
      tier: c.suggested_tier,
      signals_matched: c.matched_signals,
      fit_notes: c.rationale,
      source: 'firecrawl',
      source_url: c.source_url,
    }));
    const { error } = await (supabase as any).from('discovery_organizations').insert(rows);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLastAdded(rows.length);
    setCandidates([]);
    setPicked(new Set());
    await onAdded();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Find organisations</h3>
            <p className="text-xs text-muted-foreground">Searches the web for orgs matching this campaign's target segment, ICP signals, and tier criteria. Review candidates before adding.</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close search"><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={run} disabled={running} size="sm">
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {running ? 'Searching…' : hasRun ? 'Run another search' : 'Run search'}
          </Button>
          {lastAdded !== null && (
            <span className="text-xs text-muted-foreground">Added {lastAdded} organisation{lastAdded === 1 ? '' : 's'}.</span>
          )}
        </div>

        {candidates.length > 0 && (
          <>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto border rounded p-2">
              {candidates.map((c, i) => (
                <div key={i} className="flex gap-2 p-2 rounded hover:bg-muted/50">
                  <Checkbox checked={picked.has(i)} onCheckedChange={(v) => {
                    const next = new Set(picked);
                    v ? next.add(i) : next.delete(i);
                    setPicked(next);
                  }} />
                  <div className="flex-1 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong>{c.name}</strong>
                      <Badge variant="outline" className="text-xs">{c.suggested_tier}</Badge>
                      {c.domain && <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">{c.domain}<ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{c.rationale}</p>
                    <div className="flex flex-wrap gap-1 mt-1">{c.matched_signals.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCandidates([]); setPicked(new Set()); }}>Clear</Button>
              <Button size="sm" onClick={save} disabled={saving || picked.size === 0}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Add {picked.size} organisation{picked.size === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}

        {hasRun && !running && candidates.length === 0 && (
          <div className="rounded border bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium text-sm">No candidates returned</div>
            <p className="text-muted-foreground">Try broadening the campaign target segment or qualifying signals — behavioural signals tend to surface social posts, not company sites.</p>
            {debug && (
              <div className="mt-2 space-y-1 text-muted-foreground">
                {Array.isArray(debug.query_variants) && (
                  <div><span className="font-medium text-foreground">Queries tried:</span>
                    <ul className="list-disc pl-5">{debug.query_variants.map((q: string, i: number) => <li key={i}><code className="text-[11px]">{q}</code></li>)}</ul>
                  </div>
                )}
                <div className="flex gap-3 flex-wrap">
                  {typeof debug.raw_hit_count === 'number' && <span>Raw hits: <strong>{debug.raw_hit_count}</strong></span>}
                  {typeof debug.filtered_hit_count === 'number' && <span>Company-like: <strong>{debug.filtered_hit_count}</strong></span>}
                  {typeof debug.ai_returned === 'number' && <span>AI returned: <strong>{debug.ai_returned}</strong></span>}
                </div>
                {debug.ai_note && <div><span className="font-medium text-foreground">AI note:</span> {debug.ai_note}</div>}
                {Array.isArray(debug.sample_dropped) && debug.sample_dropped.length > 0 && (
                  <details>
                    <summary className="cursor-pointer">Sample dropped results ({debug.sample_dropped.length})</summary>
                    <ul className="list-disc pl-5 mt-1">
                      {debug.sample_dropped.map((d: any, i: number) => (
                        <li key={i}><span className="text-foreground">{d.title || '(no title)'}</span> — {d.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function AddOrgSheet({ campaign, onClose }: { campaign: DiscoveryCampaign; onClose: () => void }) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [tier, setTier] = useState(campaign.tiers[0]?.label || '');
  const [signals, setSignals] = useState<string[]>([]);
  const [fitNotes, setFitNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const allSignals = [...campaign.qualifying_signals, ...campaign.disqualifying_signals];

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await (supabase as any).from('discovery_organizations').insert({
      campaign_id: campaign.id,
      name: name.trim(), domain: domain || null, tier: tier || null,
      signals_matched: signals, fit_notes: fitNotes || null, source: 'manual',
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onClose();
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Add organisation</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Domain</Label><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" /></div>
          <div>
            <Label>Tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger><SelectValue placeholder="Select tier" /></SelectTrigger>
              <SelectContent>{campaign.tiers.map((t) => <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {allSignals.length > 0 && (
            <div>
              <Label>Matched signals</Label>
              <div className="space-y-1 mt-1 max-h-40 overflow-auto border rounded p-2">
                {allSignals.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={signals.includes(s)} onCheckedChange={(v) => setSignals(v ? [...signals, s] : signals.filter((x) => x !== s))} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div><Label>Fit notes</Label><Textarea rows={3} value={fitNotes} onChange={(e) => setFitNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FindRolesSheet({ org, personas, onClose }: { org: DiscoveryOrganization; personas: Persona[]; onClose: () => void }) {
  const [existing, setExisting] = useState<DiscoveryOrgRole[]>([]);
  const [running, setRunning] = useState(false);
  const [candidates, setCandidates] = useState<RoleCandidate[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('discovery_org_roles').select('*').eq('organization_id', org.id);
      setExisting((data || []) as DiscoveryOrgRole[]);
    })();
  }, [org.id]);

  const run = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('discovery-find-roles', { body: { organization_id: org.id } });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    setCandidates((data?.candidates || []) as RoleCandidate[]);
    setPicked(new Set((data?.candidates || []).map((_: any, i: number) => i)));
  };

  const save = async () => {
    if (picked.size === 0) return;
    setSaving(true);
    const rows = Array.from(picked).map((i) => candidates[i]).map((c) => ({
      organization_id: org.id,
      persona_id: c.persona_id,
      role_title: c.role_title,
      source_url: c.source_url,
      source_snippet: c.source_snippet,
    }));
    const { error } = await (supabase as any).from('discovery_org_roles').insert(rows);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${rows.length} role${rows.length === 1 ? '' : 's'}`);
    onClose();
  };

  const personaLabel = (id: string | null) => personas.find((p) => p.id === id)?.persona_name || 'Unmapped';

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><SheetTitle>Find roles at {org.name}</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          {existing.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2">Already identified</h4>
              <div className="space-y-1">
                {existing.map((r) => (
                  <div key={r.id} className="text-sm flex items-center gap-2">
                    <Badge variant="outline">{personaLabel(r.persona_id)}</Badge>
                    <span>{r.role_title}</span>
                    <Badge variant="secondary" className="text-xs">{r.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {running ? 'Scanning team pages…' : 'Find new roles'}
          </Button>

          {candidates.length > 0 && (
            <>
              <div className="space-y-2 max-h-[55vh] overflow-y-auto border rounded p-2">
                {candidates.map((c, i) => (
                  <div key={i} className="flex gap-2 p-2 rounded hover:bg-muted/50">
                    <Checkbox checked={picked.has(i)} onCheckedChange={(v) => {
                      const next = new Set(picked);
                      v ? next.add(i) : next.delete(i);
                      setPicked(next);
                    }} />
                    <div className="flex-1 text-sm">
                      <div className="flex items-center gap-2">
                        <strong>{c.role_title}</strong>
                        <Badge variant="outline" className="text-xs">{personaLabel(c.persona_id)}</Badge>
                      </div>
                      {c.source_snippet && <p className="text-xs text-muted-foreground mt-1 italic">"{c.source_snippet}"</p>}
                      {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">{c.source_url}<ExternalLink className="h-3 w-3" /></a>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={save} disabled={saving || picked.size === 0}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Add {picked.size} role{picked.size === 1 ? '' : 's'}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
