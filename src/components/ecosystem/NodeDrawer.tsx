import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Trash2, EyeOff, Eye, ExternalLink, Send, Save } from 'lucide-react';
import { toast } from 'sonner';
import { STAKEHOLDER_ROLES, ROLE_LABEL } from '@/lib/ecosystemRoles';

interface DbNode {
  id: string; kind: string; label: string; subtitle: string | null;
  ring: number | null; readiness_score: number | null;
  hidden: boolean; stale: boolean; ref_table: string | null; ref_id: string | null; meta: any;
}

interface Props { node: DbNode | null; projectId: string; onClose: () => void; onChanged: () => void }

const REF_LINKS: Record<string, (id: string) => string> = {
  icps: () => `/project/icp-personas`,
  personas: () => `/project/icp-personas`,
  discovery_organizations: () => `/project/discovery`,
  discovery_contacts: () => `/project/discovery`,
  discovery_themes: () => `/project/discovery`,
  discovery_insights: () => `/project/discovery`,
  competitors: () => `/project/competitors`,
  competitive_whitespace: () => `/project/competitors`,
};

const ORG_LIKE = new Set([
  'stakeholder', 'funder', 'infrastructure_owner', 'research_body',
  'partner', 'regulator', 'competitor', 'channel', 'community', 'company', 'influencer',
]);

