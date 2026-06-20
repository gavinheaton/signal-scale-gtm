import { useEffect, useState } from 'react';
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
  const { membership, loading: authLoading, signOut, hasMinRole } = useAuth();
  const canCreateProject = hasMinRole('manager');
  const isAdmin = hasMinRole('admin');
  const { setCurrentProject } = useProject();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchProjects = async () => {
    if (!membership) return;
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('org_id', membership.org_id);
    if (data) setProjects(data as unknown as Project[]);
    setLoadingProjects(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!membership) {
      setLoadingProjects(false);
      return;
    }
    fetchProjects();
  }, [membership, authLoading]);

  const selectProject = (p: Project) => {
    if (p.status === 'archived') return;
    setCurrentProject(p);
    navigate('/project/home');
  };

  const handleCreate = async () => {
    if (!newName.trim() || !membership) return;
    setCreating(true);
    const { error } = await supabase.from('projects').insert({
      name: newName.trim(),
      org_id: membership.org_id,
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

  if (authLoading || (membership && loadingProjects)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!membership) {
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

  const visibleProjects = showArchived
    ? projects
    : projects.filter((p) => p.status !== 'archived');

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
          <Input
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!newName.trim() || creating}>
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

  if (!visibleProjects.length && !showArchived) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <FolderOpen className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold text-foreground">No Projects Yet</h2>
        <p className="text-muted-foreground mt-1 mb-4">Create your first project to get started.</p>
        {canCreateProject && (
          <Button onClick={() => setDialogOpen(true)}>
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
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-foreground">Your Projects</h1>
        <div className="flex items-center gap-3">
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
          {canCreateProject && (
            <Button onClick={() => setDialogOpen(true)} size="sm">
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
              <CardDescription>Created {new Date(p.created_at).toLocaleDateString()}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      {newProjectDialog}
      {deleteDialog}
    </div>
  );
}
