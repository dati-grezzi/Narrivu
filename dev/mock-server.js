'use strict';
/* Server di prova: serve l'app web e simula l'API di Apps Script con dati finti.
   Uso:  node dev/mock-server.js   poi apri
         http://localhost:8080/#api=http://localhost:8080/api&t=dev&mode=display
         http://localhost:8080/#api=http://localhost:8080/api&t=dev&mode=phone&who=Alfio */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const TOKEN = 'dev';
const WEB = path.join(__dirname, '..');
const PERSONE = ['Famiglia', 'Alfio', 'Lucia', 'Eddie', 'Zaja'];
const AUTORI = ['Alfio', 'Lucia'];
const KEY = { Eventi: 'eventi', Scadenze: 'scadenze', Promemoria: 'promemoria', Spesa: 'spesa', Abituali: 'abituali' };

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const now = () => { const d = new Date(); return ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
let seq = 0;
const id = () => 'm' + (++seq).toString(36).padStart(5, '0');

const db = {
  eventi: [
    { id: id(), titolo: 'Dentista', data: day(0), ora: '17:30', ora_fine: '18:30', per: 'Eddie', autore: 'Lucia', note: '', creato: now() },
    { id: id(), titolo: 'Cena dai nonni', data: day(0), ora: '20:00', per: 'Famiglia', autore: 'Alfio', note: '', creato: now() },
    { id: id(), titolo: 'Nuoto', data: day(1), ora: '16:00', per: 'Zaja', autore: 'Lucia', note: 'Portare la cuffia', creato: now() },
    { id: id(), titolo: 'Colloquio', data: day(1), ora: '10:30', ora_fine: '11:15', per: 'Lucia', autore: 'Lucia', note: '', creato: now() },
    { id: id(), titolo: 'Veterinario', data: day(2), ora: '09:15', per: 'Zaja', autore: 'Alfio', note: 'Vaccino', creato: now() },
    { id: id(), titolo: 'Festa di Matteo', data: day(3), ora: '', per: 'Eddie', autore: 'Lucia', note: '', creato: now() },
    { id: id(), titolo: 'Consiglio di classe', data: day(4), ora: '15:00', per: 'Famiglia', autore: 'Alfio', note: '', creato: now() },
    { id: id(), titolo: 'Spesa grande', data: day(5), ora: '', per: 'Famiglia', autore: 'Alfio', note: '', creato: now() },
    { id: id(), titolo: 'Gita al mare', data: day(6), ora: '09:00', per: 'Famiglia', autore: 'Lucia', note: '', creato: now() }
  ],
  scadenze: [
    { id: id(), prodotto: 'Yogurt greco', scadenza: day(-1), avviso_giorni: '2', autore: 'Lucia', creato: now(), consumato: '', ultimo_avviso: '' },
    { id: id(), prodotto: 'Prosciutto cotto', scadenza: day(0), avviso_giorni: '2', autore: 'Alfio', creato: now(), consumato: '', ultimo_avviso: '' },
    { id: id(), prodotto: 'Latte fresco', scadenza: day(2), avviso_giorni: '2', autore: 'Lucia', creato: now(), consumato: '', ultimo_avviso: '' },
    { id: id(), prodotto: 'Mozzarella', scadenza: day(3), avviso_giorni: '2', autore: 'Alfio', creato: now(), consumato: '', ultimo_avviso: '' },
    { id: id(), prodotto: 'Succo di mela', scadenza: day(9), avviso_giorni: '2', autore: 'Lucia', creato: now(), consumato: '', ultimo_avviso: '' }
  ],
  promemoria: [
    { id: id(), testo: 'Portare il certificato medico', quando: day(1) + 'T08:00', per: 'Eddie', autore: 'Lucia', creato: now(), inviato: '' },
    { id: id(), testo: 'Chiamare l\'idraulico', quando: day(0) + 'T09:00', per: 'Famiglia', autore: 'Alfio', creato: now(), inviato: 'si' },
    { id: id(), testo: 'Iscrizione al corso', quando: day(3) + 'T18:00', per: 'Lucia', autore: 'Lucia', creato: now(), inviato: '' }
  ],
  spesa: [
    { id: id(), prodotto: 'Latte', stato: 'da_comprare', autore: 'Lucia', creato: now(), aggiornato: now() },
    { id: id(), prodotto: 'Pane', stato: 'da_comprare', autore: 'Alfio', creato: now(), aggiornato: now() },
    { id: id(), prodotto: 'Detersivo piatti', stato: 'da_comprare', autore: 'Lucia', creato: now(), aggiornato: now() },
    { id: id(), prodotto: 'Pomodori', stato: 'da_comprare', autore: 'Lucia', creato: now(), aggiornato: now() },
    { id: id(), prodotto: 'Crocchette per Zaja', stato: 'da_comprare', autore: 'Alfio', creato: now(), aggiornato: now() },
    { id: id(), prodotto: 'Caffè', stato: 'comprato', autore: 'Alfio', creato: now(), aggiornato: now() }
  ],
  abituali: ['Latte', 'Pane', 'Uova', 'Pasta', 'Carta igienica', 'Detersivo piatti', 'Caffè', 'Frutta'].map(p => ({ id: id(), prodotto: p }))
};

function sanitize(tab, row) {
  const ok = {
    Eventi: ['titolo', 'data', 'ora', 'ora_fine', 'per', 'autore', 'note'],
    Scadenze: ['prodotto', 'scadenza', 'avviso_giorni', 'autore', 'consumato'],
    Promemoria: ['testo', 'quando', 'per', 'autore'],
    Spesa: ['prodotto', 'stato', 'autore'],
    Abituali: ['prodotto']
  }[tab];
  if (!ok) throw new Error('Tab non valida');
  const out = {};
  ok.forEach(k => {
    if (row[k] == null) return;
    const v = String(row[k]).trim().slice(0, 200);
    if ((k === 'data' || k === 'scadenza') && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Data non valida');
    if ((k === 'ora' || k === 'ora_fine') && v && !/^\d{2}:\d{2}$/.test(v)) throw new Error('Ora non valida');
    if (k === 'quando' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error('Data e ora non valide');
    if (k === 'per' && !PERSONE.includes(v)) throw new Error('Destinatario non valido');
    if (k === 'autore' && !AUTORI.includes(v)) throw new Error('Autore non valido');
    out[k] = k === 'consumato' ? (v === 'si' ? 'si' : '') : v;
  });
  return out;
}

function upsert(tab, row) {
  const list = db[KEY[tab]];
  const clean = sanitize(tab, row || {});
  const i = list.findIndex(r => r.id === row.id);
  if (i >= 0) {
    Object.assign(list[i], clean);
    if (tab === 'Spesa') list[i].aggiornato = now();
    return { ok: true, id: row.id, created: false };
  }
  if (tab === 'Spesa' || tab === 'Abituali') {
    const same = list.find(r => r.prodotto.toLowerCase() === String(clean.prodotto || '').toLowerCase());
    if (same) { if (tab === 'Spesa') { same.stato = 'da_comprare'; same.aggiornato = now(); } return { ok: true, id: same.id, created: false }; }
  }
  const o = { id: row.id || id(), creato: now(), ...clean };
  if (tab === 'Spesa') Object.assign(o, { stato: o.stato || 'da_comprare', aggiornato: now() });
  if (tab === 'Scadenze') Object.assign(o, { avviso_giorni: o.avviso_giorni || '2', consumato: '', ultimo_avviso: '' });
  if (tab === 'Promemoria') o.inviato = '';
  list.push(o);
  return { ok: true, id: o.id, created: true };
}

function handle(req) {
  if (req.token !== TOKEN) return { ok: false, error: 'Token non valido' };
  try {
    if (req.action === 'setColori') { db.__colori = req.colori || {}; return { ok: true, colori: db.__colori }; }
    if (req.action === 'list') return { ok: true, now: now(), config: { emailDestinatari: 'casa@example.com', colori: db.__colori || {} }, data: db };
    if (req.action === 'ops') return { ok: true, results: req.ops.map(op => op.action === 'remove' ? (db[KEY[op.tab]] = db[KEY[op.tab]].filter(r => r.id !== op.id), { ok: true }) : upsert(op.tab, op.row)) };
    if (req.action === 'test') return { ok: true };
    return { ok: false, error: 'Azione sconosciuta' };
  } catch (e) { return { ok: false, error: e.message }; }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

http.createServer((rq, rs) => {
  const url = new URL(rq.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (url.pathname === '/api') {
    if (rq.method === 'OPTIONS') { rs.writeHead(204, cors); return rs.end(); }
    const send = obj => { rs.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); rs.end(JSON.stringify(obj)); };
    if (rq.method === 'POST') {
      let b = ''; rq.on('data', c => b += c);
      rq.on('end', () => { try { send(handle(JSON.parse(b || '{}'))); } catch (e) { send({ ok: false, error: 'JSON non valido' }); } });
      return;
    }
    return send(handle(Object.fromEntries(url.searchParams)));
  }
  let p = path.normalize(path.join(WEB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!p.startsWith(WEB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); return rs.end('Non trovato'); }
  rs.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(rs);
}).listen(PORT, () => console.log('Planner di prova su http://localhost:' + PORT));
