const DEFAULT_AGENT = {
  id: "default",
  name: "Assistant",
  instructions: "You are a helpful assistant.",
};

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Could not save " + key, err);
  }
}

function makeTitle(msgs) {
  const first = (msgs || []).find((m) => m.role === "user");
  let t = first && typeof first.content === "string" ? first.content.trim() : "";
  if (!t) t = "New chat";
  return t.length > 40 ? t.slice(0, 40) + "..." : t;
}

// ---------- State ----------
let agents = load("agents", [DEFAULT_AGENT]);
if (!agents.length) agents = [DEFAULT_AGENT];
let currentAgentId = load("currentAgent", agents[0].id);
if (!agents.find((a) => a.id === currentAgentId)) currentAgentId = agents[0].id;
let editingId = null;

// Conversations (history). Old one-chat-per-agent data is moved over once.
let convos = load("convos", null);
if (!Array.isArray(convos)) {
  convos = [];
  const old = load("chats", {});
  Object.keys(old).forEach((agentId, i) => {
    const msgs = old[agentId];
    if (Array.isArray(msgs) && msgs.length) {
      convos.push({
        id: "c" + Date.now() + "_" + i,
        agentId,
        title: makeTitle(msgs),
        messages: msgs,
        updated: Date.now() - i,
      });
    }
  });
  save("convos", convos);
}
let currentConvId = load("currentConv", null);
if (!convos.find((c) => c.id === currentConvId)) currentConvId = null;
{
  const c = convos.find((x) => x.id === currentConvId);
  if (c && agents.find((a) => a.id === c.agentId)) currentAgentId = c.agentId;
}

const $ = (id) => document.getElementById(id);
const log = $("log");

// ---------- Language picker ----------
let language = load("language", "auto");
if ($("langSelect")) {
  $("langSelect").value = language;
  $("langSelect").addEventListener("change", (e) => {
    language = e.target.value;
    save("language", language);
  });
}

function persist() {
  save("convos", convos);
  save("currentConv", currentConvId);
  save("currentAgent", currentAgentId);
}

function getConv() {
  return convos.find((c) => c.id === currentConvId) || null;
}
function currentAgent() {
  return agents.find((a) => a.id === currentAgentId) || agents[0];
}

// ---------- Tabs ----------
document.querySelectorAll(".nav[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  });
});
function showMessagesTab() {
  const b = document.querySelector('.nav[data-tab="messages"]');
  if (b) b.click();
}

// ---------- Messages ----------
function addBubble(role, text, thumb) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  if (thumb) {
    const img = document.createElement("img");
    img.className = "thumb-img";
    img.src = thumb;
    img.alt = "Photo";
    div.appendChild(img);
  }
  const span = document.createElement("span");
  span.textContent = text;
  div.appendChild(span);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function renderChat() {
  log.innerHTML = "";
  const c = getConv();
  (c ? c.messages : []).forEach((m) => addBubble(m.role, m.content, m.thumb));
}

function renderSelect() {
  const sel = $("agentSelect");
  sel.innerHTML = "";
  agents.forEach((a) => {
    const o = document.createElement("option");
    o.value = a.id;
    o.textContent = a.name;
    if (a.id === currentAgentId) o.selected = true;
    sel.appendChild(o);
  });
}

// ---------- History ----------
function renderHistory() {
  const list = $("historyList");
  if (!list) return;
  list.innerHTML = "";
  [...convos]
    .sort((a, b) => b.updated - a.updated)
    .forEach((c) => {
      const row = document.createElement("div");
      row.className = "history-item" + (c.id === currentConvId ? " active" : "");

      const title = document.createElement("button");
      title.className = "history-title";
      title.textContent = c.title || "New chat";
      title.onclick = () => openConv(c.id);

      const del = document.createElement("button");
      del.className = "history-del";
      del.textContent = "\u00d7";
      del.title = "Delete this chat";
      del.onclick = () => {
        convos = convos.filter((x) => x.id !== c.id);
        if (currentConvId === c.id) currentConvId = null;
        persist();
        renderChat();
        renderHistory();
      };

      row.append(title, del);
      list.appendChild(row);
    });
}

