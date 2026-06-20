import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface SyncStatus {
  supabase: { campaigns: number; assets: number; personas: number };
  notion: { calendar_entries: number; pillars: number; foundations: number };
  last_synced_at: string | null;
  databases_accessible: { calendar: boolean; pillars: boolean; foundations: boolean };
  gaps: { assets_not_in_notion: number };
}

interface NotionSyncStatusProps {
  projectId: string;
  lastSyncedAt?: string | null;
}

export default function NotionSyncStatus({ projectId, lastSyncedAt }: NotionSyncStatusProps) {
  const [checking, setChecking] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const handleCheckSync = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-notion-sync', {
        body: { project_id: projectId },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Failed to check sync status');
        return;
      }
      setSyncStatus(data);
    } catch (err: any) {
      toast.error('Error: ' + (err.message || 'Unknown error'));
    } finally {
      setChecking(false);
    }
  };

  const displayLastSynced = syncStatus?.last_synced_at || lastSyncedAt;

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {displayLastSynced ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              Last synced {formatDistanceToNow(new Date(displayLastSynced), { addSuffix: true })}
            </>
          ) : (
            <span>Never synced</span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={handleCheckSync} disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Check Sync
        </Button>
      </div>

      {syncStatus && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-xs">Database</TableHead>
                <TableHead className="h-8 text-xs text-right">Supabase</TableHead>
                <TableHead className="h-8 text-xs text-right">Notion</TableHead>
                <TableHead className="h-8 text-xs text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="py-2 text-sm font-medium">Calendar</TableCell>
                <TableCell className="py-2 text-sm text-right">{syncStatus.supabase.assets}</TableCell>
                <TableCell className="py-2 text-sm text-right">{syncStatus.notion.calendar_entries}</TableCell>
                <TableCell className="py-2 text-center">
                  {syncStatus.databases_accessible.calendar ? (
                    syncStatus.gaps.assets_not_in_notion === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-orange-500 mx-auto" />
                    )
                  ) : (
                    <Badge variant="destructive" className="text-xs">Inaccessible</Badge>
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="py-2 text-sm font-medium">Pillars</TableCell>
                <TableCell className="py-2 text-sm text-right">—</TableCell>
                <TableCell className="py-2 text-sm text-right">{syncStatus.notion.pillars}</TableCell>
                <TableCell className="py-2 text-center">
                  {syncStatus.databases_accessible.pillars ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                  ) : (
                    <Badge variant="destructive" className="text-xs">Inaccessible</Badge>
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="py-2 text-sm font-medium">Foundations</TableCell>
                <TableCell className="py-2 text-sm text-right">{syncStatus.supabase.personas}</TableCell>
                <TableCell className="py-2 text-sm text-right">{syncStatus.notion.foundations}</TableCell>
                <TableCell className="py-2 text-center">
                  {syncStatus.databases_accessible.foundations ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                  ) : (
                    <Badge variant="destructive" className="text-xs">Inaccessible</Badge>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {syncStatus.gaps.assets_not_in_notion > 0 && (
            <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-500/10 rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {syncStatus.gaps.assets_not_in_notion} asset{syncStatus.gaps.assets_not_in_notion !== 1 ? 's' : ''} not yet pushed to Notion
            </div>
          )}
        </div>
      )}
    </div>
  );
}
