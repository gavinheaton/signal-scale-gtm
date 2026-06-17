import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;

async function refreshIfNeeded(svc: ReturnType<typeof createClient>, conn: {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}) {
  const expiresAt = new Date(conn.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return conn.access_token;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Refresh failed', data);
    throw new Error(data.error_description || 'Token refresh failed');
  }
  const accessToken = data.access_token as string;
  const expiresIn = data.expires_in as number;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await svc
    .from('project_google_connections')
    .update({ access_token: accessToken, expires_at: newExpiresAt })
    .eq('id', conn.id);
  return accessToken;
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { project_id, days = 28 } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify access
    const { data: project } = await svc
      .from('projects')
      .select('id, org_id')
      .eq('id', project_id)
      .maybeSingle();
    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: hasAccess } = await svc.rpc('user_has_org_access', {
      _user_id: user.id,
      _org_id: project.org_id,
    });
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: connRaw } = await svc
      .from('project_google_connections')
      .select('*')
      .eq('project_id', project_id)
      .maybeSingle();
    if (!connRaw) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const conn = connRaw as {
      id: string;
      google_email: string;
      access_token: string;
      refresh_token: string;
      expires_at: string;
      gsc_site_url: string | null;
      ga4_property_id: string | null;
    };

    const accessToken = await refreshIfNeeded(svc, conn);

    const startDate = isoDaysAgo(days);
    const endDate = isoDaysAgo(0);

    // Parallel: GSC + GA4
    const gscPromise = conn.gsc_site_url
      ? Promise.all([
          fetch(
            `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(conn.gsc_site_url)}/searchAnalytics/query`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ startDate, endDate, dimensions: ['date'], rowLimit: 1000 }),
            }
          ).then((r) => r.json()),
          fetch(
            `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(conn.gsc_site_url)}/searchAnalytics/query`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 20 }),
            }
          ).then((r) => r.json()),
          fetch(
            `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(conn.gsc_site_url)}/searchAnalytics/query`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ startDate, endDate, dimensions: ['page'], rowLimit: 20 }),
            }
          ).then((r) => r.json()),
        ])
      : Promise.resolve([null, null, null]);

    const ga4Promise = conn.ga4_property_id
      ? Promise.all([
          fetch(
            `https://analyticsdata.googleapis.com/v1beta/properties/${conn.ga4_property_id}:runReport`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
                metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'conversions' }],
                limit: 10000,
              }),
            }
          ).then((r) => r.json()),
        ])
      : Promise.resolve([null]);

    const [[gscDate, gscQueries, gscPages], [ga4Report]] = await Promise.all([gscPromise, ga4Promise]);

    return new Response(
      JSON.stringify({
        connected: true,
        google_email: conn.google_email,
        gsc_site_url: conn.gsc_site_url,
        ga4_property_id: conn.ga4_property_id,
        range: { startDate, endDate, days },
        gsc: {
          byDate: gscDate?.rows || [],
          topQueries: gscQueries?.rows || [],
          topPages: gscPages?.rows || [],
        },
        ga4: {
          report: ga4Report || null,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('analytics-fetch error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
