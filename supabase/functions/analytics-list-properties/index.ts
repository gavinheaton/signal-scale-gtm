import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

async function refreshIfNeeded(svc: ReturnType<typeof createClient>, conn: {
  id: string; access_token: string; refresh_token: string; expires_at: string;
}) {
  if (new Date(conn.expires_at).getTime() - Date.now() > 60_000) return conn.access_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: conn.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Token refresh failed');
  const accessToken = data.access_token as string;
  const newExpiresAt = new Date(Date.now() + (data.expires_in as number) * 1000).toISOString();
  await svc.from('project_google_connections')
    .update({ access_token: accessToken, expires_at: newExpiresAt }).eq('id', conn.id);
  return accessToken;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { project_id } = await req.json();
    if (!project_id) return new Response(JSON.stringify({ error: 'project_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: project } = await svc.from('projects').select('id, org_id').eq('id', project_id).maybeSingle();
    if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: hasAccess } = await svc.rpc('user_has_org_access', { _user_id: user.id, _org_id: project.org_id });
    if (!hasAccess) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: connRaw } = await svc.from('project_google_connections').select('*').eq('project_id', project_id).maybeSingle();
    if (!connRaw) return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const conn = connRaw as { id: string; access_token: string; refresh_token: string; expires_at: string; gsc_site_url: string | null; ga4_property_id: string | null };

    const accessToken = await refreshIfNeeded(svc, conn);

    // GSC sites
    const sitesRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const sitesData = await sitesRes.json();
    const gscSites = (sitesData.siteEntry || []).map((e: { siteUrl: string; permissionLevel: string }) => ({
      siteUrl: e.siteUrl, permissionLevel: e.permissionLevel,
    }));

    // GA4 properties
    const summariesRes = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const summariesData = await summariesRes.json();
    const ga4Properties: Array<{ propertyId: string; propertyName: string; accountName: string; defaultUri?: string }> = [];
    for (const acc of summariesData.accountSummaries || []) {
      for (const prop of acc.propertySummaries || []) {
        const id = String(prop.property).replace('properties/', '');
        let defaultUri: string | undefined;
        try {
          const streamsRes = await fetch(`https://analyticsadmin.googleapis.com/v1beta/${prop.property}/dataStreams`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const streamsData = await streamsRes.json();
          const web = (streamsData.dataStreams || []).find((s: { webStreamData?: { defaultUri?: string } }) => s.webStreamData?.defaultUri);
          defaultUri = web?.webStreamData?.defaultUri;
        } catch (_) { /* ignore */ }
        ga4Properties.push({
          propertyId: id,
          propertyName: prop.displayName || id,
          accountName: acc.displayName || '',
          defaultUri,
        });
      }
    }

    return new Response(JSON.stringify({
      connected: true,
      gscSites,
      ga4Properties,
      current: { gsc_site_url: conn.gsc_site_url, ga4_property_id: conn.ga4_property_id },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('analytics-list-properties error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
