import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { ArrowLeft, Mail } from 'lucide-react';

export default function Auth() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (loading) return null;
  if (user) return <Navigate to="/projects" replace />;

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error('Enter your email'); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Check your email for a magic link or code!');
      setStep('otp');
      setCooldown(60);
    }
    setSubmitting(false);
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { toast.error('Enter the full 6-digit code'); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });
    if (error) {
      toast.error(error.message);
    }
    setSubmitting(false);
  };

  const handleBack = () => {
    setStep('email');
    setOtp('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">Signal + Scale</h1>
          <p className="text-muted-foreground mt-2" style={{ color: 'hsl(var(--orange))' }}>
            AI-Powered GTM Platform
          </p>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              {step === 'otp' && (
                <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {step === 'email' ? 'Sign in' : 'Check your email'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {step === 'email'
                    ? 'Enter your email to receive a magic link'
                    : `We sent a code to ${email}`}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {step === 'email' ? (
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
                <Button type="submit" className="w-full" disabled={submitting || cooldown > 0}>
                  <Mail className="mr-2 h-4 w-4" />
                  {submitting ? 'Sending...' : cooldown > 0 ? `Send Magic Link (${cooldown}s)` : 'Send Magic Link'}
                </Button>
              </form>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground text-center">
                  Click the link in the email, or enter the 6-digit code below:
                </p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  className="w-full"
                  onClick={handleVerifyOtp}
                  disabled={submitting || otp.length !== 6}
                >
                  {submitting ? 'Verifying...' : 'Verify Code'}
                </Button>
                <Button
                  variant="link"
                  className="w-full text-muted-foreground"
                  onClick={handleSendMagicLink}
                  disabled={submitting || cooldown > 0}
                >
                  {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
