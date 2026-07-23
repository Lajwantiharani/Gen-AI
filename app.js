import { GEMINI_API_URL, systemInstruction } from "./prompts.js";

const isLocalServer = location.protocol === "http:" || location.protocol === "https:";
const STORAGE_KEYS = {
  apiKey: "geminiApiKey",
  messages: "dsaInstructorMessages",
  history: "dsaInstructorHistory",
  theme: "dsaInstructorTheme",
  skillLevel: "dsaInstructorSkillLevel",
};

const STARTER_TOPICS = [
  { icon: "📦", topic: "Arrays", prompt: "Explain arrays with an example in JavaScript." },
  { icon: "🔍", topic: "Searching", prompt: "Teach binary search step by step with dry run." },
  { icon: "🔄", topic: "Recursion", prompt: "Explain recursion using factorial and call stack." },
  { icon: "🧩", topic: "Dynamic Programming", prompt: "Explain dynamic programming and solve Fibonacci." },
  { icon: "📚", topic: "Stacks and Queues", prompt: "Explain stacks vs queues with JavaScript examples." },
  { icon: "🌳", topic: "Trees and Graphs", prompt: "Explain BFS and DFS with a simple example." },
];

const apiKeyInput = document.querySelector("#apiKey");
const saveKeyButton = document.querySelector("#saveKey");
const toggleKeyButton = document.querySelector("#toggleKey");
const connectionState = document.querySelector("#connectionState");
const messagesEl = document.querySelector("#messages");
const chatForm = document.querySelector("#chatForm");
const questionInput = document.querySelector("#question");
const sendButton = document.querySelector("#sendButton");
const clearChatButton = document.querySelector("#clearChat");
const exportChatButton = document.querySelector("#exportChat");
const clearHistoryButton = document.querySelector("#clearHistory");
const historySearch = document.querySelector("#historySearch");
const historyList = document.querySelector("#historyList");
const quickPrompts = document.querySelectorAll(".quick-prompt");
const topicMode = document.querySelector("#topicMode");
const skillLevel = document.querySelector("#skillLevel");
const questionCount = document.querySelector("#questionCount");
const topicCount = document.querySelector("#topicCount");
const streakCount = document.querySelector("#streakCount");
const lastTopic = document.querySelector("#lastTopic");
const themeToggle = document.querySelector("#themeToggle");
const sidebar = document.querySelector("#sidebar");
const sidebarToggle = document.querySelector("#sidebarToggle");
const sidebarOverlay = document.querySelector("#sidebarOverlay");

let chatMessages = loadJson(STORAGE_KEYS.messages, []);
let historyItems = loadJson(STORAGE_KEYS.history, []);

initTheme();
initSettings();
renderMessages();
renderHistory();
updateStats();
refreshConnectionState();

apiKeyInput.addEventListener("input", refreshConnectionState);

function initSettings() {
  apiKeyInput.value = localStorage.getItem(STORAGE_KEYS.apiKey) ?? "";
  skillLevel.value = localStorage.getItem(STORAGE_KEYS.skillLevel) ?? "beginner";
  connectionState.textContent = isLocalServer ? "Server mode" : "File mode";
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme);
  if (saved === "dark") {
    document.documentElement.dataset.theme = "dark";
    themeToggle.textContent = "☀️ Light";
  }
}

saveKeyButton.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
  saveKeyButton.textContent = "Saved ✓";
  refreshConnectionState();
  setTimeout(() => {
    saveKeyButton.textContent = "Save";
  }, 1500);
});

toggleKeyButton.addEventListener("click", () => {
  const isHidden = apiKeyInput.type === "password";
  apiKeyInput.type = isHidden ? "text" : "password";
  toggleKeyButton.textContent = isHidden ? "🙈" : "👁";
});

skillLevel.addEventListener("change", () => {
  localStorage.setItem(STORAGE_KEYS.skillLevel, skillLevel.value);
});

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = isDark ? "light" : "dark";
  localStorage.setItem(STORAGE_KEYS.theme, isDark ? "light" : "dark");
  themeToggle.textContent = isDark ? "🌙 Dark" : "☀️ Light";
});

sidebarToggle?.addEventListener("click", () => {
  sidebar.classList.add("open");
  sidebarOverlay.hidden = false;
  sidebarOverlay.classList.add("visible");
});

sidebarOverlay?.addEventListener("click", closeSidebar);

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
  sidebarOverlay.hidden = true;
}

clearChatButton.addEventListener("click", () => {
  chatMessages = [];
  saveMessages();
  renderMessages();
  updateStats();
});

