// Vercel serverless function for GET /api/health
// Lets the frontend show "Gemini ready" when a server-side key is configured.
export default async function handler() {
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY ?? process.env.apiKey);

  return new Response(JSON.stringify({ ok: true, hasServerKey }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
