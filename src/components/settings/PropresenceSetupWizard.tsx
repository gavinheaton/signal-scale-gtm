import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Eye, EyeOff, ExternalLink, Loader2, CheckCircle2, XCircle, Sparkles, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  projectId: string;
  onConnected?: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

const PROPRESENCE_API_ACCESS_URL = 'https://app.propresence.com.au/account/api-access';
const PROPRESENCE_SIGNUP_URL = 'https://app.propresence.com.au';

export default function PropresenceSetupWizard({ projectId, onConnected }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [target, setTarget] = useState<'personal' | 'company'>('company');
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const reset = () => {
    setStep(1);
    setApiKey('');
    setShowKey(false);
    setTarget('company');
    setValidating(false);
    setValidated(false);
    setValidationError(null);
    setConnecting(false);
    setSyncing(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const validateKey = async () => {
    if (!apiKey) return;
    setValidating(true);
    setValidationError(null);
    const { data, error } = await supabase.functions.invoke('manage-propresence-connection', {
      body: { project_id: projectId, api_key: apiKey, target, validate_only: true },
    });
    setValidating(false);
    if (error || data?.error || !data?.ok) {
      const msg = data?.error || error?.message || 'Key not accepted by ProPresence';
      setValidationError(msg);
      setValidated(false);
      return;
    }
    setValidated(true);
    setValidationError(null);
  };

  const connectAndSync = async () => {
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke('manage-propresence-connection', {
      body: { project_id: projectId, api_key: apiKey, target },
    });
    setConnecting(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to save connection');
      return;
    }
    toast.success('ProPresence connected');
    setStep(5);
    // Fire-and-forget first sync
    setSyncing(true);
    const { error: syncErr } = await supabase.functions.invoke('sync-tone-to-propresence', {
      body: { project_id: projectId },
    });
    setSyncing(false);
    if (syncErr) {
      toast.message('Connected — first brand voice sync had an issue, you can retry from the card.');
    } else {
      toast.success('Brand voice synced to ProPresence');
    }
  };

  const finish = () => {
    handleOpenChange(false);
    onConnected?.();
    // Refresh underlying card state
    setTimeout(() => window.location.reload(), 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4" style={{ color: 'hsl(var(--purple))' }} />
          Use setup wizard
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect ProPresence — Step {step === 5 ? 4 : step} of 4</DialogTitle>
          <DialogDescription>
            {step === 1 && 'A quick guided setup to sync your brand voice and approved campaign assets to ProPresence.'}
            {step === 2 && 'Generate an API key from your ProPresence account.'}
            {step === 3 && 'Paste your key here. We\'ll validate it before saving anything.'}
            {step === 4 && 'Choose where assets should be published.'}
            {step === 5 && 'You\'re connected.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <p className="text-sm font-medium">What gets synced</p>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>Your brand voice (tone, vocabulary, formatting rules)</li>
                <li>Approved long-form articles and short-form posts from campaigns</li>
                <li>Scheduled publish dates and channel tags</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Don't have a ProPresence account yet?{' '}
              <a
                href={PROPRESENCE_SIGNUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-primary inline-flex items-center gap-1"
              >
                Sign up <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <Button
              asChild
              className="w-full"
              style={{ backgroundColor: 'hsl(var(--purple))', color: 'white' }}
            >
              <a href={PROPRESENCE_API_ACCESS_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open ProPresence — API Access
              </a>
            </Button>
            <div className="rounded-lg border bg-card p-4">
              <ol className="text-sm text-foreground space-y-2 list-decimal pl-5">
                <li>Log in to ProPresence.</li>
                <li>Go to <span className="font-medium">Account → API Access</span>.</li>
                <li>Click <span className="font-medium">New Key</span>, name it "Signal+Scale".</li>
                <li>Copy the key — it starts with <code className="text-xs px-1 py-0.5 rounded bg-muted">ppk_live_</code> and is only shown once.</li>
              </ol>
            </div>
            <p className="text-xs text-muted-foreground">
              Once you've copied your key, come back here and continue to the next step.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <div>
              <Label>ProPresence API Key</Label>
              <div className="relative mt-1">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setValidated(false); setValidationError(null); }}
                  placeholder="ppk_live_..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10"
                  onClick={() => setShowKey(s => !s)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button onClick={validateKey} disabled={!apiKey || validating} variant="secondary">
              {validating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Validate key
            </Button>

            {validated && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Key accepted by ProPresence
              </div>
            )}
            {validationError && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              We never store the key in the browser — it's saved encrypted in Supabase Vault only after you finish the wizard.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 py-2">
            <Label>Publish to</Label>
            <RadioGroup value={target} onValueChange={v => setTarget(v as 'personal' | 'company')}>
              <div className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40" onClick={() => setTarget('company')}>
                <RadioGroupItem value="company" id="company" className="mt-1" />
                <div>
                  <Label htmlFor="company" className="cursor-pointer font-medium">Company</Label>
                  <p className="text-xs text-muted-foreground">Publish to your company's ProPresence brand profile.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40" onClick={() => setTarget('personal')}>
                <RadioGroupItem value="personal" id="personal" className="mt-1" />
                <div>
                  <Label htmlFor="personal" className="cursor-pointer font-medium">Personal</Label>
                  <p className="text-xs text-muted-foreground">Publish under your personal ProPresence profile (e.g. founder voice).</p>
                </div>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              You can change this later from the ProPresence card in Settings.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              <div>
                <p className="font-medium">ProPresence connected</p>
                <p className="text-xs text-muted-foreground capitalize">
                  Target: {target}
                  {syncing ? ' · syncing brand voice…' : ' · brand voice synced'}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              From now on, approved campaign assets can be pushed straight to ProPresence from the Content Pipeline.
            </p>
          </div>
        )}

        <DialogFooter className="flex sm:justify-between gap-2">
          {step > 1 && step < 5 ? (
            <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as Step)} disabled={connecting || validating}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          ) : <span />}

          {step === 1 && (
            <Button onClick={() => setStep(2)}>Get started <ArrowRight className="h-4 w-4 ml-1" /></Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)}>I've copied my key <ArrowRight className="h-4 w-4 ml-1" /></Button>
          )}
          {step === 3 && (
            <Button onClick={() => setStep(4)} disabled={!validated}>
              Continue <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 4 && (
            <Button onClick={connectAndSync} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Connect & sync
            </Button>
          )}
          {step === 5 && (
            <Button onClick={finish}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
