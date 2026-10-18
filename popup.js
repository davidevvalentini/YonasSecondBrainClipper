const $ = id => document.getElementById(id);
const TOKEN_KEY = "sbToken";
const IMPORT_LABEL = "📚 Importa libro da Goodreads";
const SEND_LABEL = "→ Invia all'Inbox";
let currentTab = null;

function showStatus(type, message) {
  const el = $("status");
  el.className = `status ${type}`;
  el.textContent = message;
}

function hideStatus() {
  const el = $("status");
  el.className = "status";
  el.textContent = "";
}

/** Mostra il pannello di collegamento (true) o la vista normale (false). */
function showSetup(on) {
  $("setup").hidden = !on;
  $("main").hidden = on;
  if (on) $("tokenInput").focus();
}

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  if (!tabs[0]) return;
  currentTab = tabs[0];
  $("pageTitle").textContent = tabs[0].title || "Sconosciuta";
  $("pageUrl").textContent = tabs[0].url || "";
  let isGoodreads = false;
  try { isGoodreads = /(^|\.)goodreads\.com$/i.test(new URL(tabs[0].url || "").hostname); } catch { /* url non valido */ }
  $("importBtn").disabled = !isGoodreads;
});

// Al primo avvio non c'è un token: si parte dal collegamento.
chrome.storage.local.get(TOKEN_KEY).then(stored => { if (!String(stored[TOKEN_KEY] || "").trim()) showSetup(true); });

$("gearBtn").addEventListener("click", async () => {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  $("tokenInput").value = stored[TOKEN_KEY] || "";
  hideStatus();
  showSetup($("setup").hidden);
});

$("cancelSetup").addEventListener("click", async () => {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  hideStatus();
  // Senza un token salvato non si può tornare alla vista normale: non funzionerebbe niente.
  if (String(stored[TOKEN_KEY] || "").trim()) showSetup(false);
});

$("saveToken").addEventListener("click", async () => {
  const token = $("tokenInput").value.trim();
  if (!token) return showStatus("error", "Incolla prima il token.");
  const btn = $("saveToken");
  btn.disabled = true;
  showStatus("info", "Verifico il token…");
  const previous = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY];
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
  chrome.runtime.sendMessage({ type: "CHECK_TOKEN" }, async res => {
    btn.disabled = false;
    if (res?.ok) {
      showStatus("success", "✅ Collegato al tuo Second Brain.");
      showSetup(false);
      return;
    }
    // Un token sbagliato non deve restare salvato al posto di quello che funzionava.
    if (previous) await chrome.storage.local.set({ [TOKEN_KEY]: previous });
    else await chrome.storage.local.remove(TOKEN_KEY);
    showStatus("error", `❌ ${res?.error || "Verifica fallita."}`);
  });
});

$("tokenInput").addEventListener("keydown", e => { if (e.key === "Enter") $("saveToken").click(); });

$("importBtn").addEventListener("click", () => {
  const btn = $("importBtn");
  btn.disabled = true;
  btn.textContent = "Importo…";
  showStatus("info", "🔎 Leggo i dati da Goodreads…");
  chrome.runtime.sendMessage({ type: "IMPORT_GOODREADS", tabId: currentTab?.id }, res => {
    btn.disabled = false;
    btn.textContent = IMPORT_LABEL;
    if (res?.ok) {
      const book = res.book?.book || res.book || {};
      showStatus("success", `✅ Importato: ${book.title || "libro"}`);
    } else {
      showStatus("error", `❌ ${res?.error || "Importazione fallita."}`);
    }
  });
});

$("sendBtn").addEventListener("click", () => {
  const text = $("noteInput").value.trim();
  if (!text) return showStatus("error", "Scrivi prima qualcosa.");
  const btn = $("sendBtn");
  btn.disabled = true;
  btn.textContent = "Invio…";
  const content = currentTab ? `${text}\n\n📎 ${currentTab.title}\n🔗 ${currentTab.url}` : text;
  chrome.runtime.sendMessage({ type: "SEND_TO_INBOX", content }, res => {
    btn.disabled = false;
    btn.textContent = SEND_LABEL;
    if (res?.ok) {
      showStatus("success", "✅ Salvato nell'Inbox!");
      $("noteInput").value = "";
      setTimeout(() => window.close(), 1500);
    } else {
      showStatus("error", `❌ ${res?.error || "Invio fallito."}`);
    }
  });
});

$("clearBtn").addEventListener("click", () => { $("noteInput").value = ""; hideStatus(); });

$("noteInput").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("sendBtn").click(); }
});
