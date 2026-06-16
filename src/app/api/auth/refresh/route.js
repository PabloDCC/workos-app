import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function refreshGoogleToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      client_secret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  return response.json();
}

async function updateToken(service, accessToken) {
  await fetch(`${SUPABASE_URL}/rest/v1/tokens?id=eq.${service}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, updated_at: new Date().toISOString() })
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const service = searchParams.get('service');
  if (!service) return NextResponse.json({ error: 'No service specified' }, { status: 400 });

  try {
    // Get refresh token from Supabase
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tokens?id=eq.${service}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    if (!data?.[0]?.refresh_token) return NextResponse.json({ error: 'No refresh token found' }, { status: 404 });

    // Refresh the token
    const tokens = await refreshGoogleToken(data[0].refresh_token);
    if (!tokens.access_token) return NextResponse.json({ error: 'Failed to refresh' }, { status: 500 });

    // Save new access token
    await updateToken(service, tokens.access_token);

    return NextResponse.json({ access_token: tokens.access_token });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
