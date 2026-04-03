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
  const { organisation, membership } = useAuth();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('analyst');

  const handleInvite = async () => {
    if (!inviteEmail || !organisation) return;
    toast.info(`Invite sent to ${inviteEmail} as ${inviteRole} (manual Supabase setup required for full invite flow)`);
    setInviteEmail('');
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
          <Button onClick={handleInvite}>Send Invite</Button>
        </CardContent>
      </Card>
    </div>
  );
}
