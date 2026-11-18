/**
 * Narrivu — backend (Google Apps Script, legato a un foglio Google)
 *
 * Cosa fa:
 *  - tiene i dati in un foglio (Eventi, Scadenze, Promemoria, Spesa, Abituali)
 *  - espone una piccola API JSON usata dall'app web (tablet e telefoni)
 *  - invia le notifiche dei promemoria e delle scadenze via email
 *
 * Primo avvio: esegui setup() una volta dall'editor, poi pubblica come app web
 * (vedi README). Licenza: GPL-3.0.
 */

const PERSONE = ['Famiglia', 'Alfio', 'Lucia', 'Eddie', 'Zaja']; // a chi si riferisce un evento
const AUTORI = ['Alfio', 'Lucia'];                      // chi inserisce
const STATI_SPESA = ['da_comprare', 'comprato'];

const TABS = {
  Eventi:     ['id', 'titolo', 'data', 'ora', 'per', 'autore', 'note', 'creato'],
  Scadenze:   ['id', 'prodotto', 'scadenza', 'avviso_giorni', 'autore', 'creato', 'consumato', 'ultimo_avviso'],
  Promemoria: ['id', 'testo', 'quando', 'per', 'autore', 'creato', 'inviato'],
  Spesa:      ['id', 'prodotto', 'stato', 'autore', 'creato', 'aggiornato'],
  Abituali:   ['id', 'prodotto']
};

// Colonne che il client può scrivere (id e campi di servizio li gestisce il server)
const EDITABLE = {
  Eventi:     ['titolo', 'data', 'ora', 'per', 'autore', 'note'],
  Scadenze:   ['prodotto', 'scadenza', 'avviso_giorni', 'autore', 'consumato'],
  Promemoria: ['testo', 'quando', 'per', 'autore'],
  Spesa:      ['prodotto', 'stato', 'autore'],
  Abituali:   ['prodotto']
};

const ABITUALI_INIZIALI = ['Latte', 'Pane', 'Uova', 'Pasta', 'Carta igienica', 'Detersivo piatti', 'Caffè', 'Frutta'];

/* ------------------------------------------------------------------ */
/* Installazione                                                       */
/* ------------------------------------------------------------------ */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (name) {
    const cols = TABS[name];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Testo semplice: evita che Fogli trasformi date e orari in numeri
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  });
  const first = ss.getSheetByName('Foglio1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', randomString_(32));
  if (!props.getProperty('EMAIL_DESTINATARI')) {
    const me = Session.getEffectiveUser().getEmail();
    if (me) props.setProperty('EMAIL_DESTINATARI', me);
  }

  const ab = ss.getSheetByName('Abituali');
  if (ab.getLastRow() < 2) {
    ab.getRange(2, 1, ABITUALI_INIZIALI.length, 2)
      .setValues(ABITUALI_INIZIALI.map(function (p) { return [newId_(), p]; }));
  }

  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('dailyJob').timeBased().atHour(8).everyDays(1).create();

  showSetup();
}

/** Stampa nel log i dati da copiare nell'app (token, destinatari email, indirizzo). */
/** Indirizzo della pagina su GitHub Pages (cambialo dopo la pubblicazione). */
const PAGES_URL = 'https://datigrezzi.it/Narrivu/';

/**
 * Indirizzo dell'app web: incollalo da Distribuisci > Gestisci distribuzioni > "Copia" (URL che finisce con /exec).
 * Serve perché dall'editor lo script conosce solo l'indirizzo di prova (/dev), che non funziona per gli altri dispositivi.
 */
const WEBAPP_URL = '';

