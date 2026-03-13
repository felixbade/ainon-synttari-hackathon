import "dotenv/config";
import fs from "fs";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { getClaudeReply } from "./claude.js";
import { radikaaliPeili, midSkeneAija, punkHoivaaja } from "./prompts.js";

const skenePrompt = radikaaliPeili + "\n\n" + midSkeneAija;
const punkPrompt = radikaaliPeili + "\n\n" + punkHoivaaja;

const HISTORY_FILE = "message_history.json";

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveMessage(sender, text) {
  const history = loadHistory();
  history.push({ sender, text, timestamp: new Date().toISOString() });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

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
    saveMessage("punk-hoivaaja", text);
    await bot.telegram.sendMessage(groupChatId, text);
    if (pendingReply?.timeoutId) clearTimeout(pendingReply.timeoutId);
    pendingReply = {
      timeoutId: setTimeout(async () => {
        saveMessage("punk-hoivaaja", "ei vastausta");
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
      saveMessage(ctx.message.from.username || "human", ctx.message.text);
      await ctx.sendChatAction("typing");
      const reply = await getClaudeReply(ctx.message.text, punkPrompt, { history: loadHistory().slice(-20), botName: "punk-hoivaaja" }).catch(() => null);
      if (reply) {
        saveMessage("punk-hoivaaja", reply);
        await ctx.reply(reply);
      }
    }
    return;
  }
  if (!ctx.message.from?.is_bot && ctx.message.text) {
    saveMessage(ctx.message.from.username || "human", ctx.message.text);
    await ctx.sendChatAction("typing");
    const reply = await getClaudeReply(ctx.message.text, punkPrompt, { history: loadHistory().slice(-20), botName: "punk-hoivaaja" }).catch(() => null);
    if (reply) {
      saveMessage("punk-hoivaaja", reply);
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
    saveMessage(ctx.message.from.username || "human", ctx.message.text);
    const replyPromise = getClaudeReply(ctx.message.text, skenePrompt, { history: loadHistory().slice(-20), botName: "mid-skene-aija" });
    await new Promise((r) => setTimeout(r, 5000));
    const endAt = Date.now() + 5000;
    while (Date.now() < endAt) {
      await ctx.sendChatAction("typing");
      const remaining = endAt - Date.now();
      if (remaining <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(remaining, 1000)));
    }
    const reply = await replyPromise.catch(() => null);
    if (reply) {
      saveMessage("mid-skene-aija", reply);
      await ctx.reply(reply);
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

if (groupChatId) {
  const useSkene = Math.random() < 0.5;
  const startupBot = useSkene ? botSkeneAija : bot;
  const botName = useSkene ? "mid-skene-aija" : "punk-hoivaaja";
  const prompt = useSkene ? skenePrompt : punkPrompt;
  const wisdom = await getClaudeReply("Kerro yksi viisaus.", prompt, { history: loadHistory().slice(-20), botName });
  if (wisdom) {
    saveMessage(botName, wisdom);
    startupBot.telegram.sendMessage(groupChatId, wisdom);
  }
}
