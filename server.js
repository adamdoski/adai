import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Load the .env file ourselves (handles .env.txt and Notepad encodings) ----------
function loadEnvFile() {
  const candidates = [".env", ".env.txt"].map((n) => path.join(__dirname, n));
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    let text;
    if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString("utf16le");
    else text = buf.toString("utf8");
    text = text.replace(/^\uFEFF/, "");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const name = line.slice(0, eq).replace(/^export\s+/, "").trim();
      let value = line.slice(eq + 1).trim();
      value = value.replace(/^["']|["']$/g, "");
      if (name) process.env[name] = value;
    }
    return file;
  }
  return null;
}

const envFileUsed = loadEnvFile();

// If you want, you can paste your key between the quotes here instead of using .env
const HARDCODED_KEY = "";

function findKey() {
  if (HARDCODED_KEY) return HARDCODED_KEY;
  const preferred = ["OPENAI_API_KEY", "XAI_API_KEY", "GROK_API_KEY", "GROQ_API_KEY", "API_KEY"];
  for (const n of preferred) if (process.env[n]) return process.env[n];
  // Fallback: any variable that looks like an API key name
  for (const n of Object.keys(process.env)) {
    if (/(XAI|GROK|API).*KEY|KEY.*(XAI|GROK|API)/i.test(n) && process.env[n]) {
      return process.env[n];
    }
  }
  return "";
}

const API_KEY = findKey().trim().replace(/^["']|["']$/g, "");

function checkKey(key) {
  if (!key) return "no key found";
  if (/\s/.test(key)) return "PROBLEM: the key contains a space or line break";
  if (key.startsWith("gsk_")) return "Groq key (gsk_), the Groq service will be used";
  if (key.startsWith("xai-")) return "xAI key (xai-), the xAI Grok service will be used";
  if (key.startsWith("sk-")) return "OpenAI key (sk-), the OpenAI service will be used";
  if (key.startsWith("AIza")) return "PROBLEM: this is a Google AI Studio key, this server does not use those";
  return "PROBLEM: unknown key format, it should start with sk-, xai- or gsk_";
}
// The service is chosen by your key: sk- = OpenAI, xai- = Grok, gsk_ = Groq.
// To force a specific model, put its name between the quotes. Leave "" to use the default.
const MODEL_OVERRIDE = "qwen/qwen3.8-27b";

const PROVIDER = API_KEY.startsWith("gsk_")
  ? "Groq"
  : API_KEY.startsWith("xai-")
  ? "xAI Grok"
  : "OpenAI";

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

const ENDPOINT = ENDPOINTS[PROVIDER];
const MODEL = MODEL_OVERRIDE || DEFAULT_MODELS[PROVIDER];

const systemMessage =
  "You are AdAI, an AI assistant created by Adam. If anyone asks who made you, who built you, or who created you, always answer that you were made by Adam. Never say you were made by OpenAI, xAI, Meta, or Groq, and never say you are ChatGPT, GPT, Grok, or Llama. Always reply in the same language the user writes in, and switch languages whenever the user does.";

app.use(express.json({ limit: "25mb" }));

// Language chosen in the dropdown on the page
const LANGUAGE_RULES = {
  en: "Always reply in English, even if the user writes in another language.",
  ar: "Always reply in Arabic, even if the user writes in another language.",
  ckb: "Always reply in Central Kurdish (Sorani), written in the Arabic-based Kurdish script, even if the user writes in another language.",
  kmr: "Always reply in Kurdish Kurmanji, written in the Latin Kurdish alphabet (Hawar), even if the user writes in another language.",
  badini: "Always reply in Kurdish Badini, the Kurmanji dialect spoken around Duhok in Iraqi Kurdistan. Use Badini words and the way people in Duhok speak, written in the Arabic-based Kurdish script unless the user writes in the Latin alphabet, in which case use the Latin alphabet. If you are not sure of a Badini word, use the closest Kurmanji word.",
};
app.use(express.static(__dirname, { dotfiles: "deny" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

async function handleChat(req, res) {
  try {
    if (!API_KEY) {
      return res.status(500).json({
        error: "No API key found. Put XAI_API_KEY=your_key in the .env file.",
      });
    }

    const userMessages = Array.isArray(req.body.messages)
      ? req.body.messages
      : [{ role: "user", content: String(req.body.message || "") }];

    const langRule = LANGUAGE_RULES[req.body.language] || "";
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
      return res
        .status(500)
        .json({ error: data.error?.message || data.error || "API error" });
    }

    const text = data.choices[0].message.content;
    res.json({ reply: text, message: text, content: text });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
}

app.post(["/chat", "/api/chat"], handleChat);

app.listen(PORT, () => {
  console.log("server version eight");
  console.log("Folder: " + __dirname);
  console.log("Env file used: " + (envFileUsed || "NONE FOUND"));
  const names = Object.keys(process.env).filter((n) => /KEY|XAI|GROK/i.test(n));
  console.log("Variable names that look like keys: " + (names.join(", ") || "none"));
  console.log("API key found: " + (API_KEY ? "yes" : "NO"));
  console.log("Key check: " + checkKey(API_KEY));
  console.log("Service: " + PROVIDER);
  console.log("Model: " + MODEL);
  console.log("Running at http://localhost:" + PORT);
});