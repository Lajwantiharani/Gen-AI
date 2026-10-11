import { GEMINI_API_URL, systemInstruction } from "../prompts.js";

// Vercel serverless function for POST /api/ask
// Mirrors the handleAsk logic from server.js so the app works identically
// when deployed (the frontend calls /api/ask because it runs over https).
export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  const question = String(body.question ?? "").trim();
  const clientKey = String(body.apiKey ?? "").trim();
  // Prefer a server-side key from Vercel env vars, else fall back to a key
  // pasted in the app sidebar (sent by the client).
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.apiKey ?? clientKey;

  if (!apiKey) {
    return jsonResponse(400, {
      error:
        "Missing Gemini API key. Set GEMINI_API_KEY in your Vercel env vars or paste your key in the app sidebar.",
    });
  }

  if (!question) {
    return jsonResponse(400, { error: "Question is required." });
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const contents = [
    ...history.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.text }],
    })),
    { role: "user", parts: [{ text: question }] },
  ];

  const geminiResponse = await callGeminiWithRetry(apiKey, {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
  });

  if (!geminiResponse.ok) {
    const details = await geminiResponse.text();
    return jsonResponse(geminiResponse.status, {
      error: `Gemini API request failed (${geminiResponse.status}): ${details}`,
    });
  }

  const result = await geminiResponse.json();
  const answer = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  return jsonResponse(200, {
    answer: answer || "Gemini returned no text. Try asking again.",
  });
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function callGeminiWithRetry(apiKey, body, maxAttempts = 3) {
  let lastResponse = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResponse = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (lastResponse.status !== 429 || attempt === maxAttempts) {
      return lastResponse;
    }

    const details = await lastResponse.text();
    const retryMatch = details.match(/Please retry in ([0-9.]+)s/);
    const waitMs = Math.min(Math.ceil(Number(retryMatch?.[1] ?? 12) * 1000), 30000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return lastResponse;
}
