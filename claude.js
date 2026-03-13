const claudeApiKey = process.env.CLAUDE_API_KEY;

export async function getClaudeReply(text, systemPrompt) {
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
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    }),
  }).catch((err) => {
    console.log("[claude] fetch error", err);
    return null;
  });
  if (!response) return null;
  const status = response.status;
  console.log("[claude] status", status);
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
