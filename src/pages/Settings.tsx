import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { OrgRole } from '@/types/database';
import { Bot, FileText, Settings2, Trash2, Eye, EyeOff, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';
import ApiAccessCard from '@/components/settings/ApiAccessCard';

const PROVIDERS = [
  { id: 'claude' as const, name: 'Claude (Anthropic)', icon: Bot, description: 'Powers AI wizards for ICP & Persona generation' },
  { id: 'notion' as const, name: 'Notion', icon: FileText, description: 'Import research pages as context for wizards' },
];

export default function SettingsPage() {
  const { organisation, membership, hasMinRole } = useAuth();
  const { currentProject } = useProject();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('analyst');
  const [inviting, setInviting] = useState(false);

  // Connections state
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [configProvider, setConfigProvider] = useState<'claude' | 'notion' | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const canInvite = hasMinRole('admin');
  const canManageConnections = hasMinRole('admin');

  // Fetch existing connections
  useEffect(() => {
    if (!currentProject) return;
    setLoadingConnections(true);
    supabase
      .from('project_connections')
      .select('provider')
      .eq('project_id', currentProject.id)
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        data?.forEach((row: any) => { map[row.provider] = true; });
        setConnections(map);
        setLoadingConnections(false);
      });
  }, [currentProject]);

  const handleInvite = async () => {
    if (!inviteEmail || !organisation) return;
    setInviting(true);
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: inviteEmail, role: inviteRole, org_id: organisation.id },
    });
    setInviting(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Invite failed');
    } else {
      toast.success(data?.message || `Invite sent to ${inviteEmail}`);
      setInviteEmail('');
    }
  };

  const handleSaveConnection = async () => {
    if (!configProvider || !apiKeyInput || !currentProject) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('manage-project-connection', {
      body: { project_id: currentProject.id, provider: configProvider, api_key: apiKeyInput },
    });
    setSaving(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to save connection');
    } else {
      toast.success(`${configProvider === 'claude' ? 'Claude' : 'Notion'} API key saved`);
      setConnections(prev => ({ ...prev, [configProvider]: true }));
      setConfigProvider(null);
      setApiKeyInput('');
      setShowKey(false);
    }
  };

  const handleDisconnect = async (provider: string) => {
    if (!currentProject) return;
    setDisconnecting(provider);
    const { data, error } = await supabase.functions.invoke('manage-project-connection', {
      method: 'DELETE',
      body: { project_id: currentProject.id, provider },
    });
    setDisconnecting(null);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to disconnect');
    } else {
      toast.success(`${provider === 'claude' ? 'Claude' : 'Notion'} disconnected`);
      setConnections(prev => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      <Card>
        <CardHeader><CardTitle>Organisation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Name</Label><Input value={organisation?.name || ''} disabled /></div>
          <div><Label>Type</Label><Input value={organisation?.type?.replace('_', ' ') || ''} disabled /></div>
          <div><Label>Your Role</Label><Input value={membership?.role || ''} disabled /></div>
        </CardContent>
      </Card>

      {canInvite && (
        <Card>
          <CardHeader><CardTitle>Invite User</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Email</Label><Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@company.com" /></div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as OrgRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['admin', 'manager', 'analyst', 'client'] as const).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleInvite} disabled={!inviteEmail || inviting}>
              {inviting ? 'Sending…' : 'Send Invite'}
            </Button>
          </CardContent>
        </Card>
      )}

      {canManageConnections && currentProject && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Connections
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure API keys for external services used by this project's AI features.{' '}
              <a href="/project/help" className="underline text-primary">Need help setting up?</a>
            </p>
            {PROVIDERS.map(provider => {
              const isConnected = connections[provider.id];
              const Icon = provider.icon;
              return (
                <div
                  key={provider.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">{provider.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={isConnected ? 'default' : 'secondary'}>
                      {isConnected ? 'Connected' : 'Not configured'}
                    </Badge>
                    {isConnected ? (
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setConfigProvider(provider.id); setApiKeyInput(''); setShowKey(false); }}
                        >
                          Update
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDisconnect(provider.id)}
                          disabled={disconnecting === provider.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => { setConfigProvider(provider.id); setApiKeyInput(''); setShowKey(false); }}
                      >
                        Configure
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {loadingConnections && (
              <p className="text-sm text-muted-foreground text-center py-2">Loading connections…</p>
            )}
          </CardContent>
        </Card>
      )}

      <ApiAccessCard />

      {/* API Key Dialog */}
      <Dialog open={!!configProvider} onOpenChange={(open) => { if (!open) { setConfigProvider(null); setApiKeyInput(''); setShowKey(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {configProvider === 'claude' ? 'Claude (Anthropic)' : 'Notion'} API Key
            </DialogTitle>
            <DialogDescription>
              {configProvider === 'claude'
                ? 'Enter your Anthropic API key. Find it at console.anthropic.com → API Keys.'
                : 'Enter your Notion integration token. Create one at notion.so/my-integrations.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder={configProvider === 'claude' ? 'sk-ant-...' : 'ntn_...'}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-10 w-10"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your key is encrypted and stored securely via Supabase Vault. It will never be exposed to the client.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfigProvider(null); setApiKeyInput(''); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveConnection} disabled={!apiKeyInput || saving}>
              {saving ? 'Saving…' : 'Save Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
