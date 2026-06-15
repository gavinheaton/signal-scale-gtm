import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Project } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ProjectState {
  currentProject: Project | null;
  setCurrentProject: (p: Project | null) => void;
}

const ProjectContext = createContext<ProjectState>({
  currentProject: null,
  setCurrentProject: () => {},
});

export const useProject = () => useContext(ProjectContext);

const STORAGE_KEY = 'signal-scale:currentProjectId';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);

  const setCurrentProject = useCallback((p: Project | null) => {
    setCurrentProjectState(p);
    try {
      if (p?.id) localStorage.setItem(STORAGE_KEY, p.id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  // Rehydrate from localStorage when the user is available (or changes).
  useEffect(() => {
    if (!user) {
      setCurrentProjectState(null);
      return;
    }
    if (currentProject) return;

    let cancelled = false;
    const storedId = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (!storedId) return;

    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', storedId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      setCurrentProjectState(data as unknown as Project);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <ProjectContext.Provider value={{ currentProject, setCurrentProject }}>
      {children}
    </ProjectContext.Provider>
  );
}
