import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { OrgMembership, Organisation, OrgRole } from '@/types/database';

const ROLE_HIERARCHY: OrgRole[] = ['client', 'analyst', 'manager', 'admin', 'owner', 'superadmin'];
const ACTIVE_ORG_STORAGE_KEY = 'activeOrgId';

interface AuthState {
  session: Session | null;
  user: User | null;
  membership: OrgMembership | null;
  organisation: Organisation | null;
  memberships: OrgMembership[];
  organisations: Organisation[];
  setActiveOrg: (orgId: string) => void;
  loading: boolean;
  isSuperAdmin: boolean;
  hasMinRole: (minRole: OrgRole, orgId?: string) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null, user: null, membership: null, organisation: null,
  memberships: [], organisations: [], setActiveOrg: () => {},
  loading: true, isSuperAdmin: false, hasMinRole: () => false, signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) : null)
  );
  const [loading, setLoading] = useState(true);
  const bootstrapped = useRef(false);

  const membership =
    memberships.find(m => m.org_id === activeOrgId) ?? memberships[0] ?? null;
  const organisation =
    organisations.find(o => o.id === membership?.org_id) ?? null;

  const isSuperAdmin = memberships.some(m => m.role === 'superadmin');

  const hasMinRole = (minRole: OrgRole, orgId?: string): boolean => {
    const requiredLevel = ROLE_HIERARCHY.indexOf(minRole);
    const candidates = orgId
      ? memberships.filter(m => m.org_id === orgId)
      : memberships;
    return candidates.some(m => ROLE_HIERARCHY.indexOf(m.role) >= requiredLevel);
  };

  const setActiveOrg = (orgId: string) => {
    setActiveOrgIdState(orgId);
    try { localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId); } catch {}
  };

  const fetchOrgData = async (userId: string) => {
    try {
      const { data: mems } = await supabase
        .from('org_memberships')
        .select('*')
        .eq('user_id', userId);

      const memList = (mems ?? []) as unknown as OrgMembership[];
      setMemberships(memList);

      if (memList.length > 0) {
        const orgIds = memList.map(m => m.org_id);
        const { data: orgs } = await supabase
          .from('organisations')
          .select('*')
          .in('id', orgIds);
        setOrganisations((orgs ?? []) as unknown as Organisation[]);

        // Ensure activeOrgId points to a valid membership
        const stored = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) : null;
        if (!stored || !memList.some(m => m.org_id === stored)) {
          setActiveOrgIdState(memList[0].org_id);
          try { localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, memList[0].org_id); } catch {}
        } else if (stored !== activeOrgId) {
          setActiveOrgIdState(stored);
        }
      } else {
        setOrganisations([]);
      }
    } catch {
      setMemberships([]);
      setOrganisations([]);
    }
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[Auth] bootstrap session:', !!session);
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchOrgData(session.user.id);
      }

      if (mounted) {
        bootstrapped.current = true;
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] onAuthStateChange:', event, !!session);
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setLoading(true);
          setTimeout(async () => {
            if (!mounted) return;
            await fetchOrgData(session.user.id);
            if (mounted) {
              bootstrapped.current = true;
              setLoading(false);
            }
          }, 0);
        } else {
          setMemberships([]);
          setOrganisations([]);
          if (mounted && bootstrapped.current) setLoading(false);
        }
      }
    );

    bootstrap();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session, user, membership, organisation,
      memberships, organisations, setActiveOrg,
      loading, isSuperAdmin, hasMinRole, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
