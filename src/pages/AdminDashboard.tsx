import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Plus, Building2, Users, FolderOpen, Shield, Clock, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Organisation, OrgMembership, Project } from '@/types/database';
import type { OrgType, OrgRole } from '@/types/database';

interface OrgWithCounts extends Organisation {
  memberCount: number;
  projectCount: number;
}

interface AbandonedSession {
  id: string;
  project_id: string;
  session_type: string;
  created_at: string;
  draft_output: any;
  project_name?: string;
  org_name?: string;
}

export default function AdminDashboard() {
  const { user, isSuperAdmin } = useAuth();
  const { setCurrentProject } = useProject();
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState<OrgWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgType, setNewOrgType] = useState<OrgType>('independent');
  const [creating, setCreating] = useState(false);

  // Drawer state
  const [selectedOrg, setSelectedOrg] = useState<OrgWithCounts | null>(null);
  const [orgMembers, setOrgMembers] = useState<(OrgMembership & { email?: string })[]>([]);
  const [orgProjects, setOrgProjects] = useState<Project[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Invite state within drawer
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('admin');
  const [inviting, setInviting] = useState(false);

  // Abandoned wizard sessions
  const [abandoned, setAbandoned] = useState<AbandonedSession[]>([]);
  const [abandonedLoading, setAbandonedLoading] = useState(true);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);

  const fetchAbandoned = async () => {
    setAbandonedLoading(true);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('wizard_sessions')
      .select('id, project_id, session_type, created_at, draft_output, projects(name, organisations(name))')
      .eq('status', 'in_progress')
      .eq('session_type', 'campaign')
      .lt('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false });

    const mapped: AbandonedSession[] = (data || []).map((s: any) => ({
      id: s.id,
      project_id: s.project_id,
      session_type: s.session_type,
      created_at: s.created_at,
      draft_output: s.draft_output,
      project_name: s.projects?.name,
      org_name: s.projects?.organisations?.name,
    })).filter(s => Array.isArray(s.draft_output?.content_calendar) && s.draft_output.content_calendar.length > 0);

    setAbandoned(mapped);
    setAbandonedLoading(false);
  };

  const handleRecover = async (session: AbandonedSession) => {
    setRecoveringId(session.id);
    const { data, error } = await supabase.functions.invoke('recover-wizard-campaign', {
      body: { session_id: session.id },
    });
    setRecoveringId(null);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Recovery failed');
    } else {
      toast.success(`Recovered "${data.campaign_name}" with ${data.asset_count} assets`);
      fetchAbandoned();
    }
  };

  const fetchOrgs = async () => {
    const { data: allOrgs } = await supabase.from('organisations').select('*');
    if (!allOrgs) { setLoading(false); return; }

    const { data: allMemberships } = await supabase.from('org_memberships').select('*');
    const { data: allProjects } = await supabase.from('projects').select('id, org_id');

    const enriched: OrgWithCounts[] = (allOrgs as unknown as Organisation[]).map(org => ({
      ...org,
      memberCount: allMemberships?.filter((m: any) => m.org_id === org.id).length || 0,
      projectCount: allProjects?.filter((p: any) => p.org_id === org.id).length || 0,
    }));

    setOrgs(enriched);
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchOrgs();
      fetchAbandoned();
    }
  }, [isSuperAdmin]);

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    const { error } = await supabase.from('organisations').insert({
      name: newOrgName.trim(),
      type: newOrgType,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Organisation created');
      setNewOrgName('');
      setCreateOpen(false);
      fetchOrgs();
    }
  };

  const openOrgDrawer = async (org: OrgWithCounts) => {
    setSelectedOrg(org);
    setDrawerLoading(true);

    const [{ data: members }, { data: projects }] = await Promise.all([
      supabase.from('org_memberships').select('*').eq('org_id', org.id),
      supabase.from('projects').select('*').eq('org_id', org.id),
    ]);

    setOrgMembers((members as unknown as OrgMembership[]) || []);
    setOrgProjects((projects as unknown as Project[]) || []);
    setDrawerLoading(false);
  };

  const handleInviteToOrg = async () => {
    if (!inviteEmail || !selectedOrg) return;
    setInviting(true);

    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: inviteEmail, role: inviteRole, org_id: selectedOrg.id },
    });

    setInviting(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Invite failed');
    } else {
      toast.success(data?.message || 'Invite sent');
      setInviteEmail('');
      // Refresh drawer
      openOrgDrawer(selectedOrg);
      fetchOrgs();
    }
  };

  const enterOrgProject = (project: Project) => {
    setCurrentProject(project);
    navigate('/project/home');
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Super Admin only.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const orgTypeColors: Record<string, string> = {
    disruptors_own: 'bg-primary/10 text-primary',
    disruptors_client: 'bg-orange-100 text-orange-800',
    independent: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Super Admin Dashboard</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Organisation
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Organisations ({orgs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map(org => (
                <TableRow
                  key={org.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openOrgDrawer(org)}
                >
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>
                    <Badge className={orgTypeColors[org.type] || ''}>
                      {org.type.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" /> {org.memberCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" /> {org.projectCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(org.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Abandoned wizard sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Abandoned Campaign Drafts ({abandoned.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Campaign wizard sessions older than 7 days that have content but were never saved as a campaign.
          </p>
        </CardHeader>
        <CardContent>
          {abandonedLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : abandoned.length === 0 ? (
            <p className="text-sm text-muted-foreground">No abandoned sessions. 🎉</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Draft Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Org</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abandoned.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.draft_output?.campaign_name || <span className="text-muted-foreground italic">Untitled</span>}
                    </TableCell>
                    <TableCell className="text-sm">{s.project_name || '—'}</TableCell>
                    <TableCell className="text-sm">{s.org_name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {Array.isArray(s.draft_output?.content_calendar) ? s.draft_output.content_calendar.length : 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(s.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRecover(s)}
                        disabled={recoveringId === s.id}
                      >
                        <Wand2 className="mr-1 h-3.5 w-3.5" />
                        {recoveringId === s.id ? 'Recovering…' : 'Recover'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Organisation</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleCreateOrg(); }} className="space-y-4">
            <div>
              <Label>Organisation Name</Label>
              <Input value={newOrgName} onChange={e => setNewOrgName(e.target.value)} placeholder="Acme Corp" autoFocus />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newOrgType} onValueChange={v => setNewOrgType(v as OrgType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disruptors_own">Disruptors Own</SelectItem>
                  <SelectItem value="disruptors_client">Disruptors Client</SelectItem>
                  <SelectItem value="independent">Independent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!newOrgName.trim() || creating}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Org Detail Drawer */}
      <Sheet open={!!selectedOrg} onOpenChange={open => !open && setSelectedOrg(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedOrg?.name}</SheetTitle>
          </SheetHeader>

          {drawerLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="space-y-6 mt-4">
              {/* Members */}
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2 flex items-center gap-1">
                  <Users className="h-4 w-4" /> Members ({orgMembers.length})
                </h3>
                {orgMembers.length > 0 ? (
                  <div className="space-y-1">
                    {orgMembers.map(m => (
                      <div key={m.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                        <span className="text-muted-foreground truncate">{m.user_id.slice(0, 8)}…</span>
                        <Badge variant="outline">{m.role}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No members yet.</p>
                )}
              </div>

              {/* Invite */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Add User to Organisation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@company.com" />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={inviteRole} onValueChange={v => setInviteRole(v as OrgRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['admin', 'manager', 'analyst', 'client'] as const).map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleInviteToOrg} disabled={!inviteEmail || inviting} className="w-full">
                    {inviting ? 'Sending…' : 'Send Invite'}
                  </Button>
                </CardContent>
              </Card>

              {/* Projects */}
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2 flex items-center gap-1">
                  <FolderOpen className="h-4 w-4" /> Projects ({orgProjects.length})
                </h3>
                {orgProjects.length > 0 ? (
                  <div className="space-y-1">
                    {orgProjects.map(p => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm cursor-pointer hover:bg-muted"
                        onClick={() => enterOrgProject(p)}
                      >
                        <span className="font-medium">{p.name}</span>
                        <Badge variant="outline">{p.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No projects yet.</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
