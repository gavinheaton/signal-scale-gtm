import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { OrgMembership, Organisation } from '@/types/database';

interface AuthState {
  session: Session | null;
  user: User | null;
  membership: OrgMembership | null;
  organisation: Organisation | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null, user: null, membership: null, organisation: null, loading: true, signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<OrgMembership | null>(null);
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrgData = async (userId: string) => {
    try {
      const { data: mem } = await supabase
        .from('org_memberships')
        .select('*')
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (mem) {
        setMembership(mem as unknown as OrgMembership);
        const { data: org } = await supabase
          .from('organisations')
          .select('*')
          .eq('id', mem.org_id)
          .single();
        if (org) setOrganisation(org as unknown as Organisation);
      } else {
        setMembership(null);
        setOrganisation(null);
      }
    } catch {
      setMembership(null);
      setOrganisation(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Restore session first, fetch org data, THEN set loading false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchOrgData(session.user.id);
      }

      if (mounted) setLoading(false);
    });

    // 2. Listen for subsequent auth changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fire-and-forget for subsequent changes — app is already past loading
          setTimeout(() => {
            if (mounted) fetchOrgData(session.user.id);
          }, 0);
        } else {
          setMembership(null);
          setOrganisation(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, membership, organisation, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
