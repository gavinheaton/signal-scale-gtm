import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff, Loader2, Zap, Trash2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  projectId: string;
}

interface ConnectionState {
  connected: boolean;
  target: 'personal' | 'company';
  toneSyncedAt: string | null;
}

export default function PropresenceConnectionCard({ projectId }: Props) {
  const [state, setState] = useState<ConnectionState>({ connected: false, target: 'company', toneSyncedAt: null });
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [target, setTarget] = useState<'personal' | 'company'>('company');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [{ data: conn }, { data: project }] = await Promise.all([
      supabase
        .from('project_connections')
        .select('id')
        .eq('project_id', projectId)
        .eq('provider', 'propresence')
        .maybeSingle(),
      supabase
        .from('projects')
        .select('propresence_target, propresence_tone_synced_at')
        .eq('id', projectId)
        .maybeSingle(),
    ]);
    const t = ((project as any)?.propresence_target as 'personal' | 'company') || 'company';
    setState({
      connected: !!conn,
      target: t,
      toneSyncedAt: (project as any)?.propresence_tone_synced_at || null,
    });
    setTarget(t);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [projectId]);

  const handleConnect = async () => {
    if (!apiKey) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('manage-propresence-connection', {
      body: { project_id: projectId, api_key: apiKey, target },
    });
    setSaving(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to connect ProPresence');
      return;
    }
    toast.success('ProPresence connected');
    setApiKey('');
    setShowKey(false);
    await refresh();
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    const { data, error } = await supabase.functions.invoke('manage-propresence-connection', {
      method: 'DELETE',
      body: { project_id: projectId },
    });
    setDisconnecting(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to disconnect');
      return;
    }
    toast.success('ProPresence disconnected');
    await refresh();
  };

  const handleSync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke('sync-tone-to-propresence', {
      body: { project_id: projectId },
    });
    setSyncing(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Sync failed');
      return;
    }
    toast.success('Brand voice synced to ProPresence');
    await refresh();
  };

  const handleTargetChange = async (next: 'personal' | 'company') => {
    setTarget(next);
    if (!state.connected) return;
    const { error } = await supabase.functions.invoke('manage-propresence-connection', {
      method: 'PATCH',
      body: { project_id: projectId, target: next },
    });
    if (error) toast.error('Failed to update target');
    else { toast.success('Target updated'); setState(s => ({ ...s, target: next })); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" style={{ color: 'hsl(var(--purple))' }} />
          ProPresence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : state.connected ? (
          <>
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Connected</p>
                  <p className="text-xs text-muted-foreground">
                    Target: <span className="font-medium capitalize">{state.target}</span>
                    {state.toneSyncedAt && (
                      <> · Last tone sync: {new Date(state.toneSyncedAt).toLocaleString()}</>
                    )}
                  </p>
                </div>
              </div>
              <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Connected</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Target</Label>
                <Select value={target} onValueChange={(v) => handleTargetChange(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSync} disabled={syncing} variant="default">
                {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync brand voice now
              </Button>
              <Button onClick={handleDisconnect} disabled={disconnecting} variant="outline" className="text-destructive">
                {disconnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Push brand voice and approved campaign assets directly into ProPresence for publishing.
            </p>
            <div>
              <Label>ProPresence API Key</Label>
              <div className="relative mt-1">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="ppk_live_..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10"
                  onClick={() => setShowKey(s => !s)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div>
              <Label>Target</Label>
              <Select value={target} onValueChange={(v) => setTarget(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleConnect} disabled={!apiKey || saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Connect
            </Button>
            <p className="text-xs text-muted-foreground">
              Your key is encrypted via Supabase Vault and never exposed to the browser.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