exportChatButton.addEventListener("click", () => {
  const text = chatMessages
    .map((message) => `${message.role.toUpperCase()} [${message.topic}]\n${message.text}`)
    .join("\n\n");
  const blob = new Blob([text || "No chat yet."], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dsa-instructor-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
});

clearHistoryButton.addEventListener("click", () => {
  historyItems = [];
  saveHistory();
  renderHistory();
});

historySearch.addEventListener("input", renderHistory);

quickPrompts.forEach((button) => {
  button.addEventListener("click", () => {
    topicMode.value = button.dataset.topic ?? "General DSA";
    questionInput.value = button.dataset.prompt ?? "";
    questionInput.focus();
    resizeComposer();
    closeSidebar();
    chatForm.requestSubmit();
  });
});

questionInput.addEventListener("input", resizeComposer);

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = questionInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const topic = topicMode.value;

  if (!question) {
    return;
  }

  if (apiKey) {
    localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
  }

  pushMessage("user", question, topic);
  saveHistoryItem(question, topic);
  questionInput.value = "";
  resizeComposer();
  setLoading(true);
  closeSidebar();

  const thinkingMessage = pushMessage("assistant", "", topic, false, true);

  try {
    const answer = await getAnswer(question, apiKey, topic);
    updateMessage(thinkingMessage.id, answer);
  } catch (error) {
    updateMessage(thinkingMessage.id, formatErrorMessage(error));
  } finally {
    setLoading(false);
  }
});

async function getAnswer(question, apiKey, topic) {
  const level = skillLevel.value;
  const levelNote =
    level === "beginner"
      ? "Explain for a complete beginner."
      : level === "interview"
        ? "Explain at FAANG interview depth with edge cases."
        : "Use balanced intermediate depth.";
  const focusedQuestion = `[Topic focus: ${topic}]\n[Skill level: ${level} — ${levelNote}]\n${question}`;
  const history = buildChatHistory();

  if (isLocalServer) {
    return askServer(focusedQuestion, apiKey, history);
  }

  if (!apiKey) {
    throw new Error("No API key provided. Paste your Gemini API key in the sidebar.");
  }

  return askGemini(focusedQuestion, apiKey, history);
}

function buildChatHistory() {
  return chatMessages
    .filter((message) => !message.thinking && message.text.trim())
    .slice(0, -1)
    .slice(-12)
    .map(({ role, text }) => ({ role, text }));
}

async function refreshConnectionState() {
  if (!isLocalServer) {
    connectionState.textContent = apiKeyInput.value.trim() ? "Direct · Gemini" : "Add API key";
    return;
  }

  const hasClientKey = Boolean(apiKeyInput.value.trim());

  try {
    const response = await fetch("/api/health");
    if (response.ok) {
      const result = await response.json();
      const hasKey = result.hasServerKey || hasClientKey;
      connectionState.textContent = hasKey ? "Gemini ready" : "Add API key";
      return;
    }
  } catch {
    // Fall through if health endpoint unavailable on older server instance.
  }

  connectionState.textContent = hasClientKey ? "Gemini ready" : "Server running";
}

async function askGemini(question, apiKey, history = []) {
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

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini API request failed (${response.status}): ${details}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned no text. Try asking again.");
  }

  return text;
}

async function askServer(question, apiKey, history = []) {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
      apiKey: apiKey || undefined,
      history,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error ?? "Server request failed.");
  }

  return result.answer;
}

function pushMessage(role, text, topic = topicMode.value, save = true, thinking = false) {
  const message = {
    id: createId(),
    role,
    text,
    topic,
    thinking,
    createdAt: new Date().toISOString(),
  };

  chatMessages.push(message);

  if (save) {
    saveMessages();
  }

  renderMessages();
  updateStats();
  return message;
}

function updateMessage(id, text) {
  const message = chatMessages.find((item) => item.id === id);

  if (message) {
    message.text = text;
    message.thinking = false;
    saveMessages();
    renderMessages();
    updateStats();
  }
}

function renderMessages() {
  messagesEl.innerHTML = "";

  if (chatMessages.length === 0) {
    renderEmptyState();
    return;
  }

  for (const message of chatMessages) {
    messagesEl.append(createMessageElement(message));
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderEmptyState() {
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";

  const hero = document.createElement("div");
  hero.className = "welcome-hero";
  hero.innerHTML = `
    <h3>Welcome to DSA Instructor</h3>
    <p>Ask <strong>any</strong> Data Structures or Algorithms question — concepts, problem-solving, complexity, interview prep, or code help. Every answer uses a clear 7-part format.</p>
  `;

  const grid = document.createElement("div");
  grid.className = "topic-cards";

  for (const item of STARTER_TOPICS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topic-card";
    button.innerHTML = `
      <span class="card-icon">${item.icon}</span>
      <strong>${escapeHtml(item.topic)}</strong>
      <small>Tap to start</small>
    `;
    button.addEventListener("click", () => {
      topicMode.value = item.topic;
      questionInput.value = item.prompt;
      questionInput.focus();
      resizeComposer();
      chatForm.requestSubmit();
    });
    grid.append(button);
  }

  emptyState.append(hero, grid);
  messagesEl.append(emptyState);
}

function createMessageElement(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = message.role === "user" ? "YOU" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (message.thinking) {
    bubble.classList.add("thinking");
    bubble.innerHTML = `<span class="thinking-dots">Thinking through DSA steps<span>.</span><span>.</span><span>.</span></span>`;
  } else {
    const content = document.createElement("div");
    content.className = "bubble-content";

    if (message.role === "assistant") {
      content.innerHTML = formatMessageContent(message.text);
    } else {
      content.textContent = message.text;
    }

    bubble.append(content);

    const footer = document.createElement("div");
    footer.className = "message-footer";

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = `${message.topic} · ${formatTime(message.createdAt)}`;

    footer.append(meta);

    if (message.role === "assistant" && message.text) {
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-button";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(message.text);
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.classList.remove("copied");
        }, 1500);
      });
      footer.append(copyBtn);
    }

    bubble.append(footer);
  }

  article.append(avatar, bubble);
  return article;
}

