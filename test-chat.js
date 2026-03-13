import "dotenv/config";
import { getClaudeReply } from "./claude.js";
import { midSkeneAija, punkHoivaaja } from "./prompts.js";

const personalities = { skene: midSkeneAija, punk: punkHoivaaja };

const personality = process.argv[2];
const message = process.argv.slice(3).join(" ");

if (!personality || !message || !personalities[personality]) {
  console.error("Usage: node test-chat.js <skene|punk> <message>");
  process.exit(1);
}

const reply = await getClaudeReply(message, personalities[personality]);
if (reply) {
  console.log("\n" + reply);
} else {
  console.error("No reply received");
  process.exit(1);
}
