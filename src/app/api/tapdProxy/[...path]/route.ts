// src/app/api/tapdProxy/[...path]/route.ts
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface TapdRequest {
  // Generic interface; adjust based on specific endpoints if needed, but keep flexible for proxying
  [key: string]: undefined;
}

/* ------------------------------------------------------------------ */
/*  POST – e.g., mint asset, burn asset, send asset, etc.            */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const { pathname, search } = new URL(req.url);
  const tapdPath = pathname.replace(/^\/api\/tapdProxy/, '') + search;

  const proxyUrl = `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/tapdProxy?path=${tapdPath}`;

  console.log('POST → Firebase:', proxyUrl);

  try {
    const headers = new Headers(req.headers);
    headers.set('Content-Type', 'application/json');

    let payload: TapdRequest | null = null;
    try { payload = await req.json(); }
    catch {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('Body:', payload);

    const firebaseResp = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const clone = firebaseResp.clone();
    let data: unknown;
    try { data = await firebaseResp.json(); }
    catch {
      const txt = await clone.text();
      console.error('Non-JSON from Firebase:', txt);
      return new NextResponse(
        JSON.stringify({ error: 'Invalid proxy response', details: txt }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!firebaseResp.ok) {
      console.error('Tapd Proxy Error:', firebaseResp.status, data);
      return new NextResponse(
        JSON.stringify({ error: 'Tapd Proxy failed', details: data }),
        { status: firebaseResp.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('POST proxy error:', msg);
    return new NextResponse(
      JSON.stringify({ error: 'Internal error', details: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET – e.g., list assets, balances, history, etc.                 */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  const { pathname, search } = new URL(req.url);
  const tapdPath = pathname.replace(/^\/api\/tapdProxy/, '') + search;

  const proxyUrl = `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/tapdProxy?path=${tapdPath}`;

  console.log('GET → Firebase:', proxyUrl);

  try {
    const firebaseResp = await fetch(proxyUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const clone = firebaseResp.clone();
    let data: unknown;
    try { data = await firebaseResp.json(); }
    catch {
      const txt = await clone.text();
      console.error('Non-JSON from Firebase:', txt);
      return new NextResponse(
        JSON.stringify({ error: 'Invalid proxy response', details: txt }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!firebaseResp.ok) {
      console.error('Tapd error:', firebaseResp.status, data);
      return new NextResponse(
        JSON.stringify({ error: 'Tapd failed', details: data }),
        { status: firebaseResp.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('GET proxy error:', msg);
    return new NextResponse(
      JSON.stringify({ error: 'Internal error', details: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE – e.g., delete universe root, federation server           */
/* ------------------------------------------------------------------ */
export async function DELETE(req: NextRequest) {
  const { pathname, search } = new URL(req.url);
  const tapdPath = pathname.replace(/^\/api\/tapdProxy/, '') + search;

  const proxyUrl = `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/tapdProxy?path=${tapdPath}`;

  console.log('DELETE → Firebase:', proxyUrl);

  try {
    const headers = new Headers(req.headers);
    headers.set('Content-Type', 'application/json');

    let payload: TapdRequest | null = null;
    try { payload = await req.json(); }
    catch {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('Body:', payload);

    const firebaseResp = await fetch(proxyUrl, {
      method: 'DELETE',
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const clone = firebaseResp.clone();
    let data: unknown;
    try { data = await firebaseResp.json(); }
    catch {
      const txt = await clone.text();
      console.error('Non-JSON from Firebase:', txt);
      return new NextResponse(
        JSON.stringify({ error: 'Invalid proxy response', details: txt }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!firebaseResp.ok) {
      console.error('Tapd Proxy Error:', firebaseResp.status, data);
      return new NextResponse(
        JSON.stringify({ error: 'Tapd Proxy failed', details: data }),
        { status: firebaseResp.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('DELETE proxy error:', msg);
    return new NextResponse(
      JSON.stringify({ error: 'Internal error', details: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  HEAD – for CORS preflight (optional but clean)                   */
/* ------------------------------------------------------------------ */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}