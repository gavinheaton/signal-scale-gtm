import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { EcosystemCanvas } from '@/components/ecosystem/EcosystemCanvas';
import { AddNodeDialog } from '@/components/ecosystem/AddNodeDialog';

interface EcosystemMap { id: string; project_id: string; name: string; layout_mode: string }

export default function Ecosystem() {
  const { currentProject } = useProject();
  const [map, setMap] = useState<EcosystemMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!currentProject) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('ecosystem_maps').select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: true }).limit(1);
      let m = (data || [])[0] as EcosystemMap | undefined;
      if (!m) {
        const ins = await (supabase as any)
          .from('ecosystem_maps').insert({ project_id: currentProject.id, name: 'Ecosystem Map' })
          .select('*').single();
        m = ins.data as EcosystemMap;
      }
      setMap(m || null);
      setLoading(false);
    })();
  }, [currentProject]);

  async function runSync() {
    if (!map) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ecosystem-sync', { body: { map_id: map.id } });
      if (error) throw error;
      const counts = (data as any)?.counts;
      toast.success(`Synced • ${counts?.segments || 0} segments · ${counts?.companies || 0} companies · ${counts?.roles || 0} roles · ${counts?.people || 0} people`);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message || e}`);
    } finally {
      setSyncing(false);
    }
  }

  if (!currentProject) {
    return <div className="p-8 text-muted-foreground">Select a project to view its ecosystem.</div>;
  }
  if (loading || !map) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading map…</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div>
          <h1 className="text-xl font-semibold">Ecosystem Map</h1>
          <p className="text-xs text-muted-foreground">
            Phase 5 · Your project sits at the centre; segments, companies, roles and people radiate outward.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add node
          </Button>
          <Button size="sm" onClick={runSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sync from data
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <EcosystemCanvas mapId={map.id} projectId={map.project_id} refreshKey={refreshKey} />
      </div>
      <AddNodeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mapId={map.id}
        projectId={map.project_id}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
