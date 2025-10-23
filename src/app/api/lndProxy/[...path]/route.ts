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

// STATIC VALUES
const PROXY_URL = 'https://us-central1-rendimientos-5dbb9.cloudfunctions.net/lndProxy';
const MACAROON = '0201036c6e6402f801030a1082f4cadbd734d464054914485e044e381201301a160a0761646472657373120472656164120577726974651a130a04696e666f120472656164120577726974651a170a08696e766f69636573120472656164120577726974651a210a086d616361726f6f6e120867656e6572617465120472656164120577726974651a160a076d657373616765120472656164120577726974651a170a086f6666636861696e120472656164120577726974651a160a076f6e636861696e120472656164120577726974651a140a057065657273120472656164120577726974651a180a067369676e6572120867656e657261746512047265616400000620795ab76b30a6d0856ea98a0ecb45673b0e40458caaab2158a2f2cafbd9a31913';

async function forward(req: NextRequest, lndPath: string) {
  const method = req.method;
  const headers = Object.fromEntries(req.headers.entries());
  headers['Grpc-Metadata-macaroon'] = MACAROON;

  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.text();

  const lndResp = await fetch(`${PROXY_URL}?path=${lndPath}`, {
    method,
    headers,
    body, 
  });

  const respHeaders = new Headers();
  lndResp.headers.forEach((v, k) => respHeaders.set(k, v));

  return new Response(lndResp.body as unknown as BodyInit, {
    status: lndResp.status,
    statusText: lndResp.statusText,
    headers: respHeaders,
  });
}

export async function GET(req: NextRequest) {
  const { pathname } = new URL(req.url);
  const lndPath = pathname.replace(/^\/api\/lndProxy/, '');
  return forward(req, lndPath);
}

export async function POST(req: NextRequest) {
  const { pathname } = new URL(req.url);
  const lndPath = pathname.replace(/^\/api\/lndProxy/, '');
  return forward(req, lndPath);
}
