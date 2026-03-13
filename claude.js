const claudeApiKey = process.env.CLAUDE_API_KEY;

function buildMessages(history, botName, text, systemPrompt) {
  const msgs = [{ role: "user", content: systemPrompt }, { role: "assistant", content: "Ymmärretty." }];
  for (const entry of history) {
    const role = entry.sender === botName ? "assistant" : "user";
    if (msgs.length > 0 && msgs[msgs.length - 1].role === role) {
      msgs[msgs.length - 1].content += "\n" + entry.text;
    } else {
      msgs.push({ role, content: entry.text });
    }
  }
  if (msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
    msgs[msgs.length - 1].content += "\n" + text;
  } else {
    msgs.push({ role: "user", content: text });
  }
  if (msgs.length > 0 && msgs[0].role === "assistant") {
    msgs.shift();
  }
  return msgs;
}

export async function getClaudeReply(text, systemPrompt, { history = [], botName = "" } = {}) {
  if (!claudeApiKey) {
    console.log("[claude] missing api key");
    return null;
  }
  console.log("[claude] sending", { text });
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: buildMessages(history, botName, text, systemPrompt),
    }),
  }).catch((err) => {
    console.log("[claude] fetch error", err);
    return null;
  });
  if (!response) return null;
  console.log("[claude] status", response.status);
  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    console.log("[claude] not ok body", bodyText);
    return null;
  }
  const data = await response.json().catch((err) => {
    console.log("[claude] json error", err);
    return null;
  });
  if (!data) return null;
  console.log("[claude] data", data);
  const parts = Array.isArray(data.content) ? data.content : [];
  const reply = parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
  console.log("[claude] reply", reply);
  return reply || null;
}