export function NodeDrawer({ node, projectId, onClose, onChanged }: Props) {
  const [details, setDetails] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setRoles(Array.isArray(node?.meta?.roles) ? node!.meta.roles : []);
    if (!node?.ref_table || !node.ref_id) { setDetails(null); return; }
    if (node.ref_table === 'discovery_leadership') { setDetails(null); return; }
    (async () => {
      const { data } = await (supabase as any).from(node.ref_table!).select('*').eq('id', node.ref_id!).maybeSingle();
      setDetails(data);
    })();
  }, [node]);

  if (!node) return null;

  async function toggleHide() {
    await (supabase as any).from('ecosystem_nodes').update({ hidden: !node!.hidden }).eq('id', node!.id);
    toast.success(node!.hidden ? 'Restored' : 'Hidden');
    onChanged(); onClose();
  }
  async function remove() {
    if (!confirm('Delete this node? Synced nodes will reappear on next sync.')) return;
    await (supabase as any).from('ecosystem_nodes').delete().eq('id', node!.id);
    toast.success('Deleted');
    onChanged(); onClose();
  }

  async function saveRoles() {
    setSavingRoles(true);
    const meta = { ...(node!.meta || {}), roles };
    const { error } = await (supabase as any).from('ecosystem_nodes').update({ meta }).eq('id', node!.id);
    setSavingRoles(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Roles saved');
    onChanged();
  }

  async function sendToDiscovery() {
    setSending(true);
    try {
      const { data: camps } = await (supabase as any)
        .from('discovery_campaigns').select('id, name, status')
        .eq('project_id', projectId).order('created_at', { ascending: false });
      const camp = (camps || []).find((c: any) => c.status === 'active') || (camps || [])[0];
      if (!camp) { toast.error('Create a discovery campaign first'); return; }

      const { data: dupes } = await (supabase as any)
        .from('discovery_organizations').select('id')
        .eq('campaign_id', camp.id).ilike('name', node!.label);
      if ((dupes || []).length) { toast.info(`${node!.label} is already in ${camp.name}`); return; }

      const { error } = await (supabase as any).from('discovery_organizations').insert({
        campaign_id: camp.id,
        name: node!.label,
        domain: node!.meta?.domain || null,
        segment: node!.subtitle || null,
        source: 'manual',
        status: 'researching',
        fit_notes: [
          'Added from the ecosystem map.',
          roles.length ? `Roles: ${roles.map((r) => ROLE_LABEL[r] || r).join(', ')}.` : '',
          node!.meta?.rationale || '',
        ].filter(Boolean).join(' '),
      });
      if (error) throw error;
      toast.success(`Sent to Discovery · ${camp.name}`);
    } catch (e: any) {
      toast.error(`Could not send: ${e.message || e}`);
    } finally {
      setSending(false);
    }
  }

  const link = node.ref_table && REF_LINKS[node.ref_table]?.(node.ref_id!);
  const canSendToDiscovery = ORG_LIKE.has(node.kind) && node.ref_table !== 'discovery_organizations';

  return (
    <Sheet open={!!node} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {node.label}
            <Badge variant="outline" className="text-[10px] uppercase">{node.kind}</Badge>
          </SheetTitle>
          {node.subtitle && <SheetDescription>{node.subtitle}</SheetDescription>}
        </SheetHeader>

        <div className="mt-4 space-y-3 text-sm">
          {ORG_LIKE.has(node.kind) && (
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Roles in this ecosystem</Label>
              <p className="text-[11px] text-muted-foreground mb-2">
                Tick every role that applies — one organisation can be a client, a funder and an
                infrastructure owner at the same time.
              </p>
              <div className="grid grid-cols-2 gap-1">
                {STAKEHOLDER_ROLES.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={roles.includes(r.value)}
                      onCheckedChange={(v) =>
                        setRoles((rs) => (v ? [...rs, r.value] : rs.filter((x) => x !== r.value)))
                      }
                    />
                    {r.label}
                  </label>
                ))}
              </div>
              <Button size="sm" variant="outline" className="mt-2" onClick={saveRoles} disabled={savingRoles}>
                <Save className="h-3 w-3 mr-1" /> Save roles
              </Button>
            </div>
          )}

          {node.readiness_score != null && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Readiness</div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(node.readiness_score, 100)}%` }} />
              </div>
              <div className="text-xs mt-1">{node.readiness_score} / 100</div>
            </div>
          )}
          {node.stale && (
            <div className="text-xs p-2 rounded bg-amber-50 text-amber-900 border border-amber-200">
              This node's source record has been deleted. It will remain hidden unless restored or purged.
            </div>
          )}
          {node.meta?.rationale && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Why they matter</div>
              <p className="text-sm">{node.meta.rationale}</p>
            </div>
          )}
          {(node.kind === 'competitor' || node.kind === 'partner') && node.meta && (
            <div className="space-y-2">
              {node.meta.archetype_label && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Kind of player</div>
                  <div>{node.meta.archetype_label}</div>
                </div>
              )}
              {node.meta.positioning && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Positioning</div>
                  <p className="text-sm">{node.meta.positioning}</p>
                </div>
              )}
              {node.meta.leadership != null && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Market position</div>
                  <div className="text-sm">
                    Sector leadership {node.meta.leadership} / 100 · Differentiation {node.meta.differentiation} / 100
                  </div>
                  {node.meta.position_rationale && (
                    <p className="text-xs text-muted-foreground mt-1">{node.meta.position_rationale}</p>
                  )}
                  {Array.isArray(node.meta.cited_dimensions) && node.meta.cited_dimensions.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Based on: {node.meta.cited_dimensions.join(', ')}
                    </p>
                  )}
                </div>
              )}
              {Array.isArray(node.meta.strong_dimensions) && node.meta.strong_dimensions.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Strong on</div>
                  <div className="flex flex-wrap gap-1">
                    {node.meta.strong_dimensions.map((d: string) => (
                      <Badge key={d} variant="outline" className="text-[10px]">{d}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {node.ref_table === 'competitive_whitespace' && node.meta?.rationale && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Why this is open ground</div>
              <p className="text-sm">{node.meta.rationale}</p>
            </div>
          )}

          {details && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Source record</div>
              <pre className="text-[11px] bg-muted rounded p-2 overflow-auto max-h-64">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {link && (
            <Button variant="outline" size="sm" asChild>
              <Link to={link}><ExternalLink className="h-3 w-3 mr-1" /> Open source</Link>
            </Button>
          )}
          {canSendToDiscovery && (
            <Button variant="outline" size="sm" onClick={sendToDiscovery} disabled={sending}>
              <Send className="h-3 w-3 mr-1" /> Send to Discovery
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={toggleHide}>
            {node.hidden ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
            {node.hidden ? 'Restore' : 'Hide'}
          </Button>
          <Button variant="outline" size="sm" onClick={remove} className="text-destructive">
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
