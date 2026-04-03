import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { AppLayout } from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import AuthCallback from "@/pages/AuthCallback";
import Projects from "@/pages/Projects";
import Home from "@/pages/Home";
import ICPPersonas from "@/pages/ICPPersonas";
import ICPWizard from "@/pages/ICPWizard";
import PersonaWizard from "@/pages/PersonaWizard";
import Campaigns from "@/pages/Campaigns";
import CampaignWizard from "@/pages/CampaignWizard";
import ContentPipeline from "@/pages/ContentPipeline";
import Analytics from "@/pages/Analytics";
import SettingsPage from "@/pages/Settings";
import AdminDashboard from "@/pages/AdminDashboard";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ProjectProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route element={<AppLayout />}>
                <Route path="/projects" element={<Projects />} />
                <Route path="/project/home" element={<Home />} />
                <Route path="/project/icp-personas" element={<ICPPersonas />} />
                <Route path="/project/icp-wizard" element={<ICPWizard />} />
                <Route path="/project/persona-wizard" element={<PersonaWizard />} />
                <Route path="/project/campaigns" element={<Campaigns />} />
                <Route path="/project/campaign-wizard" element={<CampaignWizard />} />
                <Route path="/project/content" element={<ContentPipeline />} />
                <Route path="/project/analytics" element={<Analytics />} />
                <Route path="/project/settings" element={<SettingsPage />} />
                <Route path="/admin" element={<AdminDashboard />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ProjectProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
