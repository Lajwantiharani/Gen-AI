import { GEMINI_API_URL, systemInstruction } from "../../prompts.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  const question = String(body.question ?? "").trim();
  const clientKey = String(body.apiKey ?? "").trim();
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.apiKey ?? clientKey;

  if (!apiKey) {
    return jsonResponse(400, {
      error: "Missing Gemini API key. Add GEMINI_API_KEY in Netlify env vars or paste your key in the app sidebar.",
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
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
    body: JSON.stringify(payload),
  };
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