function showSetup() {
  const p = PropertiesService.getScriptProperties();
  if (WEBAPP_URL) p.setProperty('WEBAPP_URL', WEBAPP_URL);
  let url = WEBAPP_URL || p.getProperty('WEBAPP_URL') || '';
  if (!url) { try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* non ancora pubblicato */ } }
  Logger.log('TOKEN: ' + p.getProperty('TOKEN'));
  Logger.log('EMAIL NOTIFICHE: ' + (p.getProperty('EMAIL_DESTINATARI') || '(nessuna)'));
  if (!url || /\/dev$/.test(url)) {
    Logger.log('ATTENZIONE: manca l\'indirizzo /exec. Vai su Distribuisci > Gestisci distribuzioni, premi "Copia" sull\'URL dell\'app web, incollalo in WEBAPP_URL in cima a showSetup, salva e riesegui showSetup.');
    return;
  }
  Logger.log('INDIRIZZO API: ' + url);
  const base = PAGES_URL + '#api=' + encodeURIComponent(url) + '&t=' + encodeURIComponent(p.getProperty('TOKEN'));
  Logger.log('LINK ALFIO: ' + base + '&mode=phone&who=Alfio');
  Logger.log('LINK LUCIA: ' + base + '&mode=phone&who=Lucia');
  Logger.log('LINK TABLET: ' + base + '&mode=display');
}

/** Genera un nuovo token (i vecchi link smettono di funzionare). Poi esegui showSetup per i nuovi link. */
function rigeneraToken() {
  PropertiesService.getScriptProperties().setProperty('TOKEN', randomString_(32));
  Logger.log('Nuovo token generato. Esegui showSetup per ottenere i nuovi link.');
}

/** Prova rapida: manda una notifica di prova dal menu Esegui. */
function testNotifica() {
  const ok = notify_('Narrivu', 'Notifica di prova: se la leggi, funziona.', {});
  Logger.log(ok ? 'Email di prova inviata: controlla la posta.' : 'NOTIFICA NON INVIATA: ' + NOTIFICA_ERRORE_);
}

/* ------------------------------------------------------------------ */
/* API web                                                             */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'JSON non valido' }); }
  return handle_(body);
}

