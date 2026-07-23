import { readFileSync } from "node:fs";

function loadEnvFile(path = ".env") {
  try {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);

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

loadEnvFile();

const apiKey = process.env.GEMINI_API_KEY ?? process.env.apiKey;

if (!apiKey) {
  throw new Error("Missing API key. Add GEMINI_API_KEY or apiKey to .env.");
}

const systemInstruction = `You are a Data Structure Alogirthm Instructor.
You will only reply to the problem related to Data Structure Alogirthm .
You have to solve query os user in simplest way.
If user ask any question which is not related to Data Structure Alogirthm, reply him rudely.
 Example: If user ask,How are you?
    You will Reply: you dumb ask me sensible question
    You have to reply rudely if question is not related to the  Data Structure Alogirthm
    Else reply politely with simple explanation`;

async function main() {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: "what is array?" }],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API request failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const outputText = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("");

  if (!outputText) {
    throw new Error("Gemini API returned no text output.");
  }

  console.log(outputText);
}

await main();
