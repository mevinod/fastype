const WORD_BANK = [
  "quick", "brown", "fox", "jumps", "over", "lazy", "dog", "code", "debug", "server",
  "client", "socket", "thread", "memory", "database", "query", "index", "async", "await", "object",
  "array", "string", "number", "boolean", "function", "module", "router", "cookie", "session", "deploy",
  "cloud", "cache", "binary", "commit", "branch", "merge", "rebase", "random", "vector", "matrix",
  "signal", "packet", "render", "layout", "button", "input", "output", "status", "error", "result",
  "python", "java", "golang", "typescript", "react", "native", "linux", "kernel", "terminal", "window",
  "format", "design", "system", "secure", "access", "token", "public", "private", "method", "class",
  "static", "dynamic", "engine", "script", "typing", "speed", "accuracy", "score", "leaderboard", "daily",
  "timer", "focus", "practice", "repeat", "handle", "insert", "update", "delete", "select", "filter"
];

const wordBox = document.getElementById("wordBox");
const typingInput = document.getElementById("typingInput");
const timeEl = document.getElementById("time");
const wpmEl = document.getElementById("wpm");
const accuracyEl = document.getElementById("accuracy");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const leaderboardBody = document.getElementById("leaderboardBody");
const playerNameEl = document.getElementById("playerName");
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const nameError = document.getElementById("nameError");

let words = [];
let currentWordIndex = 0;
let totalTypedWords = 0;
let correctWords = 0;
let timeLeft = 60;
let timer = null;
let running = false;

function pickWords(count = 60) {
  return Array.from({ length: count }, () => WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]);
}

function renderWords() {
  wordBox.innerHTML = words
    .map((word, index) => {
      const chars = word
        .split("")
        .map((char, charIndex) => `<span class="char" data-char-index="${charIndex}">${char}</span>`)
        .join("");
      return `<span class="word ${index === currentWordIndex ? "active" : ""}" data-index="${index}">${chars}</span>`;
    })
    .join("");
}

function updateStats() {
  const elapsed = 60 - timeLeft || 1;
  const wpm = Math.round((correctWords / elapsed) * 60);
  const accuracy = totalTypedWords ? (correctWords / totalTypedWords) * 100 : 100;
  wpmEl.textContent = String(Number.isFinite(wpm) ? wpm : 0);
  accuracyEl.textContent = accuracy.toFixed(1);
}

function clearWordState(wordEl) {
  if (!wordEl) return;
  wordEl.classList.remove("overflow-error");
  const chars = wordEl.querySelectorAll(".char");
  chars.forEach((charEl) => {
    charEl.classList.remove("correct-char", "wrong-char", "current-char");
  });
}

function moveToNextWord() {
  const activeWord = wordBox.querySelector(`[data-index="${currentWordIndex}"]`);
  if (!activeWord) return;
  clearWordState(activeWord);
  activeWord.classList.remove("active");
  currentWordIndex += 1;
  const nextWord = wordBox.querySelector(`[data-index="${currentWordIndex}"]`);
  if (nextWord) {
    nextWord.classList.add("active");
    nextWord.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function updateActiveWordPreview() {
  const activeWord = wordBox.querySelector(`[data-index="${currentWordIndex}"]`);
  if (!activeWord) return;
  activeWord.scrollIntoView({ block: "nearest", inline: "nearest" });

  const typed = typingInput.value;
  const expected = words[currentWordIndex] || "";
  const charEls = activeWord.querySelectorAll(".char");

  charEls.forEach((charEl, index) => {
    charEl.classList.remove("correct-char", "wrong-char", "current-char");
    if (index < typed.length) {
      if (typed[index] === expected[index]) {
        charEl.classList.add("correct-char");
      } else {
        charEl.classList.add("wrong-char");
      }
      return;
    }

    if (index === typed.length) {
      charEl.classList.add("current-char");
    }
  });

  if (typed.length > expected.length) {
    activeWord.classList.add("overflow-error");
  } else {
    activeWord.classList.remove("overflow-error");
  }
}

async function submitResult() {
  const wpm = Number(wpmEl.textContent) || 0;
  const accuracy = Number(accuracyEl.textContent) || 0;

  const response = await fetch("api/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wpm, accuracy })
  });

  if (response.status === 401) {
    await ensureSession();
  }
}

function stopTest() {
  running = false;
  clearInterval(timer);
  typingInput.disabled = true;
  submitResult().then(loadLeaderboard).catch(() => {});
}

function startTest() {
  if (running) return;
  running = true;
  typingInput.disabled = false;
  typingInput.value = "";
  typingInput.focus();
  timer = setInterval(() => {
    timeLeft -= 1;
    timeEl.textContent = String(timeLeft);
    updateStats();
    if (timeLeft <= 0) {
      stopTest();
    }
  }, 1000);
}

function resetTest() {
  clearInterval(timer);
  words = pickWords(75);
  currentWordIndex = 0;
  totalTypedWords = 0;
  correctWords = 0;
  timeLeft = 60;
  running = false;
  timeEl.textContent = "60";
  wpmEl.textContent = "0";
  accuracyEl.textContent = "100";
  typingInput.value = "";
  typingInput.disabled = true;
  renderWords();
  updateActiveWordPreview();
}

typingInput.addEventListener("keydown", (event) => {
  if (!running) return;
  if (event.key !== " ") return;
  event.preventDefault();

  const typed = typingInput.value.trim();
  if (!typed) return;

  const expected = words[currentWordIndex];
  totalTypedWords += 1;
  if (typed === expected) {
    correctWords += 1;
  }
  moveToNextWord();
  typingInput.value = "";
  updateStats();
  updateActiveWordPreview();
});

typingInput.addEventListener("input", () => {
  if (!running) return;
  updateActiveWordPreview();
});

startBtn.addEventListener("click", startTest);
restartBtn.addEventListener("click", resetTest);

document.addEventListener("keydown", (event) => {
  if (event.key !== " ") return;
  if (running) return;
  if (!typingInput.disabled) return;
  if (!nameModal.classList.contains("hidden")) return;
  if (document.activeElement === nameInput) return;
  event.preventDefault();
  startTest();
});

async function loadLeaderboard() {
  const response = await fetch("api/leaderboard");
  const data = await response.json();
  const board = data.leaderboard || [];

  if (!board.length) {
    leaderboardBody.innerHTML = `<tr><td colspan="4">No scores yet.</td></tr>`;
    return;
  }

  leaderboardBody.innerHTML = board
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.name}</td>
        <td>${item.wpm}</td>
        <td>${item.accuracy}%</td>
      </tr>
    `
    )
    .join("");
}

async function ensureSession() {
  const sessionResponse = await fetch("api/session");
  const session = await sessionResponse.json();
  if (session.active) {
    playerNameEl.textContent = session.name;
    nameModal.classList.add("hidden");
    return;
  }

  nameModal.classList.remove("hidden");
  playerNameEl.textContent = "Not set";
}

saveNameBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name) {
    nameError.textContent = "Name is required.";
    return;
  }

  const response = await fetch("api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  const data = await response.json();
  if (!response.ok) {
    nameError.textContent = data.error || "Could not save name.";
    return;
  }

  nameError.textContent = "";
  playerNameEl.textContent = data.name;
  nameModal.classList.add("hidden");
});

resetTest();
ensureSession().then(loadLeaderboard).catch(() => {
  leaderboardBody.innerHTML = `<tr><td colspan="4">Could not load leaderboard.</td></tr>`;
});
