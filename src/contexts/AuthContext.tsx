import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
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
  const bootstrapped = useRef(false);

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

    // Single bootstrap: restore session, fetch org, then mark ready
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

    // Listener handles post-bootstrap events (sign-in from callback, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] onAuthStateChange:', event, !!session);
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fire-and-forget org lookup to avoid blocking the listener
          setTimeout(async () => {
            if (!mounted) return;
            await fetchOrgData(session.user.id);
            if (mounted && !bootstrapped.current) {
              bootstrapped.current = true;
              setLoading(false);
            }
          }, 0);
        } else {
          setMembership(null);
          setOrganisation(null);
          if (bootstrapped.current) {
            // Only update loading after bootstrap (e.g. sign-out)
          }
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
    <AuthContext.Provider value={{ session, user, membership, organisation, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
