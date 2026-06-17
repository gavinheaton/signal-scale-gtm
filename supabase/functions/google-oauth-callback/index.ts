import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;
const APP_URL = Deno.env.get('GTM_PLATFORM_URL') || 'https://signal2scale.com.au';

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;

function hostFromUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`);
    return url.host.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function htmlResponse(message: string, returnUrl: string, success: boolean) {
  const status = success ? 'connected=1' : 'connected=0';
  const target = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}${status}`;
  const body = `<!doctype html><html><body style="font-family:system-ui;padding:24px;text-align:center">
    <h2>${success ? 'Google connected' : 'Connection failed'}</h2>
    <p>${message}</p>
    <p>Redirecting…</p>
    <script>
      try { if (window.opener) { window.opener.postMessage({type:'google-oauth',success:${success}}, '*'); window.close(); } } catch(e){}
      setTimeout(()=>{ window.location.href = ${JSON.stringify(target)}; }, 1500);
    </script>
  </body></html>`;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  let returnUrl = `${APP_URL}/analytics`;
  let projectId: string | null = null;

  try {
    if (stateRaw) {
      const state = JSON.parse(atob(stateRaw));
      projectId = state.project_id;
      if (state.return_url) returnUrl = `${APP_URL}${state.return_url}`;
    }

    if (error) return htmlResponse(`Google returned: ${error}`, returnUrl, false);
    if (!code || !projectId) return htmlResponse('Missing code or state.', returnUrl, false);

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Token exchange failed', tokens);
      return htmlResponse(tokens.error_description || 'Token exchange failed.', returnUrl, false);
    }

    const accessToken = tokens.access_token as string;
    const refreshToken = tokens.refresh_token as string | undefined;
    const expiresIn = tokens.expires_in as number;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Get user email
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((r) => r.json());
    const googleEmail = userInfo.email as string | undefined;

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Find project's website URL from latest completed brand voice
    const { data: bv } = await svc
      .from('brand_voices')
      .select('brand_identity, status, updated_at')
      .eq('project_id', projectId)
      .eq('status', 'complete')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const websiteHost = hostFromUrl((bv?.brand_identity as Record<string, unknown> | null)?.website_url as string | undefined);

    console.log('auto-match websiteHost=', websiteHost);

    // Auto-match GSC site
    let gscSiteUrl: string | null = null;
    let gscCount = 0;
    try {
      const sitesRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const sitesData = await sitesRes.json();
      if (sitesRes.ok && Array.isArray(sitesData.siteEntry)) {
        const entries = sitesData.siteEntry as Array<{ siteUrl: string; permissionLevel: string }>;
        gscCount = entries.length;
        if (websiteHost) {
          const domainMatch = entries.find((e) => e.siteUrl === `sc-domain:${websiteHost}`);
          const urlMatch = entries.find((e) => hostFromUrl(e.siteUrl) === websiteHost);
          gscSiteUrl = domainMatch?.siteUrl || urlMatch?.siteUrl || null;
        }
      }
    } catch (e) {
      console.error('GSC site list failed', e);
    }
    console.log(`GSC sites=${gscCount}, matched=${gscSiteUrl}`);

    // Auto-match GA4 property
    let ga4PropertyId: string | null = null;
    let ga4Count = 0;
    try {
      const summariesRes = await fetch(
        'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const summariesData = await summariesRes.json();
      if (summariesRes.ok && Array.isArray(summariesData.accountSummaries)) {
        outer: for (const acc of summariesData.accountSummaries) {
          for (const prop of acc.propertySummaries || []) {
            ga4Count++;
            if (!websiteHost) continue;
            const streamsRes = await fetch(
              `https://analyticsadmin.googleapis.com/v1beta/${prop.property}/dataStreams`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const streamsData = await streamsRes.json();
            const streams = streamsData.dataStreams || [];
            const match = streams.find((s: { webStreamData?: { defaultUri?: string } }) =>
              hostFromUrl(s.webStreamData?.defaultUri) === websiteHost
            );
            if (match) {
              ga4PropertyId = prop.property.replace('properties/', '');
              break outer;
            }
          }
        }
      }
    } catch (e) {
      console.error('GA4 property match failed', e);
    }
    console.log(`GA4 properties=${ga4Count}, matched=${ga4PropertyId}`);

    // Upsert connection
    const { error: upsertErr } = await svc
      .from('project_google_connections')
      .upsert(
        {
          project_id: projectId,
          google_email: googleEmail,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          gsc_site_url: gscSiteUrl,
          ga4_property_id: ga4PropertyId,
        },
        { onConflict: 'project_id' }
      );
    if (upsertErr) {
      console.error('Upsert failed', upsertErr);
      return htmlResponse(upsertErr.message, returnUrl, false);
    }

    let message: string;
    if (gscSiteUrl || ga4PropertyId) {
      const matched = [gscSiteUrl ? 'Search Console' : null, ga4PropertyId ? 'Analytics 4' : null].filter(Boolean).join(' & ');
      message = `Connected as ${googleEmail}. Matched: ${matched}.`;
    } else if (!websiteHost) {
      message = `Connected as ${googleEmail}. Please choose properties on the Analytics page.`;
    } else {
      message = `Connected as ${googleEmail}. No properties matched ${websiteHost} — pick them manually on the Analytics page.`;
    }
    return htmlResponse(message, returnUrl, true);

  } catch (e) {
    console.error('callback error', e);
    return htmlResponse(String(e), returnUrl, false);
  }
});
