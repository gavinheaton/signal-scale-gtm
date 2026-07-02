import { Fragment, useEffect, useMemo, useState } from 'react';
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus, Sparkles, Loader2, Building2, ExternalLink, Users, Trash2, X, Pencil,
  ChevronDown, ChevronRight, MoreHorizontal, Linkedin, CheckCircle2, AlertCircle,
} from 'lucide-react';
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
  DiscoveryEnrichment,
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
  leadership?: { name: string; role?: string | null }[];
  confidence?: 'high' | 'medium' | 'low';
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
  const [editing, setEditing] = useState<DiscoveryOrganization | null>(null);
  const [viewing, setViewing] = useState<DiscoveryOrganization | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DiscoveryOrganization | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<DiscoveryOrgStatus | 'all'>('all');

  const enrichOne = async (org: DiscoveryOrganization) => {
    setEnrichingId(org.id);
    try {
      const { data, error } = await supabase.functions.invoke('discovery-enrich-org', {
        body: { organization_id: org.id },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Enrichment failed');
      }
      const created = (data as any)?.contacts_created || 0;
      const verified = (data as any)?.website_verified;
      toast.success(
        `Enriched ${org.name}` +
        (created > 0 ? ` · ${created} contact${created === 1 ? '' : 's'} added` : '') +
        (verified === false ? ' · website not verified' : ''),
      );
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Enrichment failed');
    } finally {
      setEnrichingId(null);
    }
  };

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

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: orgs.length };
    for (const s of statusOptions) c[s] = 0;
    for (const o of orgs) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [orgs]);

  const filteredOrgs = useMemo(
    () => (statusFilter === 'all' ? orgs : orgs.filter((o) => o.status === statusFilter)),
    [orgs, statusFilter],
  );

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

      {orgs.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {(['all', ...statusOptions] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{statusCounts[s] || 0}</Badge>
            </Button>
          ))}
        </div>
      )}

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
      ) : filteredOrgs.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No organisations with status "{statusFilter.replace(/_/g, ' ')}".
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead className="w-24">Tier</TableHead>
                <TableHead className="w-40">Status</TableHead>
                <TableHead className="w-24 text-right">Contacts</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrgs.map((o) => {
                const isOpen = expanded.has(o.id);
                const e = o.enrichment as DiscoveryEnrichment | null | undefined;
                return (
                  <Fragment key={o.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggleExpand(o.id)}>
                      <TableCell className="align-top">
                        <button className="p-0.5 hover:bg-muted rounded" aria-label="Expand">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <button className="text-left hover:underline" onClick={(ev) => { ev.stopPropagation(); setViewing(o); }}>
                            {o.name}
                          </button>
                          {o.enriched_at && (
                            <span title="Enriched" className="text-primary"><Sparkles className="h-3 w-3" /></span>
                          )}
                          {o.linkedin_url && (
                            <a href={o.linkedin_url} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="text-primary" title="Company LinkedIn">
                              <Linkedin className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {o.domain ? (
                          <span className="inline-flex items-center gap-1">
                            <a href={`https://${o.domain}`} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="text-primary hover:underline inline-flex items-center gap-1">
                              {o.domain}<ExternalLink className="h-3 w-3" />
                            </a>
                            {o.enriched_at && (
                              o.website_verified
                                ? <CheckCircle2 className="h-3 w-3 text-green-600" aria-label="Website verified" />
                                : <AlertCircle className="h-3 w-3 text-amber-600" aria-label="Website not verified" />
                            )}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell><Badge variant="outline">{o.tier || '—'}</Badge></TableCell>
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <Select value={o.status} onValueChange={async (v) => {
                          await (supabase as any).from('discovery_organizations').update({ status: v }).eq('id', o.id);
                          refresh();
                        }}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {roleCounts[o.id]?.contacts || 0}
                        <span className="text-muted-foreground"> / {roleCounts[o.id]?.roles || 0} roles</span>
                      </TableCell>
                      <TableCell className="text-right" onClick={(ev) => ev.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Actions for ${o.name}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => enrichOne(o)} disabled={enrichingId === o.id}>
                              {enrichingId === o.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                              {o.enriched_at ? 'Re-enrich' : 'Enrich'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setRolesFor(o)}>
                              <Users className="h-4 w-4 mr-2" /> Find roles
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditing(o)}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(o)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={o.id + '-exp'} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell colSpan={6} className="py-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="space-y-1.5">
                              <div className="font-medium uppercase tracking-wide text-muted-foreground text-[10px]">Leaders</div>
                              {Array.isArray(o.leadership) && o.leadership.length > 0 ? (
                                <ul className="space-y-1">
                                  {o.leadership.slice(0, 6).map((l, i) => (
                                    <li key={i} className="flex items-center gap-1.5">
                                      <span className="truncate">
                                        <strong>{l.name}</strong>
                                        {l.role && <span className="text-muted-foreground"> · {l.role}</span>}
                                      </span>
                                      {l.linkedin_url && (
                                        <a href={l.linkedin_url} target="_blank" rel="noreferrer" className="text-primary shrink-0" title="LinkedIn">
                                          <Linkedin className="h-3 w-3" />
                                        </a>
                                      )}
                                    </li>
                                  ))}
                                  {o.leadership.length > 6 && <li className="text-muted-foreground">+{o.leadership.length - 6} more</li>}
                                </ul>
                              ) : <div className="text-muted-foreground">No leaders yet. Enrich to discover.</div>}
                            </div>
                            <div className="space-y-1.5">
                              <div className="font-medium uppercase tracking-wide text-muted-foreground text-[10px]">Matched signals</div>
                              {o.signals_matched?.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {o.signals_matched.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
                                </div>
                              ) : <div className="text-muted-foreground">—</div>}
                              {o.fit_notes && (
                                <>
                                  <div className="font-medium uppercase tracking-wide text-muted-foreground text-[10px] mt-2">Fit notes</div>
                                  <p className="whitespace-pre-wrap line-clamp-4">{o.fit_notes}</p>
                                </>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <div className="font-medium uppercase tracking-wide text-muted-foreground text-[10px]">Enrichment</div>
                              {o.enriched_at ? (
                                <>
                                  <div>Confidence: <strong>{o.confidence || '—'}</strong></div>
                                  <div>Website: {o.website_verified
                                    ? <span className="text-green-700 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> verified</span>
                                    : <span className="text-amber-700 inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> unverified</span>}</div>
                                  {o.linkedin_url && (
                                    <div><a href={o.linkedin_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1"><Linkedin className="h-3 w-3" /> Company LinkedIn</a></div>
                                  )}
                                  {e?.industry && <div>Industry: {e.industry}</div>}
                                  {e?.hq_location && <div>HQ: {e.hq_location}</div>}
                                  {e?.employee_range && <div>Employees: {e.employee_range}</div>}
                                  <div className="text-muted-foreground">Last enriched {new Date(o.enriched_at).toLocaleDateString()}</div>
                                </>
                              ) : (
                                <div className="text-muted-foreground">Not enriched yet. Use the actions menu to run enrichment.</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {addOpen && <AddOrgSheet campaign={campaign} onClose={() => { setAddOpen(false); refresh(); }} />}
      {rolesFor && <FindRolesSheet org={rolesFor} personas={personas} onClose={() => { setRolesFor(null); refresh(); }} />}
      {editing && <EditOrgSheet org={editing} campaign={campaign} onClose={() => { setEditing(null); refresh(); }} />}
      {viewing && <OrgDetailSheet org={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); }} onEnrich={() => { enrichOne(viewing); setViewing(null); }} enriching={enrichingId === viewing.id} />}

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
  const [saved, setSaved] = useState<(FindCandidate & { _rowId: string })[]>([]);
  const [debug, setDebug] = useState<any | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [skippedCount, setSkippedCount] = useState<number>(0);

  const run = async () => {
    setRunning(true);
    setSaved([]);
    setDebug(null);
    setSavedCount(null);
    setSkippedCount(0);

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
    setDebug((data as any)?.debug || null);
    if (cands.length === 0) return;

    // Dedupe against existing orgs on this campaign (by lower(domain) or lower(name))
    const { data: existing } = await (supabase as any)
      .from('discovery_organizations')
      .select('name, domain')
      .eq('campaign_id', campaign.id);
    const existingKeys = new Set<string>(
      (existing || []).map((o: any) => (o.domain || o.name || '').toLowerCase()).filter(Boolean)
    );
    const fresh: FindCandidate[] = [];
    let skipped = 0;
    for (const c of cands) {
      const key = (c.domain || c.name || '').toLowerCase();
      if (!key || existingKeys.has(key)) { skipped++; continue; }
      existingKeys.add(key);
      fresh.push(c);
    }
    setSkippedCount(skipped);

    if (fresh.length === 0) {
      setSavedCount(0);
      await onAdded();
      return;
    }

    const rows = fresh.map((c) => ({
      campaign_id: campaign.id,
      name: c.name,
      domain: c.domain,
      tier: c.suggested_tier,
      signals_matched: c.matched_signals,
      fit_notes: c.rationale,
      source: 'firecrawl',
      source_url: c.source_url,
      leadership: Array.isArray(c.leadership) ? c.leadership : [],
      confidence: c.confidence || null,
    }));
    const { data: inserted, error: insErr } = await (supabase as any)
      .from('discovery_organizations').insert(rows).select('id, name, domain');
    if (insErr) {
      toast.error(`Saved 0 organisations: ${insErr.message}`);
      return;
    }
    setSavedCount(inserted?.length || rows.length);
    setSaved(fresh.map((c, i) => ({ ...c, _rowId: inserted?.[i]?.id || '' })));
    toast.success(`Saved ${inserted?.length || rows.length} organisation${(inserted?.length || rows.length) === 1 ? '' : 's'}`);
    await onAdded();
  };

  const removeOne = async (rowId: string) => {
    if (!rowId) return;
    const { error } = await (supabase as any).from('discovery_organizations').delete().eq('id', rowId);
    if (error) { toast.error(error.message); return; }
    setSaved((prev) => prev.filter((r) => r._rowId !== rowId));
    await onAdded();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Find organisations</h3>
            <p className="text-xs text-muted-foreground">Searches the web for real prospective customers matching this campaign's target segment. Results are saved automatically — remove any you don't want.</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close search"><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={run} disabled={running} size="sm">
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {running ? 'Searching…' : hasRun ? 'Run another search' : 'Run search'}
          </Button>
          {savedCount !== null && (
            <span className="text-xs text-muted-foreground">
              Saved {savedCount}{skippedCount > 0 ? ` · skipped ${skippedCount} duplicate${skippedCount === 1 ? '' : 's'}` : ''}
            </span>
          )}
        </div>

        {saved.length > 0 && (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto border rounded p-2">
            {saved.map((c) => (
              <div key={c._rowId} className="flex gap-2 p-2 rounded hover:bg-muted/50">
                <div className="flex-1 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong>{c.name}</strong>
                    <Badge variant="outline" className="text-xs">{c.suggested_tier}</Badge>
                    {c.confidence && (
                      <Badge variant={c.confidence === 'high' ? 'default' : 'secondary'} className="text-[10px]" title="AI confidence this matches the ICP">
                        {c.confidence} confidence
                      </Badge>
                    )}
                    {c.domain && <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">{c.domain}<ExternalLink className="h-3 w-3" /></a>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{c.rationale}</p>
                  {Array.isArray(c.leadership) && c.leadership.length > 0 && (
                    <div className="mt-1 text-xs">
                      <span className="text-muted-foreground">Leaders: </span>
                      {c.leadership.map((l, j) => (
                        <Badge key={j} variant="outline" className="text-[10px] mr-1">{l.name}{l.role ? ` · ${l.role}` : ''}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">{c.matched_signals.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}</div>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeOne(c._rowId)} aria-label={`Remove ${c.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}


        {hasRun && !running && debug && (
          <div className="rounded border bg-muted/30 p-3 text-xs space-y-2">
            <div className="font-medium text-sm">
              {savedCount === 0 ? 'No candidates returned' : 'Search diagnostics'}
            </div>
            {savedCount === 0 && (
              <p className="text-muted-foreground">No time filter is applied to the search. If results are sparse, broaden the target segment or qualifying signals.</p>
            )}
            <div className="space-y-1 text-muted-foreground">
              {Array.isArray(debug.query_variants) && (
                <div><span className="font-medium text-foreground">Queries tried:</span>
                  <ul className="list-disc pl-5">{debug.query_variants.map((q: string, i: number) => <li key={i}><code className="text-[11px]">{q}</code></li>)}</ul>
                </div>
              )}
              <div className="flex gap-3 flex-wrap">
                {typeof debug.raw_hit_count === 'number' && <span>Raw hits: <strong>{debug.raw_hit_count}</strong></span>}
                {typeof debug.direct_hits === 'number' && <span>Direct: <strong>{debug.direct_hits}</strong></span>}
                {typeof debug.article_sources === 'number' && <span>Article sources: <strong>{debug.article_sources}</strong></span>}
                {typeof debug.articles_scraped === 'number' && <span>Articles scraped: <strong>{debug.articles_scraped}</strong></span>}
                {typeof debug.extracted_from_articles === 'number' && <span>Extracted from articles: <strong>{debug.extracted_from_articles}</strong></span>}
                {typeof debug.merged_candidates === 'number' && <span>Merged: <strong>{debug.merged_candidates}</strong></span>}
                {typeof debug.ai_returned === 'number' && <span>AI kept: <strong>{debug.ai_returned}</strong></span>}
              </div>
              {debug.ai_note && <div><span className="font-medium text-foreground">AI note:</span> {debug.ai_note}</div>}
              {Array.isArray(debug.scrape_outcomes) && debug.scrape_outcomes.length > 0 && (
                <details>
                  <summary className="cursor-pointer">Scrape outcomes ({debug.scrape_outcomes.filter((s: any) => s.kept).length}/{debug.scrape_outcomes.length} kept)</summary>
                  <ul className="list-disc pl-5 mt-1">
                    {debug.scrape_outcomes.map((s: any, i: number) => (
                      <li key={i}>
                        <span className={s.kept ? 'text-foreground' : ''}>{s.title || s.url}</span>
                        {' — '}HTTP {s.http_status}, {s.markdown_length} chars, {s.attempts} attempt{s.attempts === 1 ? '' : 's'} {s.kept ? '✓ kept' : '✗ dropped'}
                        {s.error && <span className="text-destructive"> ({s.error})</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {Array.isArray(debug.ai_dropped) && debug.ai_dropped.length > 0 && (
                <details>
                  <summary className="cursor-pointer">AI rejected ({debug.ai_dropped.length})</summary>
                  <ul className="list-disc pl-5 mt-1">
                    {debug.ai_dropped.map((d: any, i: number) => (
                      <li key={i}><span className="text-foreground">{d.name}</span> — {d.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
              {Array.isArray(debug.sample_dropped) && debug.sample_dropped.length > 0 && (
                <details>
                  <summary className="cursor-pointer">Filtered search results ({debug.sample_dropped.length})</summary>
                  <ul className="list-disc pl-5 mt-1">
                    {debug.sample_dropped.map((d: any, i: number) => (
                      <li key={i}><span className="text-foreground">{d.title || '(no title)'}</span> — {d.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
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

function EditOrgSheet({ org, campaign, onClose }: { org: DiscoveryOrganization; campaign: DiscoveryCampaign; onClose: () => void }) {
  const [name, setName] = useState(org.name);
  const [domain, setDomain] = useState(org.domain || '');
  const [segment, setSegment] = useState(org.segment || '');
  const [tier, setTier] = useState(org.tier || '');
  const [status, setStatus] = useState<DiscoveryOrgStatus>(org.status);
  const [confidence, setConfidence] = useState<string>(org.confidence || '');
  const [signals, setSignals] = useState<string[]>(org.signals_matched || []);
  const [sourceUrl, setSourceUrl] = useState(org.source_url || '');
  const [fitNotes, setFitNotes] = useState(org.fit_notes || '');
  const [leaders, setLeaders] = useState<{ name: string; role?: string | null }[]>(
    Array.isArray(org.leadership) ? org.leadership.map((l) => ({ name: l.name, role: l.role || '' })) : []
  );
  const [saving, setSaving] = useState(false);
  const allSignals = Array.from(new Set([...(campaign.qualifying_signals || []), ...(campaign.disqualifying_signals || []), ...(org.signals_matched || [])]));

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const { error } = await (supabase as any).from('discovery_organizations').update({
      name: name.trim(),
      domain: domain.trim() || null,
      segment: segment.trim() || null,
      tier: tier || null,
      status,
      confidence: confidence || null,
      signals_matched: signals,
      source_url: sourceUrl.trim() || null,
      fit_notes: fitNotes.trim() || null,
      leadership: leaders.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), role: l.role?.trim() || null })),
    }).eq('id', org.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved');
    onClose();
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Edit organisation</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Domain</Label><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" /></div>
            <div><Label>Segment</Label><Input value={segment} onChange={(e) => setSegment(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger><SelectValue placeholder="Tier" /></SelectTrigger>
                <SelectContent>{campaign.tiers.map((t) => <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DiscoveryOrgStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Confidence</Label>
              <Select value={confidence || 'none'} onValueChange={(v) => setConfidence(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="low">low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Source URL</Label><Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} /></div>
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
          <div>
            <div className="flex items-center justify-between">
              <Label>Leadership</Label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setLeaders([...leaders, { name: '', role: '' }])}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-1 mt-1">
              {leaders.map((l, i) => (
                <div key={i} className="flex gap-1">
                  <Input placeholder="Name" value={l.name} onChange={(e) => {
                    const next = [...leaders]; next[i] = { ...next[i], name: e.target.value }; setLeaders(next);
                  }} />
                  <Input placeholder="Role" value={l.role || ''} onChange={(e) => {
                    const next = [...leaders]; next[i] = { ...next[i], role: e.target.value }; setLeaders(next);
                  }} />
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive"
                    onClick={() => setLeaders(leaders.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div><Label>Fit notes</Label><Textarea rows={4} value={fitNotes} onChange={(e) => setFitNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OrgDetailSheet({ org, onClose, onEdit, onEnrich, enriching }: {
  org: DiscoveryOrganization; onClose: () => void; onEdit: () => void; onEnrich: () => void; enriching: boolean;
}) {
  const e: DiscoveryEnrichment | null | undefined = org.enrichment;
  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {org.name}
            {org.domain && <a href={`https://${org.domain}`} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">{org.domain}<ExternalLink className="h-3 w-3" /></a>}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4 text-sm">
          <div className="flex flex-wrap gap-2">
            {org.tier && <Badge variant="outline">{org.tier}</Badge>}
            <Badge variant="secondary">{org.status.replace(/_/g, ' ')}</Badge>
            {org.confidence && <Badge>{org.confidence} confidence</Badge>}
            {org.enriched_at && <Badge variant="outline" className="text-[10px]"><Sparkles className="h-2.5 w-2.5 mr-1" />enriched {new Date(org.enriched_at).toLocaleDateString()}</Badge>}
          </div>

          {e?.description && <p>{e.description}</p>}

          {(e?.industry || e?.hq_location || e?.employee_range || e?.founded_year) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {e.industry && <div><span className="text-muted-foreground">Industry:</span> {e.industry}</div>}
              {e.hq_location && <div><span className="text-muted-foreground">HQ:</span> {e.hq_location}</div>}
              {e.employee_range && <div><span className="text-muted-foreground">Employees:</span> {e.employee_range}</div>}
              {e.founded_year && <div><span className="text-muted-foreground">Founded:</span> {e.founded_year}</div>}
            </div>
          )}

          {Array.isArray(e?.products) && e!.products!.length > 0 && (
            <div><div className="text-xs text-muted-foreground mb-1">Products</div>
              <div className="flex flex-wrap gap-1">{e!.products!.map((p) => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}</div>
            </div>
          )}

          {Array.isArray(e?.tech_focus) && e!.tech_focus!.length > 0 && (
            <div><div className="text-xs text-muted-foreground mb-1">Tech focus</div>
              <div className="flex flex-wrap gap-1">{e!.tech_focus!.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}</div>
            </div>
          )}

          {org.signals_matched?.length > 0 && (
            <div><div className="text-xs text-muted-foreground mb-1">Matched signals</div>
              <div className="flex flex-wrap gap-1">{org.signals_matched.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}</div>
            </div>
          )}

          {Array.isArray(org.leadership) && org.leadership.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Leadership</div>
              <ul className="space-y-1">
                {org.leadership.map((l, i) => (
                  <li key={i} className="text-sm">
                    <strong>{l.name}</strong>{l.role ? <span className="text-muted-foreground"> — {l.role}</span> : null}
                    {(l as any).source_url && <a href={(l as any).source_url} target="_blank" rel="noreferrer" className="text-primary text-xs ml-2 inline-flex items-center gap-1">source<ExternalLink className="h-3 w-3" /></a>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {e?.fit_rationale && (
            <div><div className="text-xs text-muted-foreground mb-1">Fit rationale</div><p className="text-sm">{e.fit_rationale}</p></div>
          )}

          {org.fit_notes && (
            <div><div className="text-xs text-muted-foreground mb-1">Notes</div><p className="whitespace-pre-wrap text-sm">{org.fit_notes}</p></div>
          )}

          {Array.isArray(e?.sources) && e!.sources!.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Sources</div>
              <ul className="space-y-0.5">
                {e!.sources!.map((s, i) => (
                  <li key={i}><a href={s} target="_blank" rel="noreferrer" className="text-primary text-xs inline-flex items-center gap-1 break-all">{s}<ExternalLink className="h-3 w-3 shrink-0" /></a></li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onEnrich} disabled={enriching}>
              {enriching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {org.enriched_at ? 'Re-enrich' : 'Enrich'}
            </Button>
            <Button onClick={onEdit}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
