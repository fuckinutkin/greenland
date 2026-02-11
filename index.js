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
// linkId -> { id, ownerId, amount, network, durationSeconds, currency, createdAt, opens }
const links = new Map();
// ownerId -> [linkId...]
const linksByUser = new Map();

// ${linkId}:main -> { linkId, ownerId, messages: [{from, text, ts}] }
const threads = new Map();

function makeId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function nowTs() {
  return Date.now();
}

function extractLinkIdFromText(text) {
  const raw = String(text || "");
  const byLabel = raw.match(/Link ID:\s*(\d{6})\b/i);
  if (byLabel) return byLabel[1];

  const byUrl = raw.match(/\/check\?id=(\d{6})\b/i);
  if (byUrl) return byUrl[1];

  return null;
}

function formatDuration(seconds) {
  if (seconds == null) return "No timer";
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

function formatNetwork(network) {
  const allowed = {
    trc20: "TRC20",
    erc20: "ERC20",
    sol: "SOL",
    bep20: "BEP20",
  };
  return allowed[network] || String(network || "-").toUpperCase();
}

function formatCurrency(currency) {
  if (!currency) return null;
  return String(currency).toUpperCase();
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
    `👀 OPENED\nLink ID: ${record.id}\nOwner: ${record.ownerId}\nAmount: ${record.amount}\nNetwork: ${formatNetwork(record.network)}\nDuration: ${formatDuration(record.durationSeconds)}${record.durationSeconds != null ? `\nExpiresAt: ${new Date(record.createdAt + record.durationSeconds * 1000).toISOString()}` : ""}${record.currency ? `\nCurrency: ${formatCurrency(record.currency)}` : ""}\nOpens: ${record.opens}`
  );

  // DM owner (Telegram rule: owner must have /start'ed the bot once)
  try {
    await bot.telegram.sendMessage(
      record.ownerId,
      `👀 Someone opened your link!\nLink ID: ${record.id}\nAmount: ${record.amount}\nNetwork: ${formatNetwork(record.network)}\nDuration: ${formatDuration(record.durationSeconds)}${record.currency ? `\nCurrency: ${formatCurrency(record.currency)}` : ""}\nTotal opens: ${record.opens}`
    );
  } catch (e) {
    console.log("DM OWNER ERROR:", e?.message || e);
  }

  // Minimal page + minimal support chat (replace later with Figma)
  return res.sendFile("check.html", { root: "public" });

});

// Visitor sends message to support -> forwarded to owner in Telegram
app.post("/api/support/send", async (req, res) => {
  const { linkId, text } = req.body || {};
  const record = links.get(String(linkId || ""));

  if (!record) return res.status(404).json({ ok: false, error: "link_not_found" });
  if (!text) return res.status(400).json({ ok: false, error: "missing_fields" });

  const cleanText = String(text).slice(0, 500);

  const key = `${record.id}:main`;
  if (!threads.has(key)) {
    threads.set(key, { linkId: record.id, ownerId: record.ownerId, messages: [] });
  }
  const t = threads.get(key);
  t.messages.push({ from: "visitor", text: cleanText, ts: nowTs() });

  // Forward to owner as a message they can reply to
  // We embed identifiers in the message so we can route replies.
  const header = `🆘 SUPPORT\nLink ID: ${record.id}\n---\n`;
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
  const key = `${linkId}:main`;

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
  network: record.network || null,
  durationSeconds: record.durationSeconds,
  currency: record.currency || null,
  opens: record.opens || 0,
  createdAt: record.createdAt,
  expiresAt: record.durationSeconds != null ? (record.createdAt + record.durationSeconds * 1000) : null,
});

});

// -------------------------
// Bot
// -------------------------
const createState = new Map(); // userId -> { step, amount, network, durationSeconds, currency }

function isValidAmount(text) {
  return /^(\d+)(\.\d+)?$/.test(text) && Number(text) > 0;
}

bot.start(async (ctx) => {
  createState.delete(ctx.from.id);
  await showMainMenu(ctx, "Welcome 👋 Choose an option:");
});


bot.on("text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;

  if (text.startsWith("/")) return next();

  const repliedText = ctx.message?.reply_to_message?.text || "";

  // Owner -> website support message routing (single thread per link: ${linkId}:main)
  if (repliedText) {
    const linkId = extractLinkIdFromText(repliedText);
    if (linkId) {
      const record = links.get(linkId);
      if (record && Number(record.ownerId) === Number(ctx.from.id)) {
        const key = `${linkId}:main`;
        if (!threads.has(key)) {
          threads.set(key, { linkId, ownerId: record.ownerId, messages: [] });
        }

        const t = threads.get(key);
        t.messages.push({ from: "owner", text: String(text).slice(0, 500), ts: nowTs() });

        await ctx.reply("✅ Sent to website chat");
        return;
      }
    }
  }

  const state = createState.get(userId);

  // 🚫 User is NOT in "create link" flow
  if (!state) {
    return showMainMenu(ctx, "Tap ✅ Create link to start.");
  }

  if (state.step !== "amount") {
    return ctx.reply("Use the buttons below to continue.");
  }

  // ❌ Invalid amount
  if (!isValidAmount(text)) {
    return ctx.reply("❌ Invalid number. Send like: 10 or 10.5");
  }

  // ✅ Save amount
  state.amount = text;
  state.step = "network";
  createState.set(userId, state);

  return ctx.reply(
    "Choose network:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("TRC20", "NET:trc20"),
        Markup.button.callback("ERC20", "NET:erc20"),
      ],
      [
        Markup.button.callback("SOL", "NET:sol"),
        Markup.button.callback("BEP20", "NET:bep20"),
      ],
      [Markup.button.callback("❌ Cancel", "CANCEL_CREATE")],
    ])
  );
});

