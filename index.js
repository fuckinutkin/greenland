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
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// -------------------------
// In-memory storage (MVP)
// -------------------------
// linkId -> { id, ownerId, amount, durationSeconds, createdAt, opens }
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

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
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
    `👀 OPENED\nLink ID: ${record.id}\nOwner: ${record.ownerId}\nAmount: ${record.amount}\nDuration: ${formatDuration(record.durationSeconds)}\nExpiresAt: ${new Date(record.createdAt + record.durationSeconds * 1000).toISOString()}\nOpens: ${record.opens}`
  );

  // DM owner (Telegram rule: owner must have /start'ed the bot once)
  try {
    await bot.telegram.sendMessage(
      record.ownerId,
      `👀 Someone opened your link!\nLink ID: ${record.id}\nAmount: ${record.amount}\nDuration: ${formatDuration(record.durationSeconds)}\nTotal opens: ${record.opens}`
    );
  } catch (e) {
    console.log("DM OWNER ERROR:", e?.message || e);
  }

  // Minimal page + minimal support chat (replace later with Figma)
  return res.sendFile("check.html", { root: "public" });

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
app.get("/api/link", (req, res) => {
  const id = String(req.query.id || "");
  const record = links.get(id);

  if (!record) {
    return res.status(404).json({ ok: false, error: "link_not_found" });
  }

 return res.json({
  ok: true,
 id: record.id,
  amount: record.amount,
  durationSeconds: record.durationSeconds,
  opens: record.opens || 0,
  createdAt: record.createdAt,
  expiresAt: record.createdAt + record.durationSeconds * 1000,
});

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

  // ➡️ Show ONLY duration buttons + cancel
  return ctx.reply(
    "Choose timer:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("15:00", "DUR:900"),
        Markup.button.callback("30:00", "DUR:1800"),
        Markup.button.callback("60:00", "DUR:3600"),
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


bot.action(/^DUR:(900|1800|3600)$/, async (ctx) => {
  const durationSeconds = Number(ctx.match[1]);
  const amount = pendingAmount.get(ctx.from.id);

  if (!amount) {
    await ctx.answerCbQuery();
    return ctx.reply("Amount not found. Send the amount again.");
  }

  const ownerId = ctx.from.id;
  const id = makeId(10);

  const createdAt = nowTs();
links.set(id, {
  id,
  ownerId,
  amount,
  durationSeconds,
  createdAt,
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
    `🆕 CREATED\nUser: ${fmtUser(ctx)}\nLink ID: ${id}\nAmount: ${amount}\nDuration: ${formatDuration(durationSeconds)}\nLink: ${link}`
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
    return `${i + 1}) Link ID: ${id}\n${r.amount} | duration: ${formatDuration(r.durationSeconds)} | opens: ${r.opens}\n${u.toString()}`;
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

async function startBot() {
  try {
    await bot.launch();
    console.log("Bot running ✅");
  } catch (e) {
    console.error("Bot launch failed (continuing without Telegram polling):", e?.message || e);
  }
}

startBot();

app.listen(PORT, () => console.log("Website running on port", PORT));
