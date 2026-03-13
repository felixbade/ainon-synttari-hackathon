import "dotenv/config";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { getClaudeReply } from "./claude.js";
import { midSkeneAija, punkHoivaaja } from "./prompts.js";

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

const allowedUsernames = (process.env.ALLOWED_USERNAMES ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function relayPrivateMessage(ctx, telegram) {
  if (ctx.chat.type !== "private" || !groupChatId) return false;
  const username = ctx.message.from?.username?.toLowerCase();
  if (!allowedUsernames.includes(username)) return false;
  if (ctx.message.text?.startsWith("/")) return false;
  if (ctx.message.photo) {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    await telegram.sendPhoto(groupChatId, photo.file_id, { caption: ctx.message.caption });
  } else if (ctx.message.text) {
    await telegram.sendMessage(groupChatId, ctx.message.text);
  }
  return true;
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
  if (await relayPrivateMessage(ctx, bot.telegram)) return;
  if (!groupChatId || String(ctx.chat.id) !== String(groupChatId)) return;
  if (pendingReply) {
    clearTimeout(pendingReply.timeoutId);
    pendingReply = null;
    if (!ctx.message.from?.is_bot && ctx.message.text) {
      await ctx.sendChatAction("typing");
      const reply = await getClaudeReply(ctx.message.text, punkHoivaaja).catch(() => null);
      if (reply) {
        await ctx.reply(reply);
      }
    }
    return;
  }
  if (!ctx.message.from?.is_bot && ctx.message.text) {
    await ctx.sendChatAction("typing");
    const reply = await getClaudeReply(ctx.message.text, punkHoivaaja).catch(() => null);
    if (reply) {
      await ctx.reply(reply);
    }
  }
});

bot.on("my_chat_member", (ctx) => {
  const status = ctx.myChatMember?.new_chat_member?.status;
  if (status === "member" || status === "administrator") {
    console.log("Bot has been added to a group. Group id:", ctx.chat.id);
  }
});

botSkeneAija.on("message", async (ctx) => {
  if (await relayPrivateMessage(ctx, botSkeneAija.telegram)) return;
  if (!groupChatId || String(ctx.chat.id) !== String(groupChatId)) return;
  if (!ctx.message.from?.is_bot && ctx.message.text) {
    const endAt = Date.now() + 20000;
    let typing = true;
    while (Date.now() < endAt) {
      if (typing) {
        await ctx.sendChatAction("typing");
      } else {
        await botSkeneAija.telegram.callApi("sendChatAction", {
          chat_id: ctx.chat.id,
          action: null,
        }).catch(() => {});
      }
      typing = !typing;
      const remaining = endAt - Date.now();
      if (remaining <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(remaining, 1000)));
    }
    if (typing) {
      await botSkeneAija.telegram.callApi("sendChatAction", {
        chat_id: ctx.chat.id,
        action: null,
      }).catch(() => {});
    }
  }
});

if (groupChatId) scheduleNextDaily();
console.log("Bot started. Listening for updates.");
if (!groupChatId) {
  console.log("Add the bot to a group to see the group id, then set GROUP_CHAT_ID in .env and restart.");
}
botSkeneAija.launch({ allowedUpdates: ["message"] });
bot.launch({ allowedUpdates: ["message", "my_chat_member"] });
