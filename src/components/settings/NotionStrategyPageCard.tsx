import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  projectId: string;
  notionConfigured: boolean;
  initialPageId: string | null;
  initialSyncedAt: string | null;
}

function extractPageId(input: string): string {
  const trimmed = input.trim();
  // Match a 32-char hex (with or without dashes) near the end of a Notion URL or raw id
  const m = trimmed.match(/([0-9a-f]{32})/i) || trimmed.match(/([0-9a-f-]{36})/i);
  if (m) return m[1].replace(/-/g, '');
  return trimmed;
}

function relTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); return `${d}d ago`;
}

export default function NotionStrategyPageCard({ projectId, notionConfigured, initialPageId, initialSyncedAt }: Props) {
  const [pageId, setPageId] = useState(initialPageId || '');
  const [savedPageId, setSavedPageId] = useState(initialPageId || '');
  const [syncedAt, setSyncedAt] = useState<string | null>(initialSyncedAt);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setPageId(initialPageId || '');
    setSavedPageId(initialPageId || '');
    setSyncedAt(initialSyncedAt);
  }, [initialPageId, initialSyncedAt, projectId]);

  const handleSave = async () => {
    const id = extractPageId(pageId);
    setSaving(true);
    const { error } = await supabase
      .from('projects')
      .update({ notion_strategy_page_id: id || null } as any)
      .eq('id', projectId);
    setSaving(false);
    if (error) return toast.error('Failed to save: ' + error.message);
    setSavedPageId(id);
    setPageId(id);
    toast.success(id ? 'Strategy page saved' : 'Strategy page cleared');
  };

  const handleTest = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke('test-notion-strategy-page', {
      body: { project_id: projectId, page_id: extractPageId(pageId) },
    });
    setTesting(false);
    if (error) return toast.error(error.message || 'Test failed');
    if (data?.ok) toast.success(`Connected — page "${data.title}"`);
    else toast.error(data?.error || 'Connection failed');
  };

  const handleSync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke('sync-strategy-to-notion', {
      body: { project_id: projectId },
    });
    setSyncing(false);
    if (error || data?.error) return toast.error(data?.error || error?.message || 'Sync failed');
    setSyncedAt(data?.synced_at || new Date().toISOString());
    toast.success('Strategy synced to Notion', {
      action: savedPageId
        ? { label: 'Open', onClick: () => window.open(`https://notion.so/${savedPageId.replace(/-/g, '')}`, '_blank') }
        : undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Notion Strategy Page
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Push ICPs, brand voice, and active campaigns into a single Notion page for the team to read.
        </p>

        {!notionConfigured && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">
            Add your Notion integration token in <strong>Connections</strong> above, then share the strategy page with that integration in Notion.
          </div>
        )}

        <div>
          <Label>Strategy Page ID</Label>
          <Input
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            placeholder="32-character page ID or full Notion URL"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Paste the Notion page URL — we'll extract the 32-character ID. The page must be shared with your integration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={saving || pageId === savedPageId}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || !pageId || !notionConfigured}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test connection'}
          </Button>
          {savedPageId && (
            <Button variant="outline" onClick={handleSync} disabled={syncing || !notionConfigured}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync now
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Last synced:</span>
          <Badge variant="secondary">{relTime(syncedAt)}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
