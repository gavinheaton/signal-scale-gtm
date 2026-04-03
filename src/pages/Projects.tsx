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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FolderOpen, AlertCircle, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const statusColors: Record<string, string> = {
  setup: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  review: 'bg-amber-100 text-amber-800',
  complete: 'bg-blue-100 text-blue-800',
};

export default function Projects() {
  const { membership, loading: authLoading, signOut, hasMinRole } = useAuth();
  const canCreateProject = hasMinRole('manager');
  const { setCurrentProject } = useProject();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

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

  if (!projects.length) {
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
        {newProjectDialog}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-foreground">Your Projects</h1>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" /> New Project
        </Button>
      </div>
      <p className="text-sm mb-6" style={{ color: 'hsl(var(--orange))' }}>Select a project to enter the GTM workspace</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map(p => (
          <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => selectProject(p)}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <Badge className={statusColors[p.status] || ''}>{p.status}</Badge>
              </div>
              <CardDescription>Created {new Date(p.created_at).toLocaleDateString()}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      {newProjectDialog}
    </div>
  );
}
