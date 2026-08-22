// src/app/api/lndProxy/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible'; // npm install (free lib)
import { adminAuth } from '@/app/lib/firebase-admin'; // our initialized admin auth
import { getAdminUidsServer } from '@/app/lib/auth-utils';
import { jsonWithCors, handleCorsPreflight } from '@/app/lib/cors';

export const dynamic = 'force-dynamic';


const ipLimiter = new RateLimiterMemory({ points: 30, duration: 60 }); // 30/min per IP
const userLimiter = new RateLimiterMemory({ points: 10, duration: 60 }); // 10/min per UID

const MAX_INVOICE_AMOUNT_MSAT = 5_000_000_000; // 5 Billion msat = 5,000,000 sats (0.05 BTC)

interface LndInvoiceRequest {
  value_msat?: number | string;
  value?: number | string;
  memo?: string;
  expiry?: string;
  private?: boolean;
  payment_request?: string;
}

/* ------------------------------------------------------------------ */
/*  POST – create invoice, Send Payment Request                       */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {

  // Rate limit by IP
  try {
    await ipLimiter.consume(req.headers.get('x-forwarded-for') || 'anonymous');
  } catch {
    return jsonWithCors({ error: 'IP rate limit exceeded' }, { status: 429 }, req);
  }

  // Authenticate request
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonWithCors({ error: 'Unauthorized: No token' }, { status: 401 }, req);
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken);
  } catch {
    return jsonWithCors({ error: 'Unauthorized: Invalid token' }, { status: 401 }, req);
  }

  // Rate limit by User UID
  try {
    await userLimiter.consume(decodedToken.uid);
  } catch {
    return jsonWithCors({ error: 'User rate limit exceeded' }, { status: 429 }, req);
  }

  const { pathname, search } = new URL(req.url);
  const lndPath = pathname.replace(/^\/api\/lndProxy/, '') + search;
  const pathWithoutQuery = lndPath.split('?')[0];

  const adminUids = getAdminUidsServer();
  const isAdmin = adminUids.includes(decodedToken.uid);

  if (!isAdmin) {
    const allowedPOST = ['/v1/invoices', '/v1/channels/transactions'];
    if (!allowedPOST.includes(pathWithoutQuery)) {
      return jsonWithCors({ error: 'Forbidden: Admin access required' }, { status: 403 }, req);
    }
  }

  const proxyUrl = `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/lndProxy?path=${lndPath}`;

  console.log('POST → Firebase:', proxyUrl);

  try {
    const headers = new Headers(req.headers);
    headers.set('Content-Type', 'application/json');

    let payload: LndInvoiceRequest | null = null;
    if (req.method === 'POST') {
      try { payload = await req.json(); }
      catch {
        return new NextResponse(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Body:', payload);
     
    // Validate value_msat for /v1/invoices endpoint
    if (pathWithoutQuery === '/v1/invoices') {
      const rawVal = payload?.value_msat ?? payload?.value;
      const valueMsat = typeof rawVal === 'number' ? rawVal : typeof rawVal === 'string' ? parseInt(rawVal, 10) : NaN;

      if (isNaN(valueMsat) || !Number.isFinite(valueMsat) || valueMsat <= 0 || valueMsat > MAX_INVOICE_AMOUNT_MSAT) {
        return new NextResponse(
          JSON.stringify({ error: 'Invalid invoice amount. Must be a positive integer up to 5,000,000,000 msat.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate payment_request for /channels/transactions (payments) endpoint
    if (lndPath.includes('/channels/transactions')) {
      if (!payload?.payment_request?.match(/^ln(bc|tb|tc|regtest)[1-9a-zA-HJ-NP-Z]+$/i)) {
        return new NextResponse(JSON.stringify({ error: 'Invalid payment request' }), { status: 400 });
      }
    }

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
      console.error('LND Proxy Error:', firebaseResp.status, data);
      return new NextResponse(
        JSON.stringify({ error: 'LND Proxy failed', details: data }),
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
      { status: 500, headers: { 'Content c-Type': 'application/json' } }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET – lookup invoice                                             */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {

  // Rate limit by IP
  try {
    await ipLimiter.consume(req.headers.get('x-forwarded-for') || 'anonymous');
  } catch {
    return new NextResponse(JSON.stringify({ error: 'IP rate limit exceeded' }), { status: 429 });
  }

  // Authenticate request
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized: No token' }), { status: 401 });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken);
  } catch {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized: Invalid token' }), { status: 401 });
  }

  // Rate limit by User UID
  try {
    await userLimiter.consume(decodedToken.uid);
  } catch {
    return new NextResponse(JSON.stringify({ error: 'User rate limit exceeded' }), { status: 429 });
  }
  // End authentication - start proxing request
  
  const { pathname, search } = new URL(req.url);
  const lndPath = pathname.replace(/^\/api\/lndProxy/, '') + search;
  const pathWithoutQuery = lndPath.split('?')[0];

  const adminUids = getAdminUidsServer();
  const isAdmin = adminUids.includes(decodedToken.uid);

  if (!isAdmin) {
    const isInvoiceGet = pathWithoutQuery.startsWith('/v1/invoice/');
    const isFeesGet = pathWithoutQuery === '/v1/fees';
    if (!isInvoiceGet && !isFeesGet) {
      return new NextResponse(JSON.stringify({ error: 'Forbidden: Admin access required' }), { status: 403 });
    }
  }

  const proxyUrl = `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/lndProxy?path=${lndPath}`;

  console.log('GET → Firebase:', proxyUrl);

  // In GET for /invoice/{hash}
  if (lndPath.startsWith('/v1/invoice/')) {
    const hash = lndPath.split('/v1/invoice/')[1];

    if (!/^[A-Za-z0-9+/=]{43,44}$/.test(hash)) { // Base64 regex
    return new NextResponse(JSON.stringify({ error: 'Invalid hash format' }), { status: 400 });
    }
  }

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
      console.error('LND error:', firebaseResp.status, data);
      return new NextResponse(
        JSON.stringify({ error: 'LND failed', details: data }),
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
/*  OPTIONS & HEAD – CORS preflight handling                           */
/* ------------------------------------------------------------------ */
export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflight(req);
}

export async function HEAD(req: NextRequest) {
  return handleCorsPreflight(req);
}