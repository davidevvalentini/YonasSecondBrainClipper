// Yonas Second Brain Clipper — service worker.
//
// Il token di accesso NON sta nel codice: l'utente lo inserisce una volta dal popup e resta in
// chrome.storage.local (solo su questo browser). Senza token ogni richiesta si ferma con un messaggio chiaro.
const API_BASE = "https://yonas.davide-valentini.it";
const TOKEN_KEY = "sbToken";
const MENU_ID = "sb-inbox";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: "→ Invia all'Inbox del Second Brain", contexts: ["selection"] });
});

async function getToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  return String(stored[TOKEN_KEY] || "").trim();
}

/** Chiama l'API del Second Brain con il token salvato. Restituisce { ok, status, data } oppure { ok:false, error }. */
async function sbRequest(path, { method = "POST", body } = {}) {
  const token = await getToken();
  if (!token) return { ok: false, status: 0, error: "Token mancante: apri il popup dell'estensione e inseriscilo." };
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-sb-token": token },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = null;
    try { data = await res.json(); } catch { /* risposta senza JSON */ }
    if (res.ok) return { ok: true, status: res.status, data };
    const error = res.status === 401 ? "Token non valido: aggiornalo dal popup dell'estensione." : data?.error || `Errore del server (${res.status}).`;
    return { ok: false, status: res.status, data, error };
  } catch {
    return { ok: false, status: 0, error: "Non riesco a raggiungere il Second Brain: controlla la connessione." };
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = info.selectionText?.trim();
  if (!text) return;
  const res = await sbRequest("/api/inbox", {
    body: { content: `${text}\n\n📎 Fonte: ${tab.title}\n🔗 ${tab.url}`, source: "browser-extension" }
  });
  showNotification(res.ok ? "✅ Salvato nell'Inbox!" : `❌ ${res.error}`, tab.id);
});

function showNotification(message, tabId) {
  if (!tabId) return;
  chrome.scripting.executeScript({
    target: { tabId },
    func: msg => {
      const old = document.getElementById("__sb_toast"); if (old) old.remove();
      const toast = document.createElement("div"); toast.id = "__sb_toast"; toast.innerText = msg;
      toast.style.cssText = "position:fixed;bottom:24px;right:24px;background:#1c2332;color:#fff;border:1px solid #d4a843;border-radius:10px;padding:12px 20px;font:500 14px system-ui,sans-serif;z-index:999999;box-shadow:0 4px 24px rgba(212,168,67,.35)";
      document.body.appendChild(toast); setTimeout(() => toast.remove(), 3500);
    }, args: [message]
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SEND_TO_INBOX") {
    sbRequest("/api/inbox", { body: { content: msg.content, source: "browser-extension" } })
      .then(res => sendResponse({ ok: res.ok, status: res.status, error: res.error }));
    return true;
  }

  // Verifica del token: una GET autenticata qualsiasi (le impostazioni) risponde 200 solo con il token giusto.
  if (msg.type === "CHECK_TOKEN") {
    sbRequest("/api/settings", { method: "GET" }).then(res => sendResponse({ ok: res.ok, status: res.status, error: res.error }));
    return true;
  }

  if (msg.type === "IMPORT_GOODREADS") {
    const tabId = msg.tabId || sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: "Nessuna scheda attiva." }); return true; }
    chrome.scripting.executeScript({ target: { tabId }, func: extractGoodreadsBook })
      .then(async results => {
        const book = results?.[0]?.result;
        if (!book?.title || !book?.author) {
          sendResponse({ ok: false, error: "Non riesco a leggere titolo/autore da questa pagina Goodreads." }); return;
        }
        const res = await sbRequest("/api/books", { body: book });
        sendResponse(res.ok ? { ok: true, book: res.data } : { ok: false, error: res.data?.error || res.error });
      })
      .catch(err => sendResponse({ ok: false, error: err?.message || "Errore durante l'estrazione Goodreads." }));
    return true;
  }
});

// L'estrazione dei dati da Goodreads è invariata rispetto all'estensione originale (v10).
function extractGoodreadsBook() {
  const clean = value => { const el = document.createElement("div"); el.innerHTML = String(value ?? ""); return (el.textContent || "").replace(/\s+/g, " ").trim(); };
  const first = (...values) => values.find(v => typeof v === "string" && v.trim())?.trim() || "";
  const normalizeIsbn = v => String(v || "").replace(/[^0-9Xx]/g, "");
  const normalizeTag = v => clean(v).replace(/^#+/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  const scriptText = id => document.getElementById(id)?.textContent || "";

  let nextData = null, apollo = null;
  try { const raw = scriptText("__NEXT_DATA__"); if (raw) nextData = JSON.parse(raw); } catch {}
  apollo = nextData?.props?.pageProps?.apolloState || null;

  let book = null, author = "";
  if (apollo && typeof apollo === "object") {
    const pathId = location.pathname.match(/\/book\/show\/(\d+)/)?.[1];
    const entries = Object.values(apollo).filter(v => v && v.__typename === "Book");
    book = entries.find(v => pathId && String(v.legacyId) === String(pathId) && Object.keys(v).length > 3) || entries.find(v => Object.keys(v).length > 3) || null;
    const ref = book?.primaryContributorEdge?.node?.__ref;
    if (ref) author = apollo[ref]?.name || "";
  }

  let ld = null;
  try {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(s.textContent || "");
        const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(parsed?.["@graph"] || [])];
        const found = candidates.find(x => x && (x["@type"] === "Book" || (Array.isArray(x["@type"]) && x["@type"].includes("Book"))));
        if (found) { ld = found; break; }
      } catch {}
    }
  } catch {}

  const meta = name => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content || "";
  const title = first(book?.title, clean(ld?.name), meta("og:title"), document.querySelector("h1")?.textContent).replace(/\s*[|–-]\s*Goodreads.*$/i, "").trim();
  const cover = first(book?.imageUrl, Array.isArray(ld?.image) ? ld.image[0] : ld?.image, meta("og:image"));

  if (!author && Array.isArray(ld?.author)) author = ld.author.find(x => x?.name)?.name || "";
  else if (!author && ld?.author?.name) author = ld.author.name;
  if (!author) author = first(document.querySelector('[data-testid="name"]')?.textContent, document.querySelector('.ContributorLink__name')?.textContent, document.querySelector('[class*="ContributorLink"]')?.textContent, document.querySelector('a[href*="/author/"]')?.textContent);

  const details = book?.details || {};
  const isbn13 = first(details.isbn13, ld?.isbn);
  const isbn10 = first(details.isbn, book?.isbn);
  const pages = Number(details.numPages) || Number(ld?.numberOfPages) || null;

  // SERIES: use Goodreads' structured bookSeries data first, then the visible
  // /series/ link. The Goodreads series ID is the stable identity; position
  // supports values such as 0.5, 1, 1.5, 2, etc.
  let series = "", seriesId = "", seriesPosition = null;
  if (Array.isArray(book?.bookSeries)) {
    const candidates = book.bookSeries.filter(Boolean);
    const item = candidates[0];
    const s = item?.series || item;
    const ref = s?.__ref || item?.series?.__ref;
    if (ref) {
      seriesId = String(ref).match(/(?:Series|series)[:/](\d+)/)?.[1] || "";
      if (apollo?.[ref]) series = first(apollo[ref].title, apollo[ref].name);
    }
    series = first(series, item?.series?.title, item?.series?.name, item?.seriesName, s?.title, s?.name);
    const pos = item?.position ?? item?.bookNumber ?? item?.number ?? item?.seriesPosition;
    const m = String(pos ?? "").match(/\d+(?:\.\d+)?/);
    if (m) seriesPosition = Number(m[0]);
  }

  if (!seriesId || !series || seriesPosition == null) {
    const links = [...document.querySelectorAll('a[href*="/series/"]')];
    for (const a of links) {
      const href = a.href || "";
      const match = href.match(/\/series\/(\d+)(?:-[^/?#]+)?/i);
      if (!match) continue;
      if (!seriesId) seriesId = match[1];
      if (!series) series = clean(a.textContent).replace(/\s+Series$/i, "").trim();
      const parentText = clean(a.parentElement?.parentElement?.textContent || a.parentElement?.textContent || "");
      const posMatch = parentText.match(/(?:Book|#)\s*(\d+(?:\.\d+)?)/i);
      if (seriesPosition == null && posMatch) seriesPosition = Number(posMatch[1]);
      break;
    }
  }
  if (seriesPosition == null) {
    const body = clean(document.body.innerText || "");
    const posMatch = body.match(/(?:Book|Libro)\s+(\d+(?:\.\d+)?)/i);
    if (posMatch && seriesId) seriesPosition = Number(posMatch[1]);
  }

  let genreNames = [];
  if (Array.isArray(book?.bookGenres)) genreNames = book.bookGenres.map(x => normalizeTag(x?.genre?.name)).filter(Boolean);
  if (!genreNames.length && Array.isArray(ld?.genre)) genreNames = ld.genre.map(normalizeTag).filter(Boolean);
  if (!genreNames.length && typeof ld?.genre === "string") genreNames = [normalizeTag(ld.genre)];
  genreNames = genreNames.filter((v, i, a) => !/^audio[- ]?books?$/i.test(v) && a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);
  const category = genreNames[0] || first(document.querySelector('[data-testid="genresList"]')?.textContent, document.querySelector('.BookPageMetadataSection__genres')?.textContent) || "General";
  const tags = genreNames.length ? genreNames : undefined;

  const description = first(book?.['description({"stripped":true})'], clean(book?.description), clean(ld?.description), document.querySelector('[data-testid="description"]')?.textContent, document.querySelector('.DetailsLayoutRightParagraph__widthConstrained')?.textContent, document.querySelector('.Formatted')?.textContent);

  // YEAR: Goodreads can expose publication data under slightly different
  // Apollo fields depending on the page/version. Try the known fields first,
  // then inspect publication-related keys recursively, then visible metadata.
  const yearCandidates = [
    // Current Goodreads Apollo structure: details.publicationTime is a
    // Unix timestamp in milliseconds (e.g. 1528329600000).
    details.publicationTime,
    details.publicationYear, details.publishedYear, details.publicationDate, details.publishedDate,
    details.firstPublishedYear, details.firstPublicationYear, details.firstPublishedDate,
    book?.publicationTime,
    book?.publicationYear, book?.publishedYear, book?.publicationDate, book?.publishedDate,
    book?.firstPublishedYear, book?.firstPublicationYear, book?.firstPublishedDate,
    ld?.datePublished, meta("book:release_date"), meta("article:published_time")
  ];

  const extractYear = value => {
    if (value == null) return null;

    // Goodreads uses details.publicationTime as milliseconds since epoch.
    if (typeof value === "number") {
      if (Number.isInteger(value) && value >= 1500 && value <= 2199) return value;
      if (Number.isFinite(value) && value > 100000000000) {
        const d = new Date(value);
        const y = d.getUTCFullYear();
        if (y >= 1500 && y <= 2199) return y;
      }
    }

    const text = typeof value === "string" ? clean(value) : JSON.stringify(value);
    const m = String(text || "").match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
    return m ? Number(m[1]) : null;
  };

  let year = null;
  for (const candidate of yearCandidates) {
    year = extractYear(candidate);
    if (year !== null) break;
  }

  // Some Goodreads Apollo payloads put publication fields deeper in the
  // object. Only inspect keys whose names explicitly refer to publication.
  if (year === null && book && typeof book === "object") {
    const seen = new Set();
    const walk = (value, depth = 0) => {
      if (year !== null || depth > 5 || value == null || typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (/publication|published|firstpublished|firstpublication/i.test(key)) {
          const found = extractYear(child);
          if (found !== null) { year = found; return; }
        }
        if (child && typeof child === "object") walk(child, depth + 1);
        if (year !== null) return;
      }
    };
    walk(book);
  }

  // Final fallback: Goodreads often renders text such as "First published
  // 2024" or "Published 2024" even when Apollo does not expose the field.
  if (year === null) {
    const visible = clean(document.body.innerText || "");
    const m = visible.match(/(?:first\s+published|published|publication|pubblicato|pubblicazione)[^\d]{0,40}\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/i);
    if (m) year = Number(m[1]);
  }

  return {
    title: clean(title), author: clean(author), series: clean(series) || undefined,
    seriesId: seriesId || undefined, seriesPosition: Number.isFinite(seriesPosition) ? seriesPosition : undefined,
    category: clean(category) || "General", status: "to-read", rating: null, notes: "", pages,
    desc: clean(description), isbn: normalizeIsbn(isbn13 || isbn10) || undefined,
    isbn10: normalizeIsbn(isbn10) || undefined, isbn13: normalizeIsbn(isbn13) || undefined,
    cover: cover || undefined, year: Number.isFinite(year) ? year : null, tags, isNew: true, completedAt: null
  };
}