function formatMessageContent(text) {
  const parts = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", lang: match[1], value: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts
    .map((part) => {
      if (part.type === "code") {
        return `<pre><code>${escapeHtml(part.value)}</code></pre>`;
      }
      return formatInlineMarkdown(part.value);
    })
    .join("");
}

function formatInlineMarkdown(text) {
  const lines = escapeHtml(text).split("\n");
  const html = [];
  let listTag = null;

  const closeList = () => {
    if (listTag) {
      html.push(`</${listTag}>`);
      listTag = null;
    }
  };

  for (const line of lines) {
    if (/^### (.+)$/.test(line)) {
      closeList();
      html.push(`<h4>${line.slice(4)}</h4>`);
    } else if (/^## (.+)$/.test(line)) {
      closeList();
      html.push(`<h3>${line.slice(3)}</h3>`);
    } else if (/^# (.+)$/.test(line)) {
      closeList();
      html.push(`<h2>${line.slice(2)}</h2>`);
    } else if (/^- (.+)$/.test(line)) {
      if (listTag !== "ul") {
        closeList();
        html.push("<ul>");
        listTag = "ul";
      }
      html.push(`<li>${applyInlineStyles(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else if (/^\d+\. (.+)$/.test(line)) {
      if (listTag !== "ol") {
        closeList();
        html.push("<ol>");
        listTag = "ol";
      }
      html.push(`<li>${applyInlineStyles(line.replace(/^\d+\. /, ""))}</li>`);
    } else {
      closeList();
      html.push(`<p>${applyInlineStyles(line)}</p>`);
    }
  }

  closeList();
  return html.join("");
}

function applyInlineStyles(line) {
  return line
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function saveHistoryItem(question, topic) {
  historyItems = [
    {
      id: createId(),
      question,
      topic,
      createdAt: new Date().toISOString(),
    },
    ...historyItems.filter((item) => item.question !== question),
  ].slice(0, 30);

  saveHistory();
  renderHistory();
}

function renderHistory() {
  const query = historySearch.value.trim().toLowerCase();
  const filteredItems = historyItems.filter((item) =>
    `${item.question} ${item.topic}`.toLowerCase().includes(query),
  );

  historyList.innerHTML = "";

  if (filteredItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = query ? "No matching questions." : "No saved questions yet.";
    historyList.append(empty);
    return;
  }

  for (const item of filteredItems) {
    const button = document.createElement("button");
    button.className = "history-item";
    button.type = "button";
    button.innerHTML = `
      <span>${escapeHtml(item.question)}</span>
      <small>${escapeHtml(item.topic)} · ${formatTime(item.createdAt)}</small>
    `;
    button.addEventListener("click", () => {
      topicMode.value = item.topic;
      questionInput.value = item.question;
      questionInput.focus();
      resizeComposer();
      closeSidebar();
    });
    historyList.append(button);
  }
}

function updateStats() {
  const userMessages = chatMessages.filter((message) => message.role === "user");
  const topics = new Set(userMessages.map((message) => message.topic));
  const latestTopic = userMessages.at(-1)?.topic ?? topicMode.value;

  questionCount.textContent = String(userMessages.length);
  topicCount.textContent = String(topics.size);
  streakCount.textContent = String(userMessages.length);
  lastTopic.textContent = latestTopic;
}

function setLoading(isLoading) {
  sendButton.disabled = isLoading;
  sendButton.querySelector(".send-label").textContent = isLoading ? "Wait" : "Send";
}

function resizeComposer() {
  questionInput.style.height = "auto";
  questionInput.style.height = `${questionInput.scrollHeight}px`;
}

function saveMessages() {
  localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(chatMessages));
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(historyItems));
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatErrorMessage(error) {
  const message = error.message ?? String(error);

  if (message.includes("Missing Gemini API key") || message.includes("No API key")) {
    return `## Gemini API key required

Every answer comes **live from Gemini AI** — nothing is pre-saved locally.

**To fix this:**
1. Get a free key at [Google AI Studio](https://aistudio.google.com/apikey)
2. Paste it in the **Gemini API key** field in the sidebar, then click **Save**
3. Or add \`GEMINI_API_KEY=your_key\` to your \`.env\` file and restart the server

Then ask your question again for a fresh AI-generated answer.`;
  }

  if (message.includes("429")) {
    return `## Rate limited

Gemini is temporarily rate-limited. Wait about a minute and try again — your next answer will be freshly generated.`;
  }

  return `## Could not reach Gemini

${message}

**Tips:**
- Check your API key is valid
- Restart the server: \`npm run web\`
- Make sure you have internet access

No offline/cached answers are used — fix the connection to get a live response.`;
}
