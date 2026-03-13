import "dotenv/config";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";

const punkHoivaajaToken = process.env.PUNK_HOIVAAJA_TG_TOKEN;
const midSkeneAijaToken = process.env.MID_SKENE_AIJA_TG_TOKEN;
const groupChatId = process.env.GROUP_CHAT_ID;
const startHour = parseInt(process.env.MORNING_START_HOUR ?? "7", 10);
const endHour = parseInt(process.env.MORNING_END_HOUR ?? "9", 10);

if (!punkHoivaajaToken || !midSkeneAijaToken) {
  console.error("Missing PUNK_HOIVAAJA_TG_TOKEN or MID_SKENE_AIJA_TG_TOKEN in .env");
  process.exit(1);
}

function generateMessage(conversationHistory) {
  return "huomenta";
}

function toTitleCase(str) {
  return str.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

const botSkeneAija = new Telegraf(midSkeneAijaToken);
const bot = new Telegraf(punkHoivaajaToken);

let pendingReply = null;

function scheduleNextDaily() {
  if (!groupChatId) return;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hour = startHour + Math.random() * (endHour - startHour);
  const minute = Math.random() * 60;
  let next = new Date(today.getTime() + hour * 3600000 + minute * 60000);
  if (next <= now) {
    next = new Date(next.getTime() + 86400000);
  }
  const delay = next - now;
  setTimeout(async () => {
    const text = generateMessage([]);
    await bot.telegram.sendMessage(groupChatId, text);
    if (pendingReply?.timeoutId) clearTimeout(pendingReply.timeoutId);
    pendingReply = {
      timeoutId: setTimeout(async () => {
        await bot.telegram.sendMessage(groupChatId, "ei vastausta");
        pendingReply = null;
      }, 5 * 60 * 1000),
    };
    scheduleNextDaily();
  }, delay);
}

bot.on(message("new_chat_members"), (ctx) => {
  const me = ctx.botInfo.id;
  const added = ctx.message.new_chat_members?.find((m) => m.id === me);
  if (added) {
    console.log("Bot has been added to a group. Group id:", ctx.chat.id);
  }
});

bot.on("message", async (ctx) => {
  if (!groupChatId || String(ctx.chat.id) !== String(groupChatId)) return;
  if (pendingReply) {
    clearTimeout(pendingReply.timeoutId);
    pendingReply = null;
    await ctx.sendChatAction("typing");
    await new Promise((r) => setTimeout(r, 10000));
    await ctx.reply("ok");
    return;
  }
  if (!ctx.message.from?.is_bot && ctx.message.text) {
    await ctx.sendChatAction("typing");
    await new Promise((r) => setTimeout(r, 10000));
    await ctx.reply(toTitleCase(ctx.message.text));
  }
});

bot.on("my_chat_member", (ctx) => {
  const status = ctx.myChatMember?.new_chat_member?.status;
  if (status === "member" || status === "administrator") {
    console.log("Bot has been added to a group. Group id:", ctx.chat.id);
  }
});

botSkeneAija.on("message", async (ctx) => {
  if (!groupChatId || String(ctx.chat.id) !== String(groupChatId)) return;
  if (!ctx.message.from?.is_bot && ctx.message.text) {
    await ctx.reply(ctx.message.text.toLowerCase());
  }
});

if (groupChatId) scheduleNextDaily();
console.log("Bot started. Listening for updates.");
if (!groupChatId) {
  console.log("Add the bot to a group to see the group id, then set GROUP_CHAT_ID in .env and restart.");
}
botSkeneAija.launch({ allowedUpdates: ["message"] });
bot.launch({ allowedUpdates: ["message", "my_chat_member"] });
