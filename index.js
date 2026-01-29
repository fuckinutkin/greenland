import "dotenv/config";
import express from "express";
import { Telegraf, Markup } from "telegraf";

/**
 * REQUIRED ENV (Render):
 * BOT_TOKEN
 * BASE_URL                 https://yourdomain.com  OR https://your.onrender.com
 * CREATE_LOG_CHAT_ID       -100...
 * OPEN_LOG_CHAT_ID         -100...
 * COMMUNITY_URL            https://t.me/...
 * CHANNEL_URL              https://t.me/...
 */

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

app.use(express.json({ limit: "100kb" }));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// -------------------------
// In-memory storage (MVP)
// -------------------------
// linkId -> { id, ownerId, amount, currency, createdAt, opens }
const links = new Map();
// ownerId -> [linkId...]
const linksByUser = new Map();

// threadId -> { linkId, ownerId, messages: [{from, text, ts}] }
const threads = new Map();

function makeId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function nowTs() {
  return Date.now();
}

function safeUpper(v) {
  return String(v || "").toUpperCase();
}
function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Create link", "CREATE_LINK")],
    [Markup.button.callback("👤 My links", "MY_LINKS")],
    [
      Markup.button.url("💬 Community chat", process.env.COMMUNITY_URL || "https://t.me/"),
      Markup.button.url("📣 Greenland channel", process.env.CHANNEL_URL || "https://t.me/"),
    ],
  ]);
}

async function showMainMenu(ctx, text = "Menu:") {
  return ctx.reply(text, mainMenuKeyboard());
}

function fmtUser(ctx) {
  const u = ctx.from;
  const uname = u.username ? `@${u.username}` : `${u.first_name || "User"} (no @username)`;
  return `${uname} | id:${u.id}`;
}

async function sendLog(chatId, text) {
  if (!chatId) return;
  try {
    await bot.telegram.sendMessage(chatId, text, { disable_web_page_preview: true });
  } catch (e) {
    console.log("LOG ERROR:", e?.message || e);
  }
}

// -------------------------
// Website
// -------------------------
app.get("/", (req, res) => {
  res.send("OK ✅ Greenland bot + site running");
});

/**
 * Link page.
 * Later you can replace HTML/CSS with your Figma design.
 * IMPORTANT: keep the JS calls:
 *   POST /api/support/send
 *   GET  /api/support/poll
 */
