import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const handleCallback = async () => {
      // Check URL for error params (Supabase puts them in hash)
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const errorParam = params.get('error_description') || params.get('error');
        if (errorParam) {
          setError(errorParam);
          return;
        }
      }

      // Wait for the session to appear via onAuthStateChange
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          console.log('[AuthCallback] onAuthStateChange:', event, !!session);
          if (session) {
            clearTimeout(timeout);
            subscription.unsubscribe();
            navigate('/projects', { replace: true });
          }
        }
      );

      // Also check if session already exists
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        subscription.unsubscribe();
        navigate('/projects', { replace: true });
        return;
      }

      // Timeout fallback — if no session after 10s, show recovery
      timeout = setTimeout(() => {
        subscription.unsubscribe();
        setError('Login timed out. The magic link may have expired or was opened in a different browser.');
      }, 10000);
    };

    handleCallback();

    return () => {
      clearTimeout(timeout);
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Sign-in problem</h1>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate('/auth', { replace: true })}
            className="text-primary underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        <p className="text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