function openConv(id) {
  const c = convos.find((x) => x.id === id);
  if (!c) return;
  currentConvId = id;
  if (agents.find((a) => a.id === c.agentId)) currentAgentId = c.agentId;
  persist();
  renderSelect();
  renderChat();
  renderHistory();
  showMessagesTab();
}

function newChat() {
  currentConvId = null;
  persist();
  renderChat();
  renderHistory();
  showMessagesTab();
  $("input").focus();
}
if ($("newChat")) $("newChat").addEventListener("click", newChat);

$("agentSelect").addEventListener("change", (e) => {
  currentAgentId = e.target.value;
  const latest = convos
    .filter((c) => c.agentId === currentAgentId)
    .sort((a, b) => b.updated - a.updated)[0];
  currentConvId = latest ? latest.id : null;
  persist();
  renderChat();
  renderHistory();
});

$("clearBtn").addEventListener("click", () => {
  if (currentConvId) convos = convos.filter((c) => c.id !== currentConvId);
  currentConvId = null;
  persist();
  renderChat();
  renderHistory();
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  // Small thumbnail of the attached photo (if any), kept in history
  const thumb = window.adaiPhoto ? window.adaiPhoto.getThumb() : null;

  let conv = getConv();
  if (!conv) {
    conv = {
      id: "c" + Date.now(),
      agentId: currentAgentId,
      title: "",
      messages: [],
      updated: Date.now(),
    };
    convos.push(conv);
    currentConvId = conv.id;
  }
  const userMsg = { role: "user", content: text };
  if (thumb) userMsg.thumb = thumb;
  conv.messages.push(userMsg);
  if (!conv.title) conv.title = makeTitle(conv.messages);
  conv.updated = Date.now();
  persist();
  renderHistory();
  addBubble("user", text, thumb);

  const agent = agents.find((a) => a.id === conv.agentId) || currentAgent();
  const stillHere = () => currentConvId === conv.id;

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // send only role + content (no thumbnails) to the server
        messages: conv.messages.map((m) => ({ role: m.role, content: m.content })),
        system: agent.instructions,
        language: language,
      }),
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "Request failed");
    conv.messages.push({ role: "assistant", content: data.reply });
    conv.updated = Date.now();
    if (stillHere()) addBubble("assistant", data.reply);
  } catch (err) {
    if (stillHere()) addBubble("error", "Error: " + err.message);
  }
  persist();
  renderHistory();
});

// ---------- Agents ----------
function renderAgents() {
  const list = $("agentList");
  list.innerHTML = "";
  agents.forEach((a) => {
    const card = document.createElement("div");
    card.className = "agent-card";

    const h = document.createElement("h3");
    h.textContent = a.name;
    const p = document.createElement("p");
    p.textContent = a.instructions;

    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.onclick = () => {
      editingId = a.id;
      $("agentName").value = a.name;
      $("agentInstructions").value = a.instructions;
    };

    card.append(h, p, edit);

    if (a.id !== "default") {
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.className = "danger";
      del.onclick = () => {
        agents = agents.filter((x) => x.id !== a.id);
        convos = convos.filter((c) => c.agentId !== a.id);
        if (currentAgentId === a.id) currentAgentId = agents[0].id;
        if (!getConv()) currentConvId = null;
        save("agents", agents);
        persist();
        refreshAll();
      };
      card.append(del);
    }
    list.appendChild(card);
  });
}

$("agentForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("agentName").value.trim();
  const instructions = $("agentInstructions").value.trim();
  if (!name || !instructions) return;

  if (editingId) {
    const a = agents.find((x) => x.id === editingId);
    a.name = name;
    a.instructions = instructions;
  } else {
    agents.push({ id: "a" + Date.now(), name, instructions });
  }
  editingId = null;
  $("agentForm").reset();
  save("agents", agents);
  refreshAll();
});

function refreshAll() {
  renderSelect();
  renderAgents();
  renderChat();
  renderHistory();
}
refreshAll();