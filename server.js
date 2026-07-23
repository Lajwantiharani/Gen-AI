import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { GEMINI_API_URL, GEMINI_MODEL, systemInstruction } from "./prompts.js";

const START_PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.cwd();

loadEnvFile();

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/ask") {
      await handleAsk(request, response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/health") {
      const hasServerKey = Boolean(process.env.GEMINI_API_KEY ?? process.env.apiKey);
      sendJson(response, 200, {
        ok: true,
        model: GEMINI_MODEL,
        hasServerKey,
      });
      return;
    }

    if (request.method === "GET") {
      await serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, { error: error.message ?? "Server error" });
  }
});

listenOnAvailablePort(START_PORT);

function listenOnAvailablePort(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
      listenOnAvailablePort(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, () => {
    console.log(`DSA Instructor running at http://localhost:${port}`);
  });
}

async function handleAsk(request, response) {
  const body = await readRequestJson(request);
  const question = String(body.question ?? "").trim();
  const clientKey = String(body.apiKey ?? "").trim();
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.apiKey ?? clientKey;

  if (!apiKey) {
    sendJson(response, 400, {
      error: "Missing Gemini API key. Add GEMINI_API_KEY to .env or paste your key in the app sidebar.",
    });
    return;
  }

  if (!question) {
    sendJson(response, 400, { error: "Question is required." });
    return;
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const contents = [
    ...history.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.text }],
    })),
    {
      role: "user",
      parts: [{ text: question }],
    },
  ];

  const geminiResponse = await callGeminiWithRetry(apiKey, {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
  });

  if (!geminiResponse.ok) {
    const details = await geminiResponse.text();
    sendJson(response, geminiResponse.status, {
      error: `Gemini API request failed (${geminiResponse.status}): ${details}`,
    });
    return;
  }

  const result = await geminiResponse.json();
  const answer = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  sendJson(response, 200, {
    answer: answer || "Gemini returned no text. Try asking again.",
  });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${START_PORT}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(ROOT, `.${requestedPath}`);

  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const content = await readFile(filePath);
  response.writeHead(200, { "Content-Type": getContentType(filePath) });
  response.end(content);
}

function readRequestJson(request) {
  return new Promise((resolveJson, rejectJson) => {
    let data = "";

    request.on("data", (chunk) => {
      data += chunk;
    });

    request.on("end", () => {
      try {
        resolveJson(data ? JSON.parse(data) : {});
      } catch (error) {
        rejectJson(error);
      }
    });

    request.on("error", rejectJson);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
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

function getContentType(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
  };

  return types[extname(filePath)] ?? "application/octet-stream";
}

function loadEnvFile(path = ".env") {
  try {
    const lines = readFileSync(join(ROOT, path), "utf8").split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
