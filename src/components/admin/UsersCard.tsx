import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Users, Shield } from 'lucide-react';
import UserDetailDrawer, { AdminUser } from './UserDetailDrawer';
import type { Organisation } from '@/types/database';
import { toast } from 'sonner';

export default function UsersCard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data, error }, orgRes] = await Promise.all([
      supabase.functions.invoke('admin-users', { body: { action: 'list' } }),
      supabase.from('organisations').select('*').order('name'),
    ]);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to load users');
      setLoading(false);
      return;
    }
    setUsers(data.users || []);
    setOrgs((orgRes.data as unknown as Organisation[]) || []);
    // Refresh selected user if drawer is open
    if (selected) {
      const updated = (data.users || []).find((u: AdminUser) => u.id === selected.id);
      setSelected(updated || null);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.email?.toLowerCase().includes(q) ||
      u.memberships.some(m => m.org_name.toLowerCase().includes(q))
    );
  }, [users, search]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Users ({users.length})
            </CardTitle>
            <Input
              className="max-w-xs"
              placeholder="Search email or org…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Orgs & Roles</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => {
                  const isSuper = u.memberships.some(m => m.role === 'superadmin');
                  return (
                    <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(u)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {u.email || <span className="text-muted-foreground italic">no email</span>}
                          {isSuper && <Shield className="h-3.5 w-3.5 text-primary" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.memberships.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : u.memberships.map(m => (
                            <Badge key={m.id} variant="outline" className="text-xs">
                              {m.org_name}: {m.role}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UserDetailDrawer
        user={selected}
        orgs={orgs}
        onClose={() => setSelected(null)}
        onChanged={fetchAll}
      />
    </>
  );
}
