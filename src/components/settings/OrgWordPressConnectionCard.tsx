import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Globe, Loader2, Trash2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { WpFlavor } from '@/types/database';

interface OrgWpConnection {
  flavor: WpFlavor;
  site_url: string;
  username: string | null;
  default_category: string | null;
  default_status: string;
  connected_at: string;
}

export default function OrgWordPressConnectionCard() {
  const { organisation, hasMinRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<OrgWpConnection | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showCred, setShowCred] = useState(false);

  // form state
  const [flavor, setFlavor] = useState<WpFlavor>('wordpress_com');
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [credential, setCredential] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('');
  const [defaultStatus, setDefaultStatus] = useState('draft');

  const canManage = hasMinRole('admin');

  const refresh = useCallback(async () => {
    if (!organisation) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_org_wp_connection', { _org_id: organisation.id });
    if (!error && data && data.length > 0) {
      const row = data[0] as any;
      setConnection({
        flavor: row.flavor,
        site_url: row.site_url,
        username: row.username,
        default_category: row.default_category,
        default_status: row.default_status,
        connected_at: row.connected_at,
      });
    } else {
      setConnection(null);
    }
    setLoading(false);
  }, [organisation]);

  useEffect(() => { refresh(); }, [refresh]);

  const openDialog = () => {
    if (connection) {
      setFlavor(connection.flavor);
      setSiteUrl(connection.site_url);
      setUsername(connection.username || '');
      setDefaultCategory(connection.default_category || '');
      setDefaultStatus(connection.default_status);
    } else {
      setFlavor('wordpress_com');
      setSiteUrl('');
      setUsername('');
      setDefaultCategory('');
      setDefaultStatus('draft');
    }
    setCredential('');
    setShowCred(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!organisation) return;
    if (!siteUrl.trim() || !credential.trim()) {
      toast.error('Site URL and credential are required');
      return;
    }
    if (flavor === 'self_hosted' && !username.trim()) {
      toast.error('Username is required for self-hosted WordPress');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('manage-org-wordpress-connection', {
      body: {
        org_id: organisation.id,
        flavor,
        site_url: siteUrl.trim(),
        username: flavor === 'self_hosted' ? username.trim() : undefined,
        credential: credential.trim(),
        default_category: defaultCategory.trim() || null,
        default_status: defaultStatus,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Failed to save');
      return;
    }
    toast.success('WordPress connected & verified');
    setDialogOpen(false);
    setCredential('');
    refresh();
  };

  const handleDisconnect = async () => {
    if (!organisation) return;
    if (!confirm('Disconnect WordPress for this organisation? Publishing will stop working until reconnected.')) return;
    setDisconnecting(true);
    const { data, error } = await supabase.functions.invoke('manage-org-wordpress-connection', {
      method: 'DELETE',
      body: { org_id: organisation.id },
    });
    setDisconnecting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'Failed to disconnect');
      return;
    }
    toast.success('WordPress disconnected');
    refresh();
  };

  if (!canManage || !organisation) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            WordPress Connection
            <Badge variant="outline" className="ml-2 text-xs">Organisation-wide</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect this organisation's WordPress site so campaign assets can be published directly from the platform.
            Each organisation has its own connection.
          </p>

          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : connection ? (
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground truncate">{connection.site_url}</p>
                    <Badge variant="secondary" className="text-xs">
                      {connection.flavor === 'wordpress_com' ? 'WordPress.com' : 'Self-hosted'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default: {connection.default_status}{connection.default_category ? ` · ${connection.default_category}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={openDialog}>Edit</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Globe className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Not connected</p>
                  <p className="text-xs text-muted-foreground">Connect WordPress.com or a self-hosted WP site</p>
                </div>
              </div>
              <Button size="sm" onClick={openDialog}>Connect WordPress</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{connection ? 'Update' : 'Connect'} WordPress</DialogTitle>
            <DialogDescription>
              Credentials are encrypted in Supabase Vault and only ever used server-side.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">WordPress flavour</Label>
              <RadioGroup value={flavor} onValueChange={(v) => setFlavor(v as WpFlavor)} className="mt-2 grid grid-cols-2 gap-2">
                <label className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer ${flavor === 'wordpress_com' ? 'border-primary bg-primary/5' : ''}`}>
                  <RadioGroupItem value="wordpress_com" />
                  <span className="text-sm">WordPress.com</span>
                </label>
                <label className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer ${flavor === 'self_hosted' ? 'border-primary bg-primary/5' : ''}`}>
                  <RadioGroupItem value="self_hosted" />
                  <span className="text-sm">Self-hosted</span>
                </label>
              </RadioGroup>
            </div>

            {flavor === 'wordpress_com' ? (
              <>
                <div>
                  <Label className="text-xs">Site ID or domain</Label>
                  <Input
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="clientsite.wordpress.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Personal access token</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showCred ? 'text' : 'password'}
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      placeholder="WordPress.com OAuth token"
                      className="pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-10" onClick={() => setShowCred(!showCred)}>
                      {showCred ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <a href="https://developer.wordpress.com/docs/oauth2/" target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                    How to generate a token <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs">Site URL</Label>
                  <Input
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="https://clientblog.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Username</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Application password</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showCred ? 'text' : 'password'}
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                      className="pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-10" onClick={() => setShowCred(!showCred)}>
                      {showCred ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    WP Admin → Users → Profile → Application Passwords. Requires WordPress 5.6+.
                  </p>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <Label className="text-xs">Default category</Label>
                <Input value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} placeholder="Marketing" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Default status</Label>
                <Select value={defaultStatus} onValueChange={setDefaultStatus}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="publish">Publish</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verifying…</> : 'Test & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
