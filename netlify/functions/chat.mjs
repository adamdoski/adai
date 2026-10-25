const LANGUAGE_RULES = {
  en: "Always reply in English, even if the user writes in another language.",
  ar: "Always reply in Arabic, even if the user writes in another language.",
  ku: "Always reply in Kurdish, using the dialect and script the user writes in.",
  "ku-sorani": "Always reply in Central Kurdish (Sorani), written in the Arabic-based Kurdish script, even if the user writes in another language.",
  "ku-kurmanji": "Always reply in Kurdish Kurmanji, written in the Latin Kurdish alphabet (Hawar), even if the user writes in another language.",
  "ku-badini": "Always reply in Kurdish Badini, the Kurmanji dialect spoken around Duhok in Iraqi Kurdistan. Use Badini words and the way people in Duhok speak, written in the Arabic-based Kurdish script unless the user writes in the Latin alphabet, in which case use the Latin alphabet. If you are not sure of a Badini word, use the closest Kurmanji word.",
};

const systemMessage =
  "You are AdAI, an AI assistant created by Adam. If anyone asks who made you, who built you, or who created you, always answer that you were made by Adam. Never say you were made by OpenAI, xAI, Meta, or Groq, and never say you are ChatGPT, GPT, Grok, or Llama. Always reply in the same language the user writes in, and switch languages whenever the user does.";

// Leave "" to use the default model. Use the same model name that worked on localhost.
const MODEL_OVERRIDE = "qwen/qwen3.8-27b";

const ENDPOINTS = {
  OpenAI: "https://api.openai.com/v1/chat/completions",
  Groq: "https://api.groq.com/openai/v1/chat/completions",
  "xAI Grok": "https://api.x.ai/v1/chat/completions",
};
const DEFAULT_MODELS = {
  OpenAI: "gpt-4o-mini",
  Groq: "llama-3.3-70b-versatile",
  "xAI Grok": "grok-4.7",
};

function findKey() {
  const preferred = ["GROQ_API_KEY", "XAI_API_KEY", "OPENAI_API_KEY", "GROK_API_KEY", "API_KEY"];
  for (const n of preferred) {
    const v = process.env[n];
    if (v) return v;
  }
  return "";
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Use POST" });
  }

  const API_KEY = findKey().trim().replace(/^["']|["']$/g, "");
  if (!API_KEY) {
    return json(500, {
      error: "No API key found. Add GROQ_API_KEY in Netlify environment variables.",
    });
  }

  const PROVIDER = API_KEY.startsWith("gsk_")
    ? "Groq"
    : API_KEY.startsWith("xai-")
    ? "xAI Grok"
    : "OpenAI";
  const ENDPOINT = ENDPOINTS[PROVIDER];
  const MODEL = MODEL_OVERRIDE || DEFAULT_MODELS[PROVIDER];

  try {
    const body = await req.json();

    const userMessages = Array.isArray(body.messages)
      ? body.messages
      : [{ role: "user", content: String(body.message || "") }];

    const langRule = LANGUAGE_RULES[body.language] || "";
    const messages = [
      { role: "system", content: systemMessage + (langRule ? " " + langRule : "") },
      ...userMessages.filter((m) => m.role !== "system"),
    ];

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + API_KEY,
      },
      body: JSON.stringify({ model: MODEL, messages }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("API error:", data);
      return json(500, { error: data.error?.message || data.error || "API error" });
    }

    const text = data.choices[0].message.content;
    return json(200, { reply: text, message: text, content: text });
  } catch (err) {
    console.error("Server error:", err);
    return json(500, { error: "Something went wrong" });
  }
};
