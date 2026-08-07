import { NextRequest, NextResponse } from 'next/server';

/**
 * Generates standard CORS headers for API routes.
 */
export function getCorsHeaders(req?: NextRequest): Record<string, string> {
  const origin = req?.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handles CORS preflight OPTIONS requests.
 */
export function handleCorsPreflight(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req),
  });
}

/**
 * Helper to attach CORS headers to any NextResponse.
 */
export function jsonWithCors(
  data: unknown,
  init: ResponseInit = {},
  req?: NextRequest
): NextResponse {
  const corsHeaders = getCorsHeaders(req);
  const existingHeaders = new Headers(init.headers || {});
  
  Object.entries(corsHeaders).forEach(([key, val]) => {
    existingHeaders.set(key, val);
  });
  
  if (!existingHeaders.has('Content-Type')) {
    existingHeaders.set('Content-Type', 'application/json');
  }

  return new NextResponse(JSON.stringify(data), {
    ...init,
    headers: existingHeaders,
  });
}
