# Yonas Second Brain Clipper

Estensione per Chrome (e browser basati su Chromium: Edge, Brave…) che manda cose al tuo Second Brain
(https://yonas.davide-valentini.it):

- **Nota veloce**: scrivi nel popup e premi Invio → finisce nell'Inbox.
- **Testo selezionato**: seleziona del testo in qualsiasi pagina, clic destro →
  «Invia all'Inbox del Second Brain». Nell'Inbox restano anche titolo e indirizzo della pagina.
- **Libri da Goodreads**: sulla pagina di un libro, «Importa libro da Goodreads» lo aggiunge a Entertainment
  con titolo, autore, serie e posizione nella serie, anno, generi come tag, copertina, ISBN e trama.

## Installazione

1. Scarica e decomprimi lo zip (o clona il repo).
2. Apri `chrome://extensions` e attiva **Modalità sviluppatore** (in alto a destra).
3. **Carica estensione non pacchettizzata** e scegli la cartella decompressa (quella con `manifest.json`).
4. Fissa l'icona «Y» dalla barra delle estensioni.

## Primo avvio

Il popup chiede il **token di accesso** del Second Brain: è lo stesso che inserisci per entrare dal browser.
Incollalo e premi «Salva e verifica»: l'estensione prova una chiamata vera e salva il token solo se funziona.
Il token resta in `chrome.storage.local`, cioè solo su questo browser, e **non è scritto nel codice**.
L'ingranaggio ⚙ in alto a destra permette di cambiarlo.

## Come è fatta

| File | Cosa fa |
|---|---|
| `manifest.json` | Manifest V3; permessi su Goodreads e sul dominio del Second Brain |
| `background.js` | Service worker: menu contestuale, chiamate all'API, lettura della pagina Goodreads |
| `popup.html` / `popup.css` / `popup.js` | Popup: collegamento del token, nota veloce, importazione |
| `tools/make-icons.py` | Rigenera le icone «Y» (`python3 tools/make-icons.py`) |

Chiamate all'API (header `x-sb-token`): `POST /api/inbox` per note e testo selezionato (`source: "browser-extension"`),
`POST /api/books` per Goodreads, `GET /api/settings` solo per verificare il token.

## Rispetto all'estensione originale (OpenClaw Clipper v10)

- Punta a `yonas.davide-valentini.it` invece che al Second Brain di Davide.
- Il token non è più scritto in `background.js`: si inserisce dal popup e vive solo nel browser.
- Un token sbagliato non viene salvato; un 401 dice di aggiornarlo, non «sei offline».
- Via i riferimenti a OpenClaw e Tailscale (il sito è pubblico, su HTTPS).
- Nuovo aspetto, con i colori e la «Y» del Second Brain; testi in italiano.
- L'estrazione dei dati da Goodreads (`extractGoodreadsBook`) è **identica** all'originale.

## Cambiare indirizzo

Se il Second Brain cambia dominio, vanno aggiornati `API_BASE` in `background.js` e `host_permissions`
in `manifest.json`.
