// src/app/api/lndProxy/[...path]/route.ts
import { NextRequest } from 'next/server';

/*
export async function POST(req: NextRequest) {
  return new Response(
    JSON.stringify({ 
      message: "DEBUG: Route is working!", 
      path: req.url 
    }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
*/


import fetch from 'node-fetch';

export async function POST(req: NextRequest) {
  const { pathname, search } = new URL(req.url);
  const lndPath = pathname.replace(/^\/api\/lndProxy/, '') + search; // preserve query

  const headers = Object.fromEntries(req.headers.entries());
  const body = await req.text();

  const proxyUrl = `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/lndProxy?path=${encodeURIComponent(lndPath)}`;

  console.log('Forwarding to Firebase:', proxyUrl, body);

  const lndResp = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body,
  });

  const text = await lndResp.text();
  console.log('Firebase →', lndResp.status, text);

  // === ADD ERROR LOGGING ===
  if (!lndResp.ok) {
    const errorText = await lndResp.text();
    console.error('LND Proxy Error:', lndResp.status, errorText);
    return new Response(
      JSON.stringify({ error: 'LND Proxy failed', details: errorText }),
      { status: lndResp.status }
    );
  }

  const data = await lndResp.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
