const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const isLocalServer = location.protocol === "http:" || location.protocol === "https:";
const STORAGE_KEYS = {
  apiKey: "geminiApiKey",
  messages: "dsaInstructorMessages",
  history: "dsaInstructorHistory",
};

const systemInstruction = `You are a friendly Data Structures and Algorithms instructor.
Only answer questions related to Data Structures, Algorithms, programming problem solving, complexity analysis, and coding interview preparation.
If the user asks something unrelated, politely redirect them to ask a DSA question.
Explain concepts simply, use examples, include time and space complexity when useful, and prefer JavaScript code unless the user asks for another language.`;

const apiKeyInput = document.querySelector("#apiKey");
const saveKeyButton = document.querySelector("#saveKey");
const connectionState = document.querySelector("#connectionState");
const messages = document.querySelector("#messages");
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
const questionCount = document.querySelector("#questionCount");
const topicCount = document.querySelector("#topicCount");
const lastTopic = document.querySelector("#lastTopic");

let chatMessages = loadJson(STORAGE_KEYS.messages, []);
let historyItems = loadJson(STORAGE_KEYS.history, []);

apiKeyInput.value = localStorage.getItem(STORAGE_KEYS.apiKey) ?? "";
connectionState.textContent = isLocalServer ? "Server mode" : "File mode";

renderMessages();
renderHistory();
updateStats();

saveKeyButton.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
  saveKeyButton.textContent = "Saved";
  setTimeout(() => {
    saveKeyButton.textContent = "Save";
  }, 1200);
});

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
  link.download = "dsa-instructor-chat.txt";
  link.click();
  URL.revokeObjectURL(url);
});

clearHistoryButton.addEventListener("click", () => {
  historyItems = [];
  saveHistory();
  renderHistory();
  updateStats();
});

historySearch.addEventListener("input", renderHistory);

