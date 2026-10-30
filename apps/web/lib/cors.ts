/** The mobile app (and its web build) call these routes with a bearer token or the demo header, never with cookies, so open CORS is safe. */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-haalo-demo",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

export const preflight = () => new Response(null, { status: 204, headers: corsHeaders });
