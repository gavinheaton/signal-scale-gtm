import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { Project } from '@/types/database';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FolderOpen, AlertCircle, Plus, MoreVertical, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const statusColors: Record<string, string> = {
  setup: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  review: 'bg-amber-100 text-amber-800',
  complete: 'bg-blue-100 text-blue-800',
  archived: 'bg-gray-200 text-gray-500',
};

export default function Projects() {
  const { memberships, organisations, membership, loading: authLoading, signOut, hasMinRole } = useAuth();
  const canCreateProjectAnywhere = hasMinRole('manager');
  const isAdmin = hasMinRole('admin');
  const { setCurrentProject } = useProject();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOrgId, setNewOrgId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string>('all');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const orgIds = useMemo(() => memberships.map(m => m.org_id), [memberships]);
  const orgNameById = useMemo(
    () => Object.fromEntries(organisations.map(o => [o.id, o.name])),
    [organisations]
  );
  const creatableOrgs = useMemo(
    () => memberships
      .filter(m => hasMinRole('manager', m.org_id))
      .map(m => ({ id: m.org_id, name: orgNameById[m.org_id] ?? '—' })),
    [memberships, orgNameById, hasMinRole]
  );
  const multiOrg = memberships.length > 1;

  const fetchProjects = async () => {
    if (orgIds.length === 0) {
      setProjects([]);
      setLoadingProjects(false);
      return;
    }
    const { data } = await supabase
      .from('projects')
      .select('*')
      .in('org_id', orgIds);
    if (data) setProjects(data as unknown as Project[]);
    setLoadingProjects(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (memberships.length === 0) {
      setLoadingProjects(false);
      return;
    }
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberships, authLoading]);

  const openCreateDialog = () => {
    // Default the org selector to the active org if allowed, else the first creatable org
    const defaultOrg = creatableOrgs.find(o => o.id === membership?.org_id)?.id
      ?? creatableOrgs[0]?.id
      ?? '';
    setNewOrgId(defaultOrg);
    setDialogOpen(true);
  };

  const selectProject = (p: Project) => {
    if (p.status === 'archived') return;
    setCurrentProject(p);
    navigate('/project/home');
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newOrgId) return;
    setCreating(true);
    const { error } = await supabase.from('projects').insert({
      name: newName.trim(),
      org_id: newOrgId,
    });
    setCreating(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Project created' });
      setNewName('');
      setDialogOpen(false);
      await fetchProjects();
    }
  };

  const handleArchive = async (project: Project) => {
    const { error } = await supabase
      .from('projects')
      .update({ status: 'archived' as any })
      .eq('id', project.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Project archived', description: `"${project.name}" has been archived.` });
      await fetchProjects();
    }
  };

  const handleRestore = async (project: Project) => {
    const { error } = await supabase
      .from('projects')
      .update({ status: 'setup' as any })
      .eq('id', project.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Project restored', description: `"${project.name}" has been restored.` });
      await fetchProjects();
    }
  };

  const handleDeletePermanently = async () => {
    if (!deleteTarget || deleteConfirmName !== deleteTarget.name) return;
    setDeleting(true);
    const { error } = await supabase.rpc('delete_project_cascade', {
      _project_id: deleteTarget.id,
    });
    setDeleting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Project deleted', description: `"${deleteTarget.name}" and all associated data have been permanently deleted.` });
      setDeleteTarget(null);
      setDeleteConfirmName('');
      await fetchProjects();
    }
  };

  if (authLoading || (memberships.length > 0 && loadingProjects)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold text-foreground">No Organisation Access</h2>
        <p className="text-muted-foreground mt-1 max-w-md">
          You're signed in, but your account isn't linked to an organisation yet. Ask your admin to invite you, or contact support.
        </p>
        <Button variant="outline" className="mt-4" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  const filteredByOrg = orgFilter === 'all'
    ? projects
    : projects.filter(p => p.org_id === orgFilter);
  const visibleProjects = showArchived
    ? filteredByOrg
    : filteredByOrg.filter((p) => p.status !== 'archived');

  const newProjectDialog = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="space-y-4"
        >
          {creatableOrgs.length > 1 && (
            <div className="space-y-1.5">
              <Label>Organisation</Label>
              <Select value={newOrgId} onValueChange={setNewOrgId}>
                <SelectTrigger><SelectValue placeholder="Select organisation" /></SelectTrigger>
                <SelectContent>
                  {creatableOrgs.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            {creatableOrgs.length > 1 && <Label>Project name</Label>}
            <Input
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!newName.trim() || !newOrgId || creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirmName(''); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete Project Permanently</DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>"{deleteTarget?.name}"</strong> and all associated ICPs, personas, campaigns, assets, metrics, and wizard sessions. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleDeletePermanently();
          }}
          className="space-y-4"
        >
          <div>
            <Label className="text-sm text-muted-foreground">
              Type <strong>{deleteTarget?.name}</strong> to confirm
            </Label>
            <Input
              className="mt-1"
              placeholder="Project name"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmName(''); }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={deleteConfirmName !== deleteTarget?.name || deleting}
            >
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (!visibleProjects.length && !showArchived && orgFilter === 'all') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <FolderOpen className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold text-foreground">No Projects Yet</h2>
        <p className="text-muted-foreground mt-1 mb-4">Create your first project to get started.</p>
        {canCreateProjectAnywhere && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-1 h-4 w-4" /> New Project
          </Button>
        )}
        {isAdmin && projects.some((p) => p.status === 'archived') && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowArchived(true)}>
            Show archived projects
          </Button>
        )}
        {newProjectDialog}
        {deleteDialog}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Your Projects</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {multiOrg && (
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All organisations</SelectItem>
                {memberships.map(m => (
                  <SelectItem key={m.org_id} value={m.org_id}>
                    {orgNameById[m.org_id] ?? '—'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAdmin && projects.some((p) => p.status === 'archived') && (
            <div className="flex items-center gap-2">
              <Switch
                id="show-archived"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="show-archived" className="text-sm text-muted-foreground cursor-pointer">
                Show archived
              </Label>
            </div>
          )}
          {canCreateProjectAnywhere && (
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="mr-1 h-4 w-4" /> New Project
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm mb-6" style={{ color: 'hsl(var(--orange))' }}>Select a project to enter the GTM workspace</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleProjects.map((p) => (
          <Card
            key={p.id}
            className={`relative transition-shadow ${p.status === 'archived' ? 'opacity-60' : 'cursor-pointer hover:shadow-md'}`}
            onClick={() => selectProject(p)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className={statusColors[p.status] || ''}>{p.status}</Badge>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        {p.status === 'archived' ? (
                          <DropdownMenuItem onClick={() => handleRestore(p)}>
                            <RotateCcw className="mr-2 h-4 w-4" /> Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleArchive(p)}>
                            <Archive className="mr-2 h-4 w-4" /> Archive
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <CardDescription className="flex items-center gap-2">
                {multiOrg && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {orgNameById[p.org_id] ?? '—'}
                  </Badge>
                )}
                <span>Created {new Date(p.created_at).toLocaleDateString()}</span>
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      {newProjectDialog}
      {deleteDialog}
    </div>
  );
}
