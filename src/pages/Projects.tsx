import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { Project } from '@/integrations/supabase/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderOpen } from 'lucide-react';

const statusColors: Record<string, string> = {
  setup: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  review: 'bg-amber-100 text-amber-800',
  complete: 'bg-blue-100 text-blue-800',
};

export default function Projects() {
  const { membership } = useAuth();
  const { setCurrentProject } = useProject();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!membership) return;
    supabase
      .from('projects')
      .select('*')
      .eq('org_id', membership.org_id)
      .then(({ data }) => {
        if (data) setProjects(data as unknown as Project[]);
        setLoading(false);
      });
  }, [membership]);

  const selectProject = (p: Project) => {
    setCurrentProject(p);
    navigate('/project/home');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (!projects.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <FolderOpen className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold text-foreground">No Projects Yet</h2>
        <p className="text-muted-foreground mt-1">Create your first project in Settings to get started.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Your Projects</h1>
      <p className="text-muted-foreground mb-6" style={{ color: 'hsl(var(--orange))' }}>Select a project to enter the GTM workspace</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map(p => (
          <Card
            key={p.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => selectProject(p)}
          >
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
    </div>
  );
}
