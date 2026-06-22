import { NextResponse } from 'next/server';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 });

  const now = new Date().toISOString();
  const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?timeMin=${now}&timeMax=${future}&orderBy=startTime&singleEvents=true&maxResults=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(request) {
  const { token, event } = await request.json();

  if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 });

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  const data = await res.json();
  return NextResponse.json(data);
}
