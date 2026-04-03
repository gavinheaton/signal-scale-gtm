import { createContext, useContext, useState, ReactNode } from 'react';
import { Project } from '@/types/database';

interface ProjectState {
  currentProject: Project | null;
  setCurrentProject: (p: Project | null) => void;
}

const ProjectContext = createContext<ProjectState>({
  currentProject: null,
  setCurrentProject: () => {},
});

export const useProject = () => useContext(ProjectContext);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  return (
    <ProjectContext.Provider value={{ currentProject, setCurrentProject }}>
      {children}
    </ProjectContext.Provider>
  );
}
