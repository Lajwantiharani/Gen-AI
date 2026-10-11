export async function handler() {
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY ?? process.env.apiKey);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
    body: JSON.stringify({
      ok: true,
      model: "gemini-2.5-flash",
      hasServerKey,
    }),
  };
}
