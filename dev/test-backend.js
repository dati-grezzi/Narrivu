'use strict';
/* Test di Code.gs con servizi Google simulati.  Uso: node dev/test-backend.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const realCode = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const LOADER = process.env.LOADER === '1'; // LOADER=1: prova Loader.gs, che scarica Code.gs da GitHub (simulato)
const code = LOADER ? fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Loader.gs'), 'utf8') : realCode;

const pad = n => String(n).padStart(2, '0');
let clock = new Date(2026, 10, 15, 9, 0);
const fmt = (d, f) => f.replace("yyyy", d.getFullYear()).replace("MM", pad(d.getMonth() + 1)).replace("dd", pad(d.getDate()))
  .replace("HH", pad(d.getHours())).replace("mm", pad(d.getMinutes())).replace(/'/g, '');
class FakeDate extends Date { constructor(...a) { a.length ? super(...a) : super(+clock); } static now() { return +clock; } }

const cacheStore = {}; const fetches = []; const sheets = {}; const props = {}; const sent = []; const triggers = [];
function mkSheet(name) {
  const rows = [];
  const sh = {
    name, rows,
    getLastRow: () => rows.length, getLastColumn: () => (rows[0] || []).length,
    getRange(r, c, nr = 1, nc = 1) {
      const R = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
        setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = x); }); return R; },
        setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; return R; },
        setNumberFormat: () => R, setFontWeight: () => R, setBackground: () => R
      };
      return R;
    },
    appendRow: r => rows.push(r.slice()),
    deleteRow: i => rows.splice(i - 1, 1),
    setFrozenRows() {}, setColumnWidth() {}, autoResizeColumns() {}, getName: () => name,
    getMaxRows: () => 1000, getMaxColumns: () => 26, insertColumnsAfter() {}
  };
  return sh;
}
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = mkSheet(n)),
  getSheets: () => Object.values(sheets),
  deleteSheet() {}
};
const ctx = {
  console, Date: FakeDate, Math, JSON, String, Number, Array, Object, RegExp, Error, parseInt, parseFloat, isNaN, encodeURIComponent,
  Logger: { log: m => console.log('   [log]', m) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, getActive: () => ss, openById: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, setProperties: o => Object.assign(props, o) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, tryLock: () => true }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; }, getContent() { return t; } }) },
  Utilities: {
    getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, () => (Math.random() * 16 | 0).toString(16)),
    formatDate: (d, tz, f) => fmt(d, f),
    sleep: () => {}
  },
  Session: { getScriptTimeZone: () => 'Europe/Rome', getEffectiveUser: () => ({ getEmail: () => 'casa@example.com' }) },
  MailApp: { sendEmail: o => { sent.push({ body: { title: o.subject, message: o.body, to: o.to } }); } },
  ScriptApp: {
    getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/ABC/exec' }),
    getProjectTriggers: () => triggers, deleteTrigger() {},
    newTrigger: fn => { const t = { fn }; const b = { timeBased: () => b, everyMinutes: () => b, everyDays: () => b, atHour: () => b, nearMinute: () => b, create: () => (triggers.push(t), t) }; return b; }
  },
  CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] ?? null, put: (k, v) => { cacheStore[k] = v; }, removeAll: ks => ks.forEach(k => delete cacheStore[k]) }) },
  UrlFetchApp: { fetch: u => { fetches.push(u); if (!/raw\.githubusercontent\.com/.test(u)) throw new Error('URL inatteso ' + u); return { getResponseCode: () => 200, getContentText: () => realCode }; } }
};
vm.createContext(ctx); vm.runInContext(code, ctx);
const call = (req, post = true) => JSON.parse((post ? ctx.doPost({ postData: { contents: JSON.stringify(req) } }) : ctx.doGet({ parameter: req })).getContent());

let n = 0; const t = (name, fn) => { try { fn(); console.log('ok  ', name); n++; } catch (e) { console.log('FAIL', name, '\n    ', e.message); process.exitCode = 1; } };

ctx.setup();
const TOKEN = props.TOKEN;
t('setup crea schede, token e canale', () => {
  ['Eventi', 'Scadenze', 'Promemoria', 'Spesa', 'Abituali'].forEach(k => assert(sheets[k], 'manca ' + k));
  assert(TOKEN && TOKEN.length >= 20); assert.strictEqual(props.EMAIL_DESTINATARI, 'casa@example.com');
});
t('token errato rifiutato', () => assert.strictEqual(call({ token: 'x', action: 'list' }, false).ok, false));
t('list restituisce config e dati', () => { const r = call({ token: TOKEN, action: 'list' }, false); assert(r.ok && r.data.abituali.length > 0 && r.config.emailDestinatari); });
t('setEmail: salva e valida', () => {
  assert.strictEqual(call({ token: TOKEN, action: 'setEmail', emails: 'a@b.it, c@d.it' }, false).emailDestinatari, 'a@b.it, c@d.it');
  assert(!call({ token: TOKEN, action: 'setEmail', emails: 'nonvalida' }, false).ok);
  assert.strictEqual(props.EMAIL_DESTINATARI, 'a@b.it, c@d.it');
  call({ token: TOKEN, action: 'setEmail', emails: 'casa@example.com' }, false);
});
t('setColori: salva, valida, torna in list', () => {
  const r = call({ token: TOKEN, action: 'setColori', colori: { Alfio: '#bf4a0a', Lucia: '#C23B72', Altro: '#000000' } }, false);
  assert(r.ok && r.colori.Alfio === '#BF4A0A' && !r.colori.Altro);
  assert(!call({ token: TOKEN, action: 'setColori', colori: { Alfio: 'rosso' } }, false).ok);
  call({ token: TOKEN, action: 'setColori', colori: { Alfio: '#BF4A0A' } }, false);
  assert.strictEqual(call({ token: TOKEN, action: 'list' }, false).config.colori.Alfio, '#BF4A0A');
});
t('evento: crea e modifica', () => {
  const r = call({ token: TOKEN, action: 'upsert', tab: 'Eventi', row: { id: 'ev001', titolo: 'Dentista', data: '2026-11-16', ora: '17:30', per: 'Eddie', autore: 'Lucia' } });
  assert(r.ok && r.created);
  call({ token: TOKEN, action: 'upsert', tab: 'Eventi', row: { id: 'ev001', ora: '18:00' } });
  const e = call({ token: TOKEN, action: 'list' }, false).data.eventi.find(x => x.id === 'ev001');
  assert.strictEqual(e.ora, '18:00'); assert.strictEqual(e.titolo, 'Dentista'); assert.strictEqual(e.autore, 'Lucia');
});
t('evento: ora di fine valida e controllata', () => {
  assert(call({ token: TOKEN, action: 'upsert', tab: 'Eventi', row: { id: 'ev002', titolo: 'Riunione', data: '2026-11-17', ora: '15:00', ora_fine: '16:30', per: 'Famiglia', autore: 'Alfio' } }).ok);
  assert.strictEqual(call({ token: TOKEN, action: 'list' }, false).data.eventi.find(x => x.id === 'ev002').ora_fine, '16:30');
  assert.strictEqual(call({ token: TOKEN, action: 'upsert', tab: 'Eventi', row: { titolo: 'x', data: '2026-11-17', ora: '15:00', ora_fine: '14:00', per: 'Famiglia', autore: 'Alfio' } }).ok, false);
  assert.strictEqual(call({ token: TOKEN, action: 'upsert', tab: 'Eventi', row: { titolo: 'x', data: '2026-11-17', ora: '', ora_fine: '14:00', per: 'Famiglia', autore: 'Alfio' } }).ok, false);
  call({ token: TOKEN, action: 'remove', tab: 'Eventi', id: 'ev002' });
});
t('validazione: persona, data, autore', () => {
  assert.strictEqual(call({ token: TOKEN, action: 'upsert', tab: 'Eventi', row: { titolo: 'x', data: '2026-11-16', per: 'Nonno', autore: 'Alfio' } }).ok, false);
  assert.strictEqual(call({ token: TOKEN, action: 'upsert', tab: 'Eventi', row: { titolo: 'x', data: '16/11', per: 'Famiglia', autore: 'Alfio' } }).ok, false);
  assert.strictEqual(call({ token: TOKEN, action: 'upsert', tab: 'Eventi', row: { titolo: 'x', data: '2026-11-16', per: 'Famiglia', autore: 'Pino' } }).ok, false);
});
t('spesa: niente doppioni, ricompare se già comprato', () => {
  call({ token: TOKEN, action: 'upsert', tab: 'Spesa', row: { id: 'sp001', prodotto: 'Latte', autore: 'Alfio' } });
  call({ token: TOKEN, action: 'upsert', tab: 'Spesa', row: { id: 'sp001', stato: 'comprato' } });
  call({ token: TOKEN, action: 'upsert', tab: 'Spesa', row: { id: 'sp002', prodotto: 'latte', autore: 'Lucia' } });
  const sp = call({ token: TOKEN, action: 'list' }, false).data.spesa;
  assert.strictEqual(sp.length, 1); assert.strictEqual(sp[0].stato, 'da_comprare');
});
t('ops in batch + remove', () => {
  const r = call({ token: TOKEN, action: 'ops', ops: [
    { action: 'upsert', tab: 'Promemoria', row: { id: 'pr001', testo: 'Chiamare idraulico', quando: '2026-11-15T09:03', per: 'Famiglia', autore: 'Alfio' } },
    { action: 'upsert', tab: 'Scadenze', row: { id: 'sc001', prodotto: 'Yogurt', scadenza: '2026-11-17', avviso_giorni: '2', autore: 'Lucia' } },
    { action: 'remove', tab: 'Eventi', id: 'ev001' } ] });
  assert(r.ok && r.results.length === 3);
  assert.strictEqual(call({ token: TOKEN, action: 'list' }, false).data.eventi.length, 0);
});
t('checkReminders: invia una sola volta, solo se scaduto', () => {
  sent.length = 0;
  clock = new Date(2026, 10, 15, 9, 0); ctx.checkReminders(); assert.strictEqual(sent.length, 0, 'prima dell\'ora');
  clock = new Date(2026, 10, 15, 9, 5); ctx.checkReminders(); assert.strictEqual(sent.length, 1);
  assert(/idraulico/.test(sent[0].body.message + sent[0].body.title)); assert.strictEqual(sent[0].body.to, 'casa@example.com');
  ctx.checkReminders(); assert.strictEqual(sent.length, 1, 'doppio invio');
});
t('dailyJob: avvisa scadenza vicina, non due volte lo stesso giorno', () => {
  sent.length = 0; clock = new Date(2026, 10, 15, 8, 10);
  ctx.dailyJob(); const first = sent.length; assert(first >= 1, 'nessun avviso'); assert(sent.some(s => /Yogurt/.test(s.body.message)));
  ctx.dailyJob(); assert.strictEqual(sent.length, first, 'duplicato');
});
t('dailyJob: scadenza consumata non avvisa', () => {
  call({ token: TOKEN, action: 'upsert', tab: 'Scadenze', row: { id: 'sc001', consumato: 'si' } });
  sent.length = 0; clock = new Date(2026, 10, 16, 8, 10); ctx.dailyJob();
  assert(!sent.some(s => /Yogurt/.test(s.body.message)));
});
t('showSetup stampa i link', () => ctx.showSetup());
if (LOADER) t('loader: scarica Code.gs una sola volta (cache)', () => assert.strictEqual(fetches.length, 1, 'download: ' + fetches.length));
console.log(n + ' test superati');
