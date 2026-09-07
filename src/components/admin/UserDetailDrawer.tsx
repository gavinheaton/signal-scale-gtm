import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Trash2, Shield, ShieldOff, KeyRound, Mail, UserX } from 'lucide-react';
import type { OrgRole, Organisation } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed_at: string | null;
  memberships: Array<{ id: string; org_id: string; org_name: string; role: OrgRole }>;
}

interface Props {
  user: AdminUser | null;
  orgs: Organisation[];
  onClose: () => void;
  onChanged: () => void;
}

const ORG_ROLES: OrgRole[] = ['owner', 'admin', 'manager', 'analyst', 'client'];

export default function UserDetailDrawer({ user, orgs, onClose, onChanged }: Props) {
  const { user: currentUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [addOrgId, setAddOrgId] = useState('');
  const [addRole, setAddRole] = useState<OrgRole>('client');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!user) return null;

  const isSuper = user.memberships.some(m => m.role === 'superadmin');
  const isSelf = user.id === currentUser?.id;

  const call = async (action: string, params: Record<string, any> = {}) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action, ...params },
    });
    setBusy(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Action failed');
      return false;
    }
    toast.success(data?.message || 'Done');
    onChanged();
    return true;
  };

  const availableOrgs = orgs.filter(o => !user.memberships.some(m => m.org_id === o.id));

  return (
    <>
      <Sheet open={!!user} onOpenChange={open => !open && onClose()}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {user.email}
              {isSuper && <Badge className="bg-primary/10 text-primary">Superadmin</Badge>}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6 mt-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Created: {new Date(user.created_at).toLocaleDateString()}</div>
              <div>Last sign-in: {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}</div>
              <div>Email confirmed: {user.confirmed_at ? 'Yes' : 'No'}</div>
            </div>

            {/* Memberships */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Org Memberships ({user.memberships.length})</h3>
              {user.memberships.length === 0 ? (
                <p className="text-sm text-muted-foreground">No org memberships.</p>
              ) : (
                <div className="space-y-2">
                  {user.memberships.map(m => (
                    <div key={m.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{m.org_name}</div>
                      </div>
                      <Select
                        value={m.role}
                        onValueChange={v => call('update_membership', { membership_id: m.id, role: v })}
                        disabled={busy || m.role === 'superadmin'}
                      >
                        <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(m.role === 'superadmin' ? ['superadmin', ...ORG_ROLES] : ORG_ROLES).map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => call('remove_membership', { membership_id: m.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add to org */}
            {availableOrgs.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Add to organisation</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Organisation</Label>
                    <Select value={addOrgId} onValueChange={setAddOrgId}>
                      <SelectTrigger><SelectValue placeholder="Select org" /></SelectTrigger>
                      <SelectContent>
                        {availableOrgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={addRole} onValueChange={v => setAddRole(v as OrgRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORG_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!addOrgId || busy}
                    onClick={async () => {
                      const ok = await call('add_membership', { user_id: user.id, org_id: addOrgId, role: addRole });
                      if (ok) setAddOrgId('');
                    }}
                  >
                    Add membership
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Actions</h3>
              <Button variant="outline" className="w-full justify-start" disabled={busy}
                onClick={() => call('reset_password', { email: user.email })}>
                <KeyRound className="mr-2 h-4 w-4" /> Send password reset
              </Button>
              {!user.last_sign_in_at && (
                <Button variant="outline" className="w-full justify-start" disabled={busy}
                  onClick={() => call('resend_invite', { email: user.email })}>
                  <Mail className="mr-2 h-4 w-4" /> Resend invite
                </Button>
              )}
              {isSuper ? (
                <Button variant="outline" className="w-full justify-start" disabled={busy || isSelf}
                  onClick={() => call('set_superadmin', { user_id: user.id, promote: false })}>
                  <ShieldOff className="mr-2 h-4 w-4" /> Demote from superadmin
                </Button>
              ) : (
                <Button variant="outline" className="w-full justify-start" disabled={busy}
                  onClick={() => call('set_superadmin', { user_id: user.id, promote: true })}>
                  <Shield className="mr-2 h-4 w-4" /> Promote to superadmin
                </Button>
              )}
              <Button variant="destructive" className="w-full justify-start" disabled={busy || isSelf}
                onClick={() => setDeleteOpen(true)}>
                <UserX className="mr-2 h-4 w-4" /> Delete user
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the auth user and all org memberships. Type <strong>DELETE</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="DELETE" />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirm !== 'DELETE' || busy}
              onClick={async () => {
                const ok = await call('delete_user', { user_id: user.id });
                if (ok) { setDeleteOpen(false); setDeleteConfirm(''); onClose(); }
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
