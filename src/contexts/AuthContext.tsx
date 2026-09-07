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
    const loadedForUser = { current: null as string | null };

    const bootstrap = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        loadedForUser.current = session.user.id;
        await fetchOrgData(session.user.id);
      }

      if (mounted) {
        bootstrapped.current = true;
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        // Token refreshes / focus-triggered re-validation must never reset the
        // app into a loading state — that unmounts the tree and loses in-progress work.
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setSession(session);
          setUser(session?.user ?? null);
          return;
        }

        if (event === 'SIGNED_OUT' || !session?.user) {
          setSession(null);
          setUser(null);
          setMemberships([]);
          setOrganisations([]);
          loadedForUser.current = null;
          if (bootstrapped.current) setLoading(false);
          return;
        }

        setSession(session);
        setUser(session.user);

        // Same user re-emitting SIGNED_IN (e.g. tab regains focus): keep state as-is.
        if (loadedForUser.current === session.user.id) return;

        loadedForUser.current = session.user.id;
        const showLoading = !bootstrapped.current;
        if (showLoading) setLoading(true);
        setTimeout(async () => {
          if (!mounted) return;
          await fetchOrgData(session.user.id);
          if (mounted) {
            bootstrapped.current = true;
            setLoading(false);
          }
        }, 0);
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
