import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { OrgRole } from '@/types/database';

export default function SettingsPage() {
  const { organisation, membership, hasMinRole } = useAuth();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('analyst');
  const [inviting, setInviting] = useState(false);

  const canInvite = hasMinRole('admin');

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
    </div>
  );
}
