import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Trash2, EyeOff, Eye, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface DbNode {
  id: string; kind: string; label: string; subtitle: string | null;
  ring: number | null; readiness_score: number | null;
  hidden: boolean; stale: boolean; ref_table: string | null; ref_id: string | null; meta: any;
}

interface Props { node: DbNode | null; onClose: () => void; onChanged: () => void }

const REF_LINKS: Record<string, (id: string) => string> = {
  icps: () => `/project/icp-personas`,
  personas: () => `/project/icp-personas`,
  discovery_organizations: () => `/project/discovery`,
  discovery_contacts: () => `/project/discovery`,
};

export function NodeDrawer({ node, onClose, onChanged }: Props) {
  const [details, setDetails] = useState<any>(null);

  useEffect(() => {
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

  const link = node.ref_table && REF_LINKS[node.ref_table]?.(node.ref_id!);

  return (
    <Sheet open={!!node} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[400px] sm:w-[440px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {node.label}
            <Badge variant="outline" className="text-[10px] uppercase">{node.kind}</Badge>
          </SheetTitle>
          {node.subtitle && <SheetDescription>{node.subtitle}</SheetDescription>}
        </SheetHeader>

        <div className="mt-4 space-y-3 text-sm">
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
          {details && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Source record</div>
              <pre className="text-[11px] bg-muted rounded p-2 overflow-auto max-h-64">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          )}
          {node.meta && Object.keys(node.meta).length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Meta</div>
              <pre className="text-[11px] bg-muted rounded p-2 overflow-auto max-h-40">
                {JSON.stringify(node.meta, null, 2)}
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
