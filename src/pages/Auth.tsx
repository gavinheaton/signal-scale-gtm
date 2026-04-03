import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, CheckCircle } from 'lucide-react';

export default function Auth() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (loading) return null;
  if (user) return <Navigate to="/projects" replace />;

  const handleSendMagicLink = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email) { toast.error('Enter your email'); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Magic link sent — check your inbox!');
      setSent(true);
      setCooldown(60);
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">Signal 2 Scale</h1>
          <p className="text-muted-foreground mt-2" style={{ color: 'hsl(var(--orange))' }}>
            AI-Powered GTM Platform
          </p>
        </div>
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-foreground">
              {sent ? 'Check your email' : 'Sign in'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {sent
                ? `We sent a magic link to ${email}. Click it to sign in.`
                : 'Enter your email to receive a magic link'}
            </p>
          </CardHeader>
          <CardContent>
            {!sent ? (
              <form onSubmit={handleSendMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  <Mail className="mr-2 h-4 w-4" />
                  {submitting ? 'Sending...' : 'Send Magic Link'}
                </Button>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Open the link in the email to sign in. You can close this tab or wait here — you'll be redirected automatically.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSendMagicLink()}
                  disabled={submitting || cooldown > 0}
                >
                  {cooldown > 0 ? `Resend link (${cooldown}s)` : 'Resend magic link'}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => { setSent(false); setEmail(''); }}
                >
                  Use a different email
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
