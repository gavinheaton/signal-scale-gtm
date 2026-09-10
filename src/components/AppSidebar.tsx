import { Home, Users, Mic, Megaphone, FileText, BarChart3, Settings, LogOut, FolderOpen, Shield, HelpCircle, Gauge, MessagesSquare, Network, Sparkles, LayoutGrid, Swords } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';

const navItems = [
  { title: 'Home', url: '/project/home', icon: Home },
  { title: 'ICP & Personas', url: '/project/icp-personas', icon: Users },
  { title: 'Value Prop', url: '/project/value-prop', icon: Sparkles },
  { title: 'Discovery', url: '/project/discovery', icon: MessagesSquare },
  { title: 'Competitors', url: '/project/competitors', icon: Swords },
  { title: 'Ecosystem', url: '/project/ecosystem', icon: Network },
  { title: 'Canvas', url: '/project/canvas', icon: LayoutGrid },
  { title: 'Brand Voice', url: '/project/brand-voice', icon: Mic },
  { title: 'Brand Audit', url: '/project/brand-audit', icon: Gauge },
  { title: 'Campaigns', url: '/project/campaigns', icon: Megaphone },
  { title: 'Content Pipeline', url: '/project/content', icon: FileText },
  { title: 'Analytics', url: '/project/analytics', icon: BarChart3 },
  { title: 'Settings', url: '/project/settings', icon: Settings },
  { title: 'Help', url: '/project/help', icon: HelpCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, organisation, isSuperAdmin, memberships, organisations, setActiveOrg } = useAuth();
  const { currentProject } = useProject();
  const multiOrg = memberships.length > 1;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        {!collapsed && (
          <div>
            <h1 className="text-lg font-bold tracking-tight text-sidebar-foreground">
              Signal + Scale
            </h1>
            {organisation && !multiOrg && (
              <p className="text-xs text-sidebar-foreground/60 mt-0.5">{organisation.name}</p>
            )}
            {multiOrg && (
              <select
                value={organisation?.id ?? ''}
                onChange={(e) => setActiveOrg(e.target.value)}
                className="mt-1 w-full bg-transparent text-xs text-sidebar-foreground/70 border border-sidebar-foreground/20 rounded px-1.5 py-0.5 focus:outline-none focus:border-sidebar-foreground/40"
              >
                {memberships.map(m => {
                  const name = organisations.find(o => o.id === m.org_id)?.name ?? '—';
                  return <option key={m.org_id} value={m.org_id} className="text-foreground">{name}</option>;
                })}
              </select>
            )}
          </div>
        )}
        {collapsed && (
          <span className="text-sidebar-foreground font-bold text-lg">S</span>
        )}
      </SidebarHeader>


      <SidebarContent>
        {currentProject && (
          <div className="px-4 py-2 mb-2">
            {!collapsed && (
              <div className="rounded-md bg-sidebar-accent px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Project</p>
                <p className="text-sm font-medium text-sidebar-foreground truncate">{currentProject.name}</p>
              </div>
            )}
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-[10px] tracking-widest">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/projects"
                    end
                    className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                    activeClassName="bg-sidebar-primary text-sidebar-primary-foreground"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {!collapsed && <span>Projects</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin"
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground"
                    >
                      <Shield className="h-4 w-4" />
                      {!collapsed && <span>Admin</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
