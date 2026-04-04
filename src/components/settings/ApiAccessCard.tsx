import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Key, Copy, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';

interface ApiKeyRow {
  id: string;
  key_prefix: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => chars[b % chars.length])
    .join('');
  return `gtm_${randomPart}`;
}

export default function ApiAccessCard() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('api_keys')
      .select('id, key_prefix, label, created_at, last_used_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setKeys((data as ApiKeyRow[]) || []);
        setLoading(false);
      });
  }, [user]);

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    const key = generateKey();
    const keyHash = await sha256(key);
    const keyPrefix = key.slice(0, 12);

    const { error } = await supabase.from('api_keys').insert({
      user_id: user.id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      label: 'Cowork Sync',
    } as any);

    setGenerating(false);
    if (error) {
      toast.error('Failed to generate API key');
      return;
    }

    setNewKey(key);

    // Refresh list
    const { data } = await supabase
      .from('api_keys')
      .select('id, key_prefix, label, created_at, last_used_at')
      .order('created_at', { ascending: false });
    setKeys((data as ApiKeyRow[]) || []);
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    const { error } = await supabase.from('api_keys').delete().eq('id', id);
    setRevokingId(null);
    if (error) {
      toast.error('Failed to revoke key');
      return;
    }
    toast.success('API key revoked');
    setKeys(prev => prev.filter(k => k.id !== id));
  };

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    toast.success('Copied to clipboard');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate API keys to allow external tools like Cowork to sync your brand voice data.
          </p>

          <Button onClick={handleGenerate} disabled={generating} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {generating ? 'Generating…' : 'Generate API Key'}
          </Button>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-2">Loading keys…</p>
          ) : keys.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map(k => (
                  <TableRow key={k.id}>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{k.key_prefix}…</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{k.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(k.created_at), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.last_used_at ? format(new Date(k.last_used_at), 'dd MMM yyyy') : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleRevoke(k.id)}
                        disabled={revokingId === k.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No API keys yet.</p>
          )}
        </CardContent>
      </Card>

      {/* New Key Modal */}
      <Dialog open={!!newKey} onOpenChange={(open) => { if (!open) setNewKey(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Generated</DialogTitle>
            <DialogDescription>
              Copy this key now — it won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-muted px-3 py-2 rounded break-all font-mono">
                {newKey}
              </code>
              <Button variant="outline" size="icon" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this key as <code className="bg-muted px-1 rounded">Authorization: Bearer {newKey?.slice(0, 12)}…</code> when calling the brand voice API.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
