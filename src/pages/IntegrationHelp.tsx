import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Bot, FileText, AlertTriangle, ArrowLeft, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold shrink-0">
      {n}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">{children}</code>;
}

export default function IntegrationHelp() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/project/settings"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Integration Setup Guide</h1>
      </div>

      <p className="text-muted-foreground text-sm">
        Step-by-step instructions for connecting external services to your Signal&nbsp;+&nbsp;Scale project.
        You need <Badge variant="secondary">admin</Badge> or higher role to manage connections.
      </p>

      <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
        <strong>Prerequisite:</strong> You must have an <Badge variant="secondary">admin</Badge> or higher role <strong>and</strong> a project selected to see the <strong>Connections</strong> section in Settings.
      </div>

      {/* Claude */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Claude (Anthropic)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Powers the <strong>ICP wizard</strong>, <strong>Persona wizard</strong>, <strong>Brand Voice wizard</strong>, and <strong>Campaign content generation</strong>.
          </p>

          <Accordion type="single" collapsible defaultValue="claude-steps">
            <AccordionItem value="claude-steps">
              <AccordionTrigger>Setup steps</AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div className="flex gap-3">
                  <StepBadge n={1} />
                  <div>
                    <p className="font-medium text-sm">Create an Anthropic account</p>
                    <p className="text-xs text-muted-foreground">
                      Go to{' '}
                      <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                        console.anthropic.com
                      </a>{' '}
                      and sign up or log in.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={2} />
                  <div>
                    <p className="font-medium text-sm">Generate an API key</p>
                    <p className="text-xs text-muted-foreground">
                      Navigate to <strong>API Keys</strong> and create a new key. Copy it — it starts with <Code>sk-ant-</Code>.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={3} />
                  <div>
                    <p className="font-medium text-sm">Open Settings → Connections</p>
                    <p className="text-xs text-muted-foreground">
                      In Signal + Scale, go to{' '}
                      <Link to="/project/settings" className="underline text-primary">Settings</Link>{' '}
                      and find the <strong>Connections</strong> section.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={4} />
                  <div>
                    <p className="font-medium text-sm">Configure Claude</p>
                    <p className="text-xs text-muted-foreground">
                      Click <strong>Configure</strong> next to Claude, paste your API key, and save. Your key is encrypted via Supabase Vault.
                    </p>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
                  <strong>Note:</strong> Anthropic charges per API call. Make sure your account has billing enabled and sufficient credits.
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Notion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Notion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Powers <strong>Push to Notion</strong> for campaign assets and <strong>Campaign Brief creation</strong>.
          </p>

          <Accordion type="single" collapsible defaultValue="notion-steps">
            <AccordionItem value="notion-steps">
              <AccordionTrigger>Setup steps</AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div className="flex gap-3">
                  <StepBadge n={1} />
                  <div>
                    <p className="font-medium text-sm">Create a Notion integration</p>
                    <p className="text-xs text-muted-foreground">
                      Go to{' '}
                      <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                        notion.so/my-integrations
                      </a>{' '}
                      and create a new integration. Name it <Code>Signal2Scale</Code>.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={2} />
                  <div>
                    <p className="font-medium text-sm">Copy the integration token</p>
                    <p className="text-xs text-muted-foreground">
                      On the integration page, copy the <strong>Internal Integration Secret</strong>. It starts with <Code>ntn_</Code>.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={3} />
                  <div>
                    <p className="font-medium text-sm">Configure Notion in Settings</p>
                    <p className="text-xs text-muted-foreground">
                      In Signal + Scale, go to{' '}
                      <Link to="/project/settings" className="underline text-primary">Settings → Connections</Link>{' '}
                      and click <strong>Configure</strong> next to Notion. Paste the token and save.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={4} />
                  <div>
                    <p className="font-medium text-sm">Share Notion pages with the integration</p>
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-destructive">Critical step.</strong> Open each target Notion page, click <strong>Share</strong> (top-right),
                      then <strong>Invite</strong> the <Code>Signal2Scale</Code> integration. Without this, pushes will fail with an "object_not_found" error.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={5} />
                  <div>
                    <p className="font-medium text-sm">Set the Campaign Briefs page ID (admin)</p>
                    <p className="text-xs text-muted-foreground">
                      In Supabase, add a secret called <Code>NOTION_CAMPAIGN_BRIEFS_PAGE_ID</Code> with the ID of the Notion page
                      where campaign briefs should be created. You can paste the full Notion URL — the system extracts the ID automatically.
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* API Access */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Access (Cowork Sync)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Allows external tools like <strong>Cowork</strong> to pull your completed brand voice data via API.
          </p>

          <Accordion type="single" collapsible defaultValue="api-steps">
            <AccordionItem value="api-steps">
              <AccordionTrigger>Setup steps</AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div className="flex gap-3">
                  <StepBadge n={1} />
                  <div>
                    <p className="font-medium text-sm">Go to Settings → API Access</p>
                    <p className="text-xs text-muted-foreground">
                      In Signal + Scale, open{' '}
                      <Link to="/project/settings" className="underline text-primary">Settings</Link>{' '}
                      and scroll to the <strong>API Access</strong> section.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={2} />
                  <div>
                    <p className="font-medium text-sm">Generate an API Key</p>
                    <p className="text-xs text-muted-foreground">
                      Click <strong>Generate API Key</strong>. The key (prefixed <Code>gtm_</Code>) is shown once in a modal.
                      Copy it immediately — it cannot be retrieved later.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={3} />
                  <div>
                    <p className="font-medium text-sm">Configure Cowork</p>
                    <p className="text-xs text-muted-foreground">
                      In Cowork, paste the key as a Bearer token. The endpoint is{' '}
                      <Code>GET /functions/v1/get-brand-voices</Code> with header{' '}
                      <Code>Authorization: Bearer gtm_xxxxx</Code>.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <StepBadge n={4} />
                  <div>
                    <p className="font-medium text-sm">Verify the sync</p>
                    <p className="text-xs text-muted-foreground">
                      Cowork will pull all completed brand voices from your organisation's projects automatically.
                    </p>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
                  <strong>Note:</strong> You can revoke a key at any time from Settings → API Access.
                  Revoking a key immediately blocks all requests using it.
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Troubleshooting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="t1">
              <AccordionTrigger>"object_not_found" error when pushing to Notion</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The target Notion page is <strong>not shared</strong> with the Signal2Scale integration.
                Open the page in Notion → <strong>Share</strong> → invite the integration. If the page was moved or duplicated,
                update the <Code>NOTION_CAMPAIGN_BRIEFS_PAGE_ID</Code> secret.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="t2">
              <AccordionTrigger>502 or timeout errors</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Usually means the API key is invalid, expired, or the external service is temporarily unavailable.
                Go to <Link to="/project/settings" className="underline text-primary">Settings → Connections</Link> and update the key.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="t3">
              <AccordionTrigger>Permission errors in Settings</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Only <Badge variant="secondary">admin</Badge> or higher roles can manage connections.
                Ask your organisation owner to upgrade your role if needed.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="t4">
              <AccordionTrigger>"unauthorized" from Notion API</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The Notion integration token is invalid or was revoked. Generate a new token at{' '}
                <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                  notion.so/my-integrations
                </a>{' '}
                and update the connection in Settings.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="t5">
              <AccordionTrigger>"unauthorized" when calling the brand voice API</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The API key is invalid, revoked, or missing. Generate a new key in{' '}
                <Link to="/project/settings" className="underline text-primary">Settings → API Access</Link>{' '}
                and update the Bearer token in Cowork.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
