import { useEffect, useMemo, useState } from 'react';
import { CampaignAsset } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { markdownToEmailHtml } from '@/lib/assetEmailHtml';

interface Props {
  asset: CampaignAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EmailAssetDialog({ asset, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && asset) {
      setRecipientEmail(user?.email || '');
      setSubject(asset.title);
    }
  }, [open, asset, user]);

  const htmlContent = useMemo(() => {
    if (!asset?.content) return '';
    return markdownToEmailHtml(asset.content, { title: subject || asset.title, assetType: asset.asset_type });
  }, [asset, subject]);

  if (!asset) return null;

  const handleSend = async () => {
    const to = recipientEmail.trim();
    if (!to || !/.+@.+\..+/.test(to)) {
      toast.error('Enter a valid email address');
      return;
    }
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          recipientEmail: to,
          subject: subject.trim(),
          htmlContent,
          textContent: asset.content || '',
        },
      });
      if (error) throw error;
      toast.success(`Email sent to ${to}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Send Asset by Email
          </DialogTitle>
          <DialogDescription>
            Email this content to yourself or a teammate. Sent via Signal + Scale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          <div>
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Preview</Label>
            <div className="mt-1 border rounded-md overflow-hidden bg-muted/30">
              <iframe
                title="Email preview"
                srcDoc={htmlContent}
                sandbox=""
                className="w-full h-[360px] border-0 bg-white"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !asset.content}>
            {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
            Send email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
