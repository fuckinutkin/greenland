import "dotenv/config";
import { Telegraf, Markup } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN);
const BASE_URL = process.env.BASE_URL || "https://example.com/pay";

// userId -> amount
const pendingAmount = new Map();

function isValidAmount(text) {
  return /^(\d+)(\.\d+)?$/.test(text) && Number(text) > 0;
}

function buildLink(amount, currency) {
  const url = new URL(BASE_URL);
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

  const link = buildLink(amount, currency);

  await ctx.answerCbQuery("Done ✅");
  await ctx.reply(`Here’s your link:\n${link}`);

  pendingAmount.delete(ctx.from.id);
});

bot.launch();
console.log("Bot is running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