function handle_(req) {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || !safeEqual_(String(req.token || ''), token)) {
    return json_({ ok: false, error: 'Token non valido' });
  }
  try {
    switch (req.action) {
      case 'list':   return json_(listAll_());
      case 'upsert': return json_(withLock_(function () { return upsert_(req.tab, req.row); }));
      case 'remove': return json_(withLock_(function () { return remove_(req.tab, req.id); }));
      case 'ops':    return json_(withLock_(function () { return runOps_(req.ops); }));
      case 'setColori': {
        const c = req.colori || {};
        const out = {};
        for (let i = 0; i < PERSONE.length; i++) {
          const v = c[PERSONE[i]];
          if (v === undefined || v === null || v === '') continue;
          if (!/^#[0-9A-Fa-f]{6}$/.test(String(v))) return json_({ ok: false, error: 'Colore non valido per ' + PERSONE[i] });
          out[PERSONE[i]] = String(v).toUpperCase();
        }
        PropertiesService.getScriptProperties().setProperty('COLORI', JSON.stringify(out));
        return json_({ ok: true, colori: out });
      }
      case 'setEmail': {
        const list = String(req.emails || '').split(/[,;\s]+/).filter(Boolean);
        if (!list.length || list.length > 6) return json_({ ok: false, error: 'Inserisci da 1 a 6 indirizzi email' });
        const bad = list.filter(function (x) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
        if (bad.length) return json_({ ok: false, error: 'Indirizzo non valido: ' + bad[0] });
        const value = list.join(', ');
        PropertiesService.getScriptProperties().setProperty('EMAIL_DESTINATARI', value);
        return json_({ ok: true, emailDestinatari: value });
      }
      case 'test': {
        const sent = notify_('Narrivu', 'Notifica di prova: se la leggi, funziona.', {});
        return json_(sent ? { ok: true } : { ok: false, error: NOTIFICA_ERRORE_ || 'notifica non inviata' });
      }
      default:       return json_({ ok: false, error: 'Azione sconosciuta' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function listAll_() {
  const p = PropertiesService.getScriptProperties();
  const today = ymd_(new Date());
  const from = shiftDay_(today, -7);
  return {
    ok: true,
    now: nowLocal_(),
    config: { emailDestinatari: p.getProperty('EMAIL_DESTINATARI') || '', colori: parseJson_(p.getProperty('COLORI')) },
    data: {
      eventi: readTab_('Eventi').filter(function (r) { return r.data >= from; }),
      scadenze: readTab_('Scadenze').filter(function (r) { return r.consumato !== 'si'; }),
      promemoria: readTab_('Promemoria').filter(function (r) { return r.inviato !== 'si' || r.quando.slice(0, 10) >= from; }),
      spesa: readTab_('Spesa'),
      abituali: readTab_('Abituali')
    }
  };
}

function runOps_(ops) {
  if (!Array.isArray(ops)) throw new Error('ops non valido');
  const results = ops.map(function (op) {
    if (op.action === 'upsert') return upsert_(op.tab, op.row);
    if (op.action === 'remove') return remove_(op.tab, op.id);
    throw new Error('Operazione sconosciuta');
  });
  return { ok: true, results: results };
}

/* ------------------------------------------------------------------ */
/* Dati                                                                */
/* ------------------------------------------------------------------ */

function sheet_(name) {
  if (!TABS[name]) throw new Error('Tab non valida');
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Manca il foglio ' + name + ': esegui setup()');
  return sh;
}

function readTab_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const cols = TABS[name];
  return sh.getRange(2, 1, last - 1, cols.length).getValues()
    .filter(function (v) { return v[0] !== ''; })
    .map(function (v) {
      const o = {};
      cols.forEach(function (c, i) { o[c] = String(v[i] === null || v[i] === undefined ? '' : v[i]); });
      return o;
    });
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function upsert_(tab, row) {
  if (!EDITABLE[tab]) throw new Error('Tab non valida');
  row = row || {};
  const clean = sanitize_(tab, row);
  const sh = sheet_(tab);
  const cols = TABS[tab];
  let id = String(row.id || '');
  if (id && !/^[A-Za-z0-9_-]{4,40}$/.test(id)) throw new Error('id non valido');

  const at = id ? findRow_(sh, id) : -1;
  const now = nowLocal_();

  if (at > 0) {
    // Aggiornamento: cambia solo i campi arrivati
    const cur = sh.getRange(at, 1, 1, cols.length).getValues()[0];
    const o = {};
    cols.forEach(function (c, i) { o[c] = String(cur[i] === null ? '' : cur[i]); });
    Object.keys(clean).forEach(function (k) { o[k] = clean[k]; });
    if (tab === 'Spesa') o.aggiornato = now;
    // Se cambia la scadenza o l'orario, il promemoria/avviso va riarmato
    if (tab === 'Promemoria' && clean.quando !== undefined) o.inviato = '';
    if (tab === 'Scadenze' && clean.scadenza !== undefined) o.ultimo_avviso = '';
    sh.getRange(at, 1, 1, cols.length).setValues([cols.map(function (c) { return o[c]; })]);
    return { ok: true, id: id, created: false };
  }

  // Nuova riga
  if (tab === 'Spesa') {
    // Niente doppioni: se il prodotto è già in lista lo rimetto "da comprare"
    const same = readTab_('Spesa').filter(function (r) {
      return r.prodotto.toLowerCase() === String(clean.prodotto || '').toLowerCase();
    })[0];
    if (same) {
      const sr = findRow_(sh, same.id);
      sh.getRange(sr, 1, 1, cols.length).setValues([cols.map(function (c) {
        if (c === 'stato') return 'da_comprare';
        if (c === 'aggiornato') return now;
        return same[c];
      })]);
      return { ok: true, id: same.id, created: false };
    }
  }
  if (tab === 'Abituali') {
    const dup = readTab_('Abituali').filter(function (r) {
      return r.prodotto.toLowerCase() === String(clean.prodotto || '').toLowerCase();
    })[0];
    if (dup) return { ok: true, id: dup.id, created: false };
  }
  requireFields_(tab, clean);
  id = id || newId_();
  const o = { id: id, creato: now };
  if (tab === 'Spesa') { o.stato = 'da_comprare'; o.aggiornato = now; }
  Object.keys(clean).forEach(function (k) { o[k] = clean[k]; });
  if (tab === 'Scadenze' && o.avviso_giorni === undefined) o.avviso_giorni = '2';
  sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length)
    .setValues([cols.map(function (c) { return o[c] === undefined ? '' : o[c]; })]);
  return { ok: true, id: id, created: true };
}

function remove_(tab, id) {
  if (!EDITABLE[tab]) throw new Error('Tab non valida');
  const sh = sheet_(tab);
  const at = findRow_(sh, String(id || ''));
  if (at > 0) sh.deleteRow(at);
  return { ok: true };
}

function requireFields_(tab, c) {
  const need = {
    Eventi: ['titolo', 'data', 'per', 'autore'],
    Scadenze: ['prodotto', 'scadenza', 'autore'],
    Promemoria: ['testo', 'quando', 'per', 'autore'],
    Spesa: ['prodotto'],
    Abituali: ['prodotto']
  }[tab];
  need.forEach(function (k) { if (!c[k]) throw new Error('Manca il campo "' + k + '"'); });
}

/** Controlla e normalizza i campi in arrivo. Ignora tutto ciò che non è modificabile. */
function sanitize_(tab, row) {
  const out = {};
  EDITABLE[tab].forEach(function (k) {
    if (row[k] === undefined || row[k] === null) return;
    let v = String(row[k]).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);
    switch (k) {
      case 'data': case 'scadenza':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Data non valida');
        break;
      case 'ora':
        if (v !== '' && !/^\d{2}:\d{2}$/.test(v)) throw new Error('Ora non valida');
        break;
      case 'quando':
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error('Data e ora non valide');
        break;
      case 'per':
        if (PERSONE.indexOf(v) < 0) throw new Error('Destinatario non valido');
        break;
      case 'autore':
        if (AUTORI.indexOf(v) < 0) throw new Error('Autore non valido');
        break;
      case 'stato':
        if (STATI_SPESA.indexOf(v) < 0) throw new Error('Stato non valido');
        break;
      case 'avviso_giorni':
        if (!/^\d{1,2}$/.test(v)) throw new Error('Giorni di avviso non validi');
        break;
      case 'consumato':
        v = v === 'si' ? 'si' : '';
        break;
      case 'titolo': case 'prodotto': case 'testo':
        if (!v) throw new Error('Il testo è vuoto');
        break;
    }
    out[k] = v;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Notifiche (trigger)                                                 */
/* ------------------------------------------------------------------ */

/** Ogni 5 minuti: invia i promemoria arrivati a scadenza. */
function checkReminders() {
  withLock_(function () {
    const now = nowLocal_();
    const sh = sheet_('Promemoria');
    const cols = TABS.Promemoria;
    readTab_('Promemoria').forEach(function (r) {
      if (r.inviato === 'si' || !r.quando || r.quando > now) return;
      const dest = r.per === 'Famiglia' ? '' : ' (' + r.per + ')';
      const ok = notify_('Promemoria' + dest, r.testo, { priority: 4, tags: ['bell'] });
      if (ok) {
        const at = findRow_(sh, r.id);
        if (at > 0) sh.getRange(at, cols.indexOf('inviato') + 1).setValue('si');
      }
    });
  });
}

/** Ogni mattina: riepilogo delle scadenze vicine e pulizia dei dati vecchi. */
function dailyJob() {
  withLock_(function () {
    const today = ymd_(new Date());
    const sh = sheet_('Scadenze');
    const cols = TABS.Scadenze;
    const due = [];
    readTab_('Scadenze').forEach(function (r) {
      if (r.consumato === 'si' || r.ultimo_avviso === today) return;
      const giorni = daysBetween_(today, r.scadenza);
      const soglia = parseInt(r.avviso_giorni || '2', 10);
      if (giorni <= soglia) due.push({ r: r, giorni: giorni });
    });
    if (due.length) {
      due.sort(function (a, b) { return a.giorni - b.giorni; });
      const righe = due.map(function (d) {
        let quando;
        if (d.giorni < 0) quando = 'scaduto da ' + (-d.giorni) + (d.giorni === -1 ? ' giorno' : ' giorni');
        else if (d.giorni === 0) quando = 'scade oggi';
        else if (d.giorni === 1) quando = 'scade domani';
        else quando = 'scade tra ' + d.giorni + ' giorni';
        return d.r.prodotto + ': ' + quando;
      });
      const urgente = due[0].giorni <= 0;
      const ok = notify_('Scadenze in frigo', righe.join('\n'), { priority: urgente ? 4 : 3, tags: ['warning'] });
      if (ok) {
        due.forEach(function (d) {
          const at = findRow_(sh, d.r.id);
          if (at > 0) sh.getRange(at, cols.indexOf('ultimo_avviso') + 1).setValue(today);
        });
      }
    }
    cleanup_(today);
  });
}

function cleanup_(today) {
  const limiteSpesa = shiftDay_(today, -3);
  const limiteVecchi = shiftDay_(today, -30);
  deleteWhere_('Spesa', function (r) { return r.stato === 'comprato' && r.aggiornato.slice(0, 10) < limiteSpesa; });
  deleteWhere_('Scadenze', function (r) { return r.consumato === 'si' && r.creato.slice(0, 10) < limiteVecchi; });
  deleteWhere_('Promemoria', function (r) { return r.inviato === 'si' && r.quando.slice(0, 10) < limiteVecchi; });
  deleteWhere_('Eventi', function (r) { return r.data < shiftDay_(today, -180); });
}

function deleteWhere_(tab, pred) {
  const sh = sheet_(tab);
  const ids = readTab_(tab).filter(pred).map(function (r) { return r.id; });
  ids.forEach(function (id) {
    const at = findRow_(sh, id);
    if (at > 0) sh.deleteRow(at);
  });
}

/** Invia una notifica via email ai destinatari (Script Property EMAIL_DESTINATARI, separati da virgola). */
let NOTIFICA_ERRORE_ = '';

function notify_(title, message, opts) {
  NOTIFICA_ERRORE_ = '';
  try {
    const p = PropertiesService.getScriptProperties();
    const dest = p.getProperty('EMAIL_DESTINATARI') || Session.getEffectiveUser().getEmail();
    if (!dest) { NOTIFICA_ERRORE_ = 'nessun destinatario email (esegui setup)'; return false; }
    const link = p.getProperty('APP_URL');
    MailApp.sendEmail({
      to: dest,
      subject: 'Narrivu: ' + title,
      body: message + (link ? '\n\nApri Narrivu: ' + link : ''),
      name: 'Narrivu'
    });
    return true;
  } catch (err) {
    NOTIFICA_ERRORE_ = String(err && err.message || err).slice(0, 160);
    Logger.log('Email non inviata: ' + NOTIFICA_ERRORE_);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Utilità                                                             */
/* ------------------------------------------------------------------ */

function parseJson_(t) {
  try { return t ? JSON.parse(t) : {}; } catch (e) { return {}; }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

function randomString_(n) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  while (s.length < n) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}

function tz_() { return Session.getScriptTimeZone() || 'Europe/Rome'; }
function ymd_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function nowLocal_() { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm"); }

function shiftDay_(ymd, delta) {
  const p = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + delta));
  return d.toISOString().slice(0, 10);
}

function daysBetween_(fromYmd, toYmd) {
  const a = fromYmd.split('-').map(Number), b = toYmd.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