app.get("/check", async (req, res) => {
  const id = String(req.query.id || "");
  const record = links.get(id);

  if (!record) {
    return res.status(404).send("Link not found");
  }

  record.opens = (record.opens || 0) + 1;

  // OPEN LOG
  await sendLog(
    process.env.OPEN_LOG_CHAT_ID,
    `👀 OPENED\nLink ID: ${record.id}\nOwner: ${record.ownerId}\nAmount: ${record.amount}\nCurrency: ${safeUpper(record.currency)}\nOpens: ${record.opens}`
  );

  // DM owner (Telegram rule: owner must have /start'ed the bot once)
  try {
    await bot.telegram.sendMessage(
      record.ownerId,
      `👀 Someone opened your link!\nLink ID: ${record.id}\nAmount: ${record.amount}\nCurrency: ${safeUpper(record.currency)}\nTotal opens: ${record.opens}`
    );
  } catch (e) {
    console.log("DM OWNER ERROR:", e?.message || e);
  }

  // Minimal page + minimal support chat (replace later with Figma)
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Check</title>
</head>
<body>
  <div>
    <div><b>Amount:</b> ${record.amount}</div>
    <div><b>Currency:</b> ${safeUpper(record.currency)}</div>
    <div><b>Link ID:</b> ${record.id}</div>
  </div>

  <hr/>

  <h3>Support chat</h3>
  <div id="chat" style="border:1px solid #ddd; padding:10px; height:220px; overflow:auto; font-family: Arial, sans-serif; white-space:pre-wrap;"></div>

  <div style="margin-top:10px;">
    <input id="msg" placeholder="Write to support..." style="width:70%; padding:8px;"/>
    <button id="send" style="padding:8px 12px;">Send</button>
  </div>

  <script>
    // visitor thread id stored in browser
    const LINK_ID = ${JSON.stringify(record.id)};
    let threadId = localStorage.getItem("greenland_thread_" + LINK_ID);
    if (!threadId) {
      threadId = Math.random().toString(36).slice(2, 12);
      localStorage.setItem("greenland_thread_" + LINK_ID, threadId);
    }

    const chat = document.getElementById("chat");
    const msg = document.getElementById("msg");
    const sendBtn = document.getElementById("send");

    function render(messages) {
      chat.textContent = messages.map(m => {
        const who = m.from === "visitor" ? "You" : "Support";
        return "[" + new Date(m.ts).toLocaleTimeString() + "] " + who + ": " + m.text;
      }).join("\\n");
      chat.scrollTop = chat.scrollHeight;
    }

    async function poll() {
      try {
        const r = await fetch("/api/support/poll?linkId=" + encodeURIComponent(LINK_ID) + "&threadId=" + encodeURIComponent(threadId));
        const data = await r.json();
        if (data && data.ok) render(data.messages || []);
      } catch (e) {}
      setTimeout(poll, 1500);
    }

    async function send() {
      const text = msg.value.trim();
      if (!text) return;

      msg.value = "";
      try {
        await fetch("/api/support/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ linkId: LINK_ID, threadId, text })
        });
      } catch (e) {}
    }

    sendBtn.onclick = send;
    msg.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

    poll();
  </script>
</body>
</html>
  `);
});

// Visitor sends message to support -> forwarded to owner in Telegram
app.post("/api/support/send", async (req, res) => {
  const { linkId, threadId, text } = req.body || {};
  const record = links.get(String(linkId || ""));

  if (!record) return res.status(404).json({ ok: false, error: "link_not_found" });
  if (!threadId || !text) return res.status(400).json({ ok: false, error: "missing_fields" });

  const tid = String(threadId);
  const cleanText = String(text).slice(0, 500);

  const key = `${record.id}:${tid}`;
  if (!threads.has(key)) {
    threads.set(key, { linkId: record.id, ownerId: record.ownerId, messages: [] });
  }
  const t = threads.get(key);
  t.messages.push({ from: "visitor", text: cleanText, ts: nowTs() });

  // Forward to owner as a message they can reply to
  // We embed identifiers in the message so we can route replies.
  const header = `🆘 SUPPORT\nLink ID: ${record.id}\nThread: ${tid}\n---\n`;
  try {
    await bot.telegram.sendMessage(record.ownerId, header + cleanText);
  } catch (e) {
    console.log("SUPPORT FORWARD ERROR:", e?.message || e);
  }

  res.json({ ok: true });
});

// Website polls for messages (visitor gets owner's replies)
app.get("/api/support/poll", (req, res) => {
  const linkId = String(req.query.linkId || "");
  const threadId = String(req.query.threadId || "");
  const key = `${linkId}:${threadId}`;

  const t = threads.get(key);
  res.json({ ok: true, messages: t?.messages || [] });
});

// -------------------------
// Bot
// -------------------------
const pendingAmount = new Map();
const createMode = new Map(); // userId -> true when user is creating a link

function isValidAmount(text) {
  return /^(\d+)(\.\d+)?$/.test(text) && Number(text) > 0;
}

bot.start(async (ctx) => {
  createMode.delete(ctx.from.id);
  pendingAmount.delete(ctx.from.id);
  await showMainMenu(ctx, "Welcome 👋 Choose an option:");
});


bot.on("text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return;
// ✅ If this message is a reply to a SUPPORT message, ignore amount flow.
// The support handler will process it.
const repliedText = ctx.message?.reply_to_message?.text || "";
if (repliedText.includes("Link ID:") && repliedText.includes("Thread:")) {
  return next(); // ✅ let the SUPPORT reply handler run
}


  // 🚫 User is NOT in "create link" flow
  if (!createMode.get(ctx.from.id)) {
    return showMainMenu(ctx, "Tap ✅ Create link to start.");
  }

  // ❌ Invalid amount
  if (!isValidAmount(text)) {
    return ctx.reply("❌ Invalid number. Send like: 10 or 10.5");
  }

  // ✅ Save amount
  pendingAmount.set(ctx.from.id, text);

  // ➡️ Show ONLY currency buttons + cancel
  return ctx.reply(
    "Choose currency:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("USDT", "CUR:usdt"),
        Markup.button.callback("USDC", "CUR:usdc"),
        Markup.button.callback("SOL", "CUR:sol"),
      ],
      [Markup.button.callback("❌ Cancel", "CANCEL_CREATE")],
    ])
  );
});

bot.action("CREATE_LINK", async (ctx) => {
  await ctx.answerCbQuery();

  createMode.set(ctx.from.id, true);
  pendingAmount.delete(ctx.from.id);

  await ctx.reply(
    "Send amount (number). Example: 12.5",
    Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "CANCEL_CREATE")]])
  );
});

bot.action("CANCEL_CREATE", async (ctx) => {
  await ctx.answerCbQuery();

  createMode.delete(ctx.from.id);
  pendingAmount.delete(ctx.from.id);

  await showMainMenu(ctx, "Cancelled ✅ Back to menu:");
});


bot.action(/^CUR:(usdt|usdc|sol)$/, async (ctx) => {
  const currency = ctx.match[1];
  const amount = pendingAmount.get(ctx.from.id);

  if (!amount) {
    await ctx.answerCbQuery();
    return ctx.reply("Amount not found. Send the amount again.");
  }

  const ownerId = ctx.from.id;
  const id = makeId(10);

  links.set(id, {
    id,
    ownerId,
    amount,
    currency,
    createdAt: nowTs(),
    opens: 0,
  });

  if (!linksByUser.has(ownerId)) linksByUser.set(ownerId, []);
  linksByUser.get(ownerId).unshift(id);

  const url = new URL(`${BASE_URL}/check`);
  url.searchParams.set("id", id);
  const link = url.toString();

  await ctx.answerCbQuery("Done ✅");
  await ctx.reply(`Here’s your link:\n${link}`, { disable_web_page_preview: true });
  await showMainMenu(ctx, "Back to menu 👇");

  await sendLog(
    process.env.CREATE_LOG_CHAT_ID,
    `🆕 CREATED\nUser: ${fmtUser(ctx)}\nLink ID: ${id}\nAmount: ${amount}\nCurrency: ${safeUpper(currency)}\nLink: ${link}`
  );

  pendingAmount.delete(ownerId);
  createMode.delete(ownerId);

});

bot.action("MY_LINKS", async (ctx) => {
  const ownerId = ctx.from.id;
  const ids = linksByUser.get(ownerId) || [];

  await ctx.answerCbQuery();

  if (ids.length === 0) {
    return ctx.reply("You have no links yet. Create one first ✅");
  }

  const lines = ids.slice(0, 20).map((id, i) => {
    const r = links.get(id);
    const u = new URL(`${BASE_URL}/check`);
    u.searchParams.set("id", id);
    return `${i + 1}) Link ID: ${id}\n${r.amount} ${safeUpper(r.currency)} | opens: ${r.opens}\n${u.toString()}`;
  });

  await ctx.reply(`👤 My links (last ${Math.min(20, ids.length)}):\n\n${lines.join("\n\n")}`, {
    disable_web_page_preview: true,
  });
});

// Owner replies in Telegram to the forwarded SUPPORT message -> goes back to website thread
bot.on("message", async (ctx) => {
  // only handle replies
  const msg = ctx.message;
  if (!msg?.reply_to_message?.text) return;
  if (!msg.text) return;

  const original = msg.reply_to_message.text;

  // We look for:
  // "Link ID: <id>" and "Thread: <thread>"
  const linkMatch = original.match(/Link ID:\s*([a-z0-9]+)/i);
  const threadMatch = original.match(/Thread:\s*([a-z0-9]+)/i);

  if (!linkMatch || !threadMatch) return;

  const linkId = linkMatch[1];
  const threadId = threadMatch[1];

  const key = `${linkId}:${threadId}`;
  const t = threads.get(key);
  if (!t) return;

  // security: only the owner can answer
  if (Number(ctx.from.id) !== Number(t.ownerId)) return;

  t.messages.push({ from: "owner", text: String(msg.text).slice(0, 500), ts: nowTs() });

  // optional: acknowledge in Telegram
  try {
    await ctx.reply("✅ Sent to website support chat");
  } catch {}
});

bot.launch();
console.log("Bot running ✅");

app.listen(PORT, () => console.log("Website running on port", PORT));
