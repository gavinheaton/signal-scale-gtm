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
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchOrgData(session.user.id), 0);
      } else {
        setMembership(null);
        setOrganisation(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchOrgData(session.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