quickPrompts.forEach((button) => {
  button.addEventListener("click", () => {
    topicMode.value = button.dataset.topic ?? "General DSA";
    questionInput.value = button.dataset.prompt;
    questionInput.focus();
    resizeComposer();
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

  const thinkingMessage = pushMessage("assistant", "Thinking through the DSA steps...", topic, false);

  try {
    const answer = await getAnswer(question, apiKey, topic);
    updateMessage(thinkingMessage.id, answer);
  } catch (error) {
    updateMessage(thinkingMessage.id, getFallbackAnswer(question, error));
  } finally {
    setLoading(false);
  }
});

async function getAnswer(question, apiKey, topic) {
  const focusedQuestion = `[Topic focus: ${topic}]\n${question}`;

  if (!apiKey && !isLocalServer) {
    return getFallbackAnswer(question, new Error("No API key provided."));
  }

  if (isLocalServer) {
    return askServer(focusedQuestion);
  }

  return askGemini(focusedQuestion, apiKey);
}

async function askGemini(question, apiKey) {
  const response = await fetch(API_URL, {
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
          parts: [{ text: question }],
        },
      ],
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

async function askServer(question) {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error ?? "Server request failed.");
  }

  return result.answer;
}

function pushMessage(role, text, topic = topicMode.value, save = true) {
  const message = {
    id: createId(),
    role,
    text,
    topic,
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
    saveMessages();
    renderMessages();
    updateStats();
  }
}

function renderMessages() {
  messages.innerHTML = "";

  if (chatMessages.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = `
      <h3>Build your DSA streak</h3>
      <p>Ask about arrays, recursion, sorting, trees, graphs, complexity, or choose a quick practice topic.</p>
    `;
    messages.append(emptyState);
    return;
  }

  for (const message of chatMessages) {
    const article = document.createElement("article");
    article.className = `message ${message.role}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = message.role === "user" ? "YOU" : "AI";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = message.text;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = `${message.topic} - ${formatTime(message.createdAt)}`;
    bubble.append(meta);

    article.append(avatar, bubble);
    messages.append(article);
  }

  messages.scrollTop = messages.scrollHeight;
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
    empty.textContent = "No saved questions yet.";
    historyList.append(empty);
    return;
  }

  for (const item of filteredItems) {
    const button = document.createElement("button");
    button.className = "history-item";
    button.type = "button";
    button.innerHTML = `
      <span>${escapeHtml(item.question)}</span>
      <small>${escapeHtml(item.topic)} - ${formatTime(item.createdAt)}</small>
    `;
    button.addEventListener("click", () => {
      topicMode.value = item.topic;
      questionInput.value = item.question;
      questionInput.focus();
      resizeComposer();
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
  lastTopic.textContent = latestTopic;
}

function setLoading(isLoading) {
  sendButton.disabled = isLoading;
  sendButton.textContent = isLoading ? "Wait" : "Send";
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

function getFallbackAnswer(question, error) {
  const message = error.message ?? String(error);
  const normalizedQuestion = question.toLowerCase();

  if (!isDsaQuestion(normalizedQuestion)) {
    return "Please ask me a Data Structures or Algorithms question. For example: arrays, linked lists, recursion, sorting, searching, trees, graphs, stacks, queues, hashing, or dynamic programming.";
  }

  const apiNote = message.includes("429")
    ? "Gemini is rate-limited right now, so here is a local DSA explanation:\n\n"
    : "Gemini could not answer right now, so here is a local DSA explanation:\n\n";

  return `${apiNote}${localDsaAnswer(normalizedQuestion)}`;
}

function isDsaQuestion(question) {
  const keywords = [
    "array",
    "linked list",
    "stack",
    "queue",
    "tree",
    "graph",
    "hash",
    "map",
    "set",
    "heap",
    "trie",
    "sort",
    "search",
    "binary",
    "recursion",
    "dynamic programming",
    "dp",
    "algorithm",
    "complexity",
    "big o",
    "time",
    "space",
    "leetcode",
    "problem",
  ];

  return keywords.some((keyword) => question.includes(keyword));
}

function localDsaAnswer(question) {
  if (question.includes("dynamic programming") || question.includes(" dp")) {
    return `Dynamic Programming means solving a big problem by reusing answers to smaller overlapping subproblems.

Example: Fibonacci
fib(0) = 0
fib(1) = 1
fib(n) = fib(n - 1) + fib(n - 2)

JavaScript:
function fib(n) {
  const dp = Array(n + 1).fill(0);
  dp[1] = 1;

  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }

  return dp[n];
}

Time Complexity: O(n)
Space Complexity: O(n)

Main idea: store previous answers so you do not calculate the same thing again.`;
  }

  if (question.includes("recursion")) {
    return `Recursion means a function calls itself to solve a smaller version of the same problem.

Example: factorial
function factorial(n) {
  if (n === 0) return 1;
  return n * factorial(n - 1);
}

Dry run:
factorial(4)
= 4 * factorial(3)
= 4 * 3 * factorial(2)
= 4 * 3 * 2 * factorial(1)
= 4 * 3 * 2 * 1 * factorial(0)
= 24

Time Complexity: O(n)
Space Complexity: O(n), because of the call stack.`;
  }

  if (question.includes("binary search")) {
    return `Binary Search is used on a sorted array. It repeatedly checks the middle element and removes half of the search space.

JavaScript:
function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }

  return -1;
}

Time Complexity: O(log n)
Space Complexity: O(1)`;
  }

  if (question.includes("array")) {
    return `An array is a linear data structure that stores elements in order.

Example:
const numbers = [10, 20, 30];

console.log(numbers[0]); // 10
console.log(numbers[2]); // 30

Common operations:
Access by index: O(1)
Search: O(n)
Insert at end: O(1) average
Insert at start: O(n)
Delete from start: O(n)

Arrays are best when you need fast index access.`;
  }

  if (question.includes("linked list")) {
    return `A linked list stores data in nodes. Each node points to the next node.

Node shape:
class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

Advantages:
Insert/delete at the head is O(1)
Size can grow dynamically

Disadvantages:
Access by index is O(n)
Extra memory is needed for pointers`;
  }

  return `This is a DSA topic. A good way to solve it is:

1. Understand the input and output.
2. Choose the right data structure.
3. Write a brute force solution first.
4. Improve time complexity.
5. Analyze time and space complexity.

Ask the question with a specific topic, like "explain stacks" or "solve binary search", and I can give a clearer step-by-step answer.`;
}
