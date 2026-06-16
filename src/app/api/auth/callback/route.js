import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function saveToken(service, accessToken, refreshToken) {
  await fetch(`${SUPABASE_URL}/rest/v1/tokens`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: service, access_token: accessToken, refresh_token: refreshToken, updated_at: new Date().toISOString() })
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', request.url));
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        client_secret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await response.json();
    await saveToken('gcal', tokens.access_token, tokens.refresh_token);
    await saveToken('drive', tokens.access_token, tokens.refresh_token);
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('access_token', tokens.access_token);
    redirectUrl.searchParams.set('drive_token', tokens.access_token);
    if (tokens.refresh_token) redirectUrl.searchParams.set('refresh_token', tokens.refresh_token);
    return NextResponse.redirect(redirectUrl);
  } catch {
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