bot.action("CREATE_LINK", async (ctx) => {
  await ctx.answerCbQuery();

  createState.set(ctx.from.id, { step: "amount", amount: null, network: null, durationSeconds: null, currency: null });

  await ctx.reply(
    "Send amount (number). Example: 12.5",
    Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "CANCEL_CREATE")]])
  );
});

bot.action("CANCEL_CREATE", async (ctx) => {
  await ctx.answerCbQuery();

  createState.delete(ctx.from.id);

  await showMainMenu(ctx, "Cancelled ✅ Back to menu:");
});


bot.action(/^NET:(trc20|erc20|sol|bep20)$/, async (ctx) => {
  const state = createState.get(ctx.from.id);
  if (!state || state.step !== "network") {
    await ctx.answerCbQuery();
    return ctx.reply("Start again from Create link.");
  }

  state.network = ctx.match[1];
  state.step = "timer";
  createState.set(ctx.from.id, state);

  await ctx.answerCbQuery();
  return ctx.reply(
    "Choose timer:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("15:00", "DUR:900"),
        Markup.button.callback("30:00", "DUR:1800"),
        Markup.button.callback("60:00", "DUR:3600"),
      ],
      [Markup.button.callback("No timer", "DUR:none")],
      [Markup.button.callback("❌ Cancel", "CANCEL_CREATE")],
    ])
  );
});

async function finalizeLinkCreation(ctx, state) {
  const ownerId = ctx.from.id;
  const id = makeId(10);

  const createdAt = nowTs();
  links.set(id, {
    id,
    ownerId,
    amount: state.amount,
    network: state.network,
    durationSeconds: state.durationSeconds,
    currency: state.currency,
    createdAt,
    opens: 0,
  });

  const threadKey = `${id}:main`;
  if (!threads.has(threadKey)) {
    threads.set(threadKey, { linkId: id, ownerId, messages: [] });
  }

  if (!linksByUser.has(ownerId)) linksByUser.set(ownerId, []);
  linksByUser.get(ownerId).unshift(id);

  const url = new URL(`${BASE_URL}/check`);
  url.searchParams.set("id", id);
  const link = url.toString();

  await ctx.reply(`Here’s your link:\n${link}`, { disable_web_page_preview: true });
  await showMainMenu(ctx, "Back to menu 👇");

  await sendLog(
    process.env.CREATE_LOG_CHAT_ID,
    `🆕 CREATED\nUser: ${fmtUser(ctx)}\nLink ID: ${id}\nAmount: ${state.amount}\nNetwork: ${formatNetwork(state.network)}\nDuration: ${formatDuration(state.durationSeconds)}${state.currency ? `\nCurrency: ${formatCurrency(state.currency)}` : ""}\nLink: ${link}`
  );

  createState.delete(ownerId);
}

bot.action(/^DUR:(900|1800|3600|none)$/, async (ctx) => {
  const state = createState.get(ctx.from.id);
  if (!state || state.step !== "timer" || !state.amount || !state.network) {
    await ctx.answerCbQuery();
    return ctx.reply("Data not found. Start again from Create link.");
  }

  if (ctx.match[1] === "none") {
    state.durationSeconds = null;
    state.step = "currency";
    createState.set(ctx.from.id, state);
    await ctx.answerCbQuery();
    return ctx.reply(
      "Choose currency:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("USDT", "CUR:usdt"),
          Markup.button.callback("USDC", "CUR:usdc"),
        ],
        [Markup.button.callback("❌ Cancel", "CANCEL_CREATE")],
      ])
    );
  }

  state.durationSeconds = Number(ctx.match[1]);
  state.currency = null;
  createState.set(ctx.from.id, state);
  await ctx.answerCbQuery("Done ✅");
  await finalizeLinkCreation(ctx, state);
});

bot.action(/^CUR:(usdt|usdc)$/, async (ctx) => {
  const state = createState.get(ctx.from.id);
  if (!state || state.step !== "currency" || !state.amount || !state.network) {
    await ctx.answerCbQuery();
    return ctx.reply("Data not found. Start again from Create link.");
  }

  state.currency = ctx.match[1];
  state.step = "done";
  createState.set(ctx.from.id, state);

  await ctx.answerCbQuery("Done ✅");
  await finalizeLinkCreation(ctx, state);
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
    const extra = r.durationSeconds == null
      ? `currency: ${formatCurrency(r.currency)} (${formatNetwork(r.network)})`
      : `duration: ${formatDuration(r.durationSeconds)}`;
    return `${i + 1}) Link ID: ${id}\n${r.amount} | ${extra} | opens: ${r.opens}\n${u.toString()}`;
  });

  await ctx.reply(`👤 My links (last ${Math.min(20, ids.length)}):\n\n${lines.join("\n\n")}`, {
    disable_web_page_preview: true,
  });
});

bot.command("cancel", async (ctx) => {
  createState.delete(ctx.from.id);
  return ctx.reply("✅ Cancelled current flow.");
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
