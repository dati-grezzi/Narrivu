'use strict';
const LOGO = '<svg class="logo" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="22" fill="#D8E8D2"/><defs><clipPath id="nvh"><path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z"/><path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z"/><path d="M4 6h2v3L4 11z"/><path d="M10 1c0 1.66-1.34 3-3 3-.55 0-1 .45-1 1H4c0-1.66 1.34-3 3-3 .55 0 1-.45 1-1h2z"/></clipPath></defs><g transform="rotate(-13 44 52) translate(10.4 21.5) scale(2.8)"><g clip-path="url(#nvh)"><rect x="0" y="0" width="12" height="12.5" fill="#D9412F"/><rect x="12" y="0" width="12" height="12.5" fill="#F08A1D"/><rect x="0" y="12.5" width="12" height="12" fill="#F5C92E"/><rect x="12" y="12.5" width="12" height="12" fill="#2E9E62"/></g></g><g fill="none" stroke="#16424A" stroke-width="3.6" stroke-linecap="round"><path d="M77.5 36.4A37 37 0 0 1 81.0 52.6"/><path d="M80.4 25.5A45 45 0 0 1 88.0 61.4"/></g></svg>';
/* Narrivu — app web per tablet e telefoni. Licenza: GPL-3.0 */

const PERSONE = ['Famiglia', 'Alfio', 'Lucia', 'Eddie', 'Zaja'];
const AUTORI = ['Alfio', 'Lucia'];
const KEY = { Eventi: 'eventi', Scadenze: 'scadenze', Promemoria: 'promemoria', Spesa: 'spesa', Abituali: 'abituali' };
const LS_CFG = 'planner.cfg', LS_CACHE = 'planner.cache', LS_QUEUE = 'planner.queue';
const SYNC_MS = 45000;
const VERSION = 'v18'; // tenere uguale a CACHE in sw.js

/* ---------- utilità ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const slug = p => String(p).toLowerCase();
function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* spazio esaurito o navigazione privata */ } }
function rid() { const a = new Uint8Array(6); crypto.getRandomValues(a); return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10); }

function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function diffDays(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 864e5); }
function nowLocal() { const d = new Date(); return ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
const fmtDow = new Intl.DateTimeFormat('it-IT', { weekday: 'long' });
const fmtDowShort = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });
const fmtDM = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const dowShort = s => fmtDowShort.format(parseYmd(s)).replace('.', '');

function dayLabel(s, today) {
  const n = diffDays(today, s);
  if (n === 0) return 'Oggi';
  if (n === 1) return 'Domani';
  return fmtShort.format(parseYmd(s)).replace('.', '');
}
function whenLabel(q, today) { // q = "YYYY-MM-DDTHH:MM"
  return dayLabel(q.slice(0, 10), today).toLowerCase() + ' alle ' + q.slice(11, 16);
}

const ICON = {
  agenda: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 1.5h-15L6 17zM10 21h4"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2.5l2 11h10.5l2-8H6.5"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/></svg>'
};
const ico = n => '<span class="ico" aria-hidden="true">' + ICON[n] + '</span>';

/* ---------- stato ---------- */
const emptyData = () => ({ eventi: [], scadenze: [], promemoria: [], spesa: [], abituali: [] });
const state = {
  cfg: load(LS_CFG, null),
  data: emptyData(),
  config: {},
  lastSync: null,
  online: true,
  err: '',
  authError: false,
  tab: 'agenda'
};
let queue = load(LS_QUEUE, []);
const cached = load(LS_CACHE, null);
if (cached && cached.data) { state.data = { ...emptyData(), ...cached.data }; state.config = cached.config || {}; state.lastSync = cached.lastSync || null; }

/* ---------- rete ---------- */
async function apiGet(action) {
  const u = new URL(state.cfg.api);
  u.searchParams.set('token', state.cfg.token);
  u.searchParams.set('action', action);
  u.searchParams.set('_', Date.now()); // evita la cache senza aggiungere intestazioni (niente richiesta preliminare CORS)
  const res = await fetch(u);
  return res.json();
}
async function apiPost(body) {
  const res = await fetch(state.cfg.api, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita la richiesta preliminare CORS
    body: JSON.stringify({ token: state.cfg.token, ...body })
  });
  return res.json();
}

function applyOp(data, op) {
  const k = KEY[op.tab];
  if (!k) return;
  if (op.action === 'remove') { data[k] = data[k].filter(r => r.id !== op.id); return; }
  const row = {};
  Object.keys(op.row).forEach(f => { row[f] = String(op.row[f]); });
  const i = data[k].findIndex(r => r.id === row.id);
  if (i >= 0) { data[k][i] = { ...data[k][i], ...row }; return; }
  const base = { creato: nowLocal() };
  if (op.tab === 'Spesa') Object.assign(base, { stato: 'da_comprare', aggiornato: nowLocal() });
  if (op.tab === 'Scadenze') Object.assign(base, { avviso_giorni: '2', consumato: '' });
  data[k].push({ ...base, ...row });
}

function persist() { save(LS_CACHE, { data: state.data, config: state.config, lastSync: state.lastSync }); }

function enqueue(op) {
  applyOp(state.data, op);
  queue.push(op);
  save(LS_QUEUE, queue);
  persist();
  render();
  flush();
}
const upsert = (tab, row) => enqueue({ action: 'upsert', tab, row });
const remove = (tab, id) => enqueue({ action: 'remove', tab, id });

let flushing = false;
async function flush() {
  if (flushing || !queue.length || !state.cfg) return;
  flushing = true;
  const batch = queue.slice();
  try {
    const r = await apiPost({ action: 'ops', ops: batch });
    setOnline(true);
    if (!r.ok && r.error === 'Token non valido') { state.authError = true; flushing = false; render(); return; }
    queue = queue.slice(batch.length);
    save(LS_QUEUE, queue);
    if (!r.ok) toast('Non salvato: ' + r.error);
  } catch (e) {
    setOnline(false); // resta in coda, riprova alla prossima sincronizzazione
    flushing = false;
    return;
  }
  flushing = false;
  await refresh();
  if (queue.length) flush();
}

async function refresh() {
  if (!state.cfg) return;
  if (queue.length && !flushing) { await flush(); return; }
  let r;
  try { r = await apiGet('list'); }
  catch (e) { state.err = 'rete'; setOnline(false); return; }
  if (!r.ok) {
    if (r.error === 'Token non valido') { state.authError = true; render(); return; }
    state.err = 'foglio: ' + r.error; setOnline(false); return;
  }
  try {
    state.authError = false;
    const data = { ...emptyData(), ...r.data };
    queue.forEach(op => applyOp(data, op));
    state.data = data;
    const oldColori = state.config && state.config.colori;
    state.config = r.config || {};
    if (!state.config.colori || !Object.keys(state.config.colori).length) { if (oldColori) state.config.colori = oldColori; }
    state.lastSync = Date.now();
    state.err = '';
    setOnline(true);
    persist();
    render();
  } catch (e) {
    console.error(e);
    state.err = 'app: ' + (e && e.message || e);
    setOnline(false);
  }
}

function setOnline(v) {
  state.online = v;
  const el = $('#sync');
  if (el) paintSync(el);
}

/* ---------- avvio ---------- */
function readHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  const p = new URLSearchParams(h);
  if (p.get('api') && p.get('t')) {
    state.cfg = {
      api: p.get('api'),
      token: p.get('t'),
      mode: p.get('mode') === 'display' ? 'display' : 'phone',
      autore: AUTORI.includes(p.get('who')) ? p.get('who') : null
    };
    save(LS_CFG, state.cfg);
  }
  history.replaceState(null, '', location.pathname + location.search);
}

function boot() {
  readHash();
  render();
  if ('serviceWorker' in navigator) {
    // Quando arriva una versione nuova, ricarica da sola (una volta) invece di restare su quella vecchia.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !state.sheet) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (state.cfg) refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, SYNC_MS);
  setInterval(() => { if (isDisplay()) render(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); wake(); } });
  window.addEventListener('online', () => refresh());
  wake();
}

let wakeLock = null;
async function wake() {
  if (!isDisplay() || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* non concesso */ }
}

const isDisplay = () => !!(state.cfg && state.cfg.mode === 'display' && !state.authError);

/* ---------- rendering ---------- */
/* ---------- colori delle etichette ---------- */
const PALETTE = ['#1E6670', '#3A5BA8', '#BF4A0A', '#C23B72', '#E8A020', '#267A4A', '#7B4EA3', '#B3261E', '#5B6770'];
const COLORI_DEFAULT = { Famiglia: '#1E6670', Alfio: '#BF4A0A', Lucia: '#C23B72', Eddie: '#E8A020', Zaja: '#267A4A' };
const luminance = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const colorOf = p => ((state.config && state.config.colori) || {})[p] || COLORI_DEFAULT[p];
function applyColors() {
  const css = PERSONE.map(p => {
    const bg = colorOf(p), white = 1.05 / (luminance(bg) + 0.05) >= 4.5;
    return `.p-${slug(p)} { --pc: ${bg}; --pt: ${white ? '#fff' : '#16424A'}; --au: ${white ? 'rgba(255,255,255,.26)' : 'rgba(22,66,74,.16)'}; }`;
  }).join('\n');
  let el = document.getElementById('pcolors');
  if (!el) { el = document.createElement('style'); el.id = 'pcolors'; document.head.appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}
let colorTimer = null;
function saveColors() {
  clearTimeout(colorTimer);
  colorTimer = setTimeout(() => {
    apiPost({ action: 'setColori', colori: state.config.colori || {} })
      .then(r => { if (!r.ok) toast(r.error === 'Azione sconosciuta' ? 'Colori salvati solo su questo telefono: aggiorna lo script.' : 'Colori non salvati: ' + r.error); })
      .catch(() => toast('Nessuna rete: colori salvati solo su questo telefono.'));
  }, 600);
}
function colorsFieldset() {
  return `<fieldset><legend>Colori delle etichette</legend>${PERSONE.map(p => `<div class="colrow"><span class="mag mini p-${slug(p)}">${esc(p)}</span>
    <div class="swatches">${PALETTE.map(c => `<button type="button" class="sw ${colorOf(p).toUpperCase() === c ? 'on' : ''}" style="background:${c}" data-act="set-color" data-person="${esc(p)}" data-color="${c}" aria-label="${esc(p)}: colore ${c}"></button>`).join('')}</div></div>`).join('')}</fieldset>`;
}

function render() {
  const root = $('#root');
  if (state.sheet) { state.dirty = true; const sy = $('#sync'); if (sy) paintSync(sy); return; } // si ridisegna alla chiusura
  applyColors();
  document.documentElement.classList.toggle('mode-display', isDisplay());
  if (!state.cfg || state.authError) { root.innerHTML = setupView(); return; }
  if (isDisplay()) { renderDisplay(); return; }
  renderPhone();
}

/* Collegamento al tablet o al telefono (prima configurazione) */
function setupView() {
  const c = state.cfg || {};
  return `<main class="setup">
    <h1>${LOGO}Narrivu <small class="ver">${VERSION}</small></h1>
    <p>${state.authError ? 'Il token non è più valido. Inseriscilo di nuovo.' : 'Collega l\'app al foglio di casa. Se hai ricevuto un link già pronto, aprilo e basta.'}</p>
    <form data-form="setup">
      <label>Indirizzo API<input name="api" type="url" required placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.api || '')}"></label>
      <label>Token<input name="token" type="text" required autocomplete="off" value="${esc(c.token || '')}"></label>
      <fieldset><legend>Questo dispositivo è</legend>
        <div class="seg two">
          <label><input type="radio" name="mode" value="phone" ${c.mode !== 'display' ? 'checked' : ''}><span>Un telefono</span></label>
          <label><input type="radio" name="mode" value="display" ${c.mode === 'display' ? 'checked' : ''}><span>Il tablet</span></label>
        </div>
      </fieldset>
      <fieldset><legend>Chi sei (solo telefono)</legend>
        <div class="seg two">${AUTORI.map(a => `<label><input type="radio" name="who" value="${a}" ${c.autore === a ? 'checked' : ''}><span>${a}</span></label>`).join('')}</div>
      </fieldset>
      <button class="btn primary" type="submit">Collega</button>
    </form>
  </main>`;
}

/* ----- tablet ----- */
function isNight(d) {
  if (state.cfg && state.cfg.night === 'off') return false;
  const h = d.getHours();
  return h >= 23 || h < 6;
}

function dayItems(day, now) {
  const items = [];
  state.data.eventi.filter(e => e.data === day).forEach(e => {
    items.push({ kind: 'ev', time: e.ora, title: e.titolo, per: e.per, autore: e.autore, past: day === ymd(now) && e.ora && e.ora < pad(now.getHours()) + ':' + pad(now.getMinutes()) });
  });
  state.data.promemoria.filter(r => r.quando.slice(0, 10) === day).forEach(r => {
    items.push({ kind: 'rem', time: r.quando.slice(11, 16), title: r.testo, per: r.per, autore: r.autore, past: r.inviato === 'si' });
  });
  items.sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title, 'it'));
  return items;
}

function chip(it) {
  const time = it.time ? `<span class="t">${esc(it.time)}</span>` : '';
  const bell = it.kind === 'rem' ? ico('bell') : '';
  return `<span class="mag p-${slug(it.per)} ${it.kind} ${it.past ? 'past' : ''}">
    <span class="au" title="Inserito da ${esc(it.autore)}">${esc((it.autore || '?')[0])}</span>${bell}${time}<span class="tx">${esc(it.title)}</span></span>`;
}

function expiry(days) {
  if (days < 0) return { txt: days === -1 ? 'scaduto ieri' : 'scaduto da ' + (-days) + ' gg', cls: 'late' };
  if (days === 0) return { txt: 'oggi', cls: 'late' };
  if (days === 1) return { txt: 'domani', cls: 'soon' };
  if (days <= 3) return { txt: 'tra ' + days + ' gg', cls: 'soon' };
  return { txt: 'tra ' + days + ' gg', cls: 'ok' };
}

function paintSync(el) {
  if (state.online) { el.className = 'sync ok'; el.title = 'Aggiornato'; el.textContent = ''; }
  else {
    el.className = 'sync off';
    const t = state.lastSync ? new Date(state.lastSync) : null;
    const er = state.err && state.err !== 'rete' ? state.err : '';
    el.title = er || 'Nessuna risposta dal server';
    el.textContent = er ? 'errore ' + er.slice(0, 70)
      : (t ? 'senza rete, dati delle ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) : 'senza rete');
  }
}

function renderDisplay() {
  const now = new Date();
  const today = ymd(now);
  document.body.classList.toggle('night', isNight(now));

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const rows = days.map((day, i) => {
    const items = dayItems(day, now);
    const cap = i === 0 ? 8 : 4;
    const shown = items.slice(0, cap).map(chip).join('');
    const more = items.length > cap ? `<span class="more">+${items.length - cap} altri</span>` : '';
    const empty = !items.length ? '<span class="none">libero</span>' : '';
    return `<div class="day ${i === 0 ? 'today' : ''}">
      <div class="dl"><span class="dw">${esc(i === 0 ? 'oggi' : dowShort(day))}</span><span class="dn">${parseYmd(day).getDate()}</span></div>
      <div class="items">${shown}${more}${empty}</div></div>`;
  }).join('');

  const scad = state.data.scadenze.filter(s => s.consumato !== 'si')
    .map(s => ({ ...s, giorni: diffDays(today, s.scadenza) }))
    .sort((a, b) => a.giorni - b.giorni || a.prodotto.localeCompare(b.prodotto, 'it'));
  const scadRows = scad.slice(0, 7).map(s => {
    const e = expiry(s.giorni);
    return `<li class="${e.cls}"><span class="nm">${esc(s.prodotto)}</span><span class="bd">${esc(e.txt)}</span></li>`;
  }).join('');
  const scadMore = scad.length > 7 ? `<li class="more">+${scad.length - 7} altri</li>` : '';

  const spesa = state.data.spesa.filter(s => s.stato === 'da_comprare')
    .sort((a, b) => (a.creato || '').localeCompare(b.creato || ''));
  const spesaRows = spesa.slice(0, 12).map(s => `<li>${esc(s.prodotto)}</li>`).join('');
  const spesaMore = spesa.length > 12 ? `<li class="more">+${spesa.length - 12} altri</li>` : '';

  $('#root').innerHTML = `<main class="display">
    <header class="top" data-hold="settings">
      <div class="date"><span class="dow">${esc(fmtDow.format(now))}</span> <span class="dm">${esc(fmtDM.format(now))}</span></div>
      <div class="clock">${pad(now.getHours())}:${pad(now.getMinutes())}</div>
      <div id="sync" class="sync"></div>
    </header>
    <section class="week" aria-label="Prossimi sette giorni">${rows}
      <footer class="legend" aria-label="Legenda">
        ${PERSONE.map(p => `<span class="mag mini p-${slug(p)}">${esc(p)}</span>`).join('')}
        <span class="mag mini rem p-famiglia">${ico('bell')}promemoria</span>
      </footer>
    </section>
    <aside class="side">
      <section class="panel scad"><h2>Scadenze <small>${scad.length}</small></h2>
        <ul>${scadRows || '<li class="none">Niente in scadenza.</li>'}${scadMore}</ul></section>
      <section class="panel spesa"><h2>Spesa <small>${spesa.length}</small></h2>
        <ul>${spesaRows || '<li class="none">La lista è vuota.</li>'}${spesaMore}</ul></section>
    </aside>
  </main>${sheetShell()}`;
  paintSync($('#sync'));
}

/* ----- telefono ----- */
const TABS = [
  { id: 'agenda', label: 'Agenda', icon: 'agenda' },
  { id: 'promemoria', label: 'Promemoria', icon: 'bell' },
  { id: 'scadenze', label: 'Scadenze', icon: 'clock' },
  { id: 'spesa', label: 'Spesa', icon: 'cart' }
];

function renderPhone() {
  const scrollY = $('#view') ? $('#view').scrollTop : 0;
  const who = (state.cfg.autore) || 'Chi sei?';
  const showFab = state.tab !== 'spesa';
  $('#root').innerHTML = `<div class="phone">
    <header class="bar"><h1>${LOGO}Narrivu <small class="ver">${VERSION}</small></h1><span id="sync" class="sync"></span>
      <button class="who" data-act="settings">${esc(who)} ${ico('gear')}</button></header>
    <main id="view" class="view">${phoneView()}</main>
    ${showFab ? `<button class="fab" data-act="add" aria-label="Aggiungi">${ico('plus')}</button>` : ''}
    <nav class="tabs">${TABS.map(t => `<button class="${state.tab === t.id ? 'on' : ''}" data-act="tab" data-tab="${t.id}">${ico(t.icon)}<span>${t.label}</span></button>`).join('')}</nav>
  </div>${sheetShell()}`;
  paintSync($('#sync'));
  if ($('#view')) $('#view').scrollTop = scrollY;
}

function phoneView() {
  const today = ymd(new Date());
  switch (state.tab) {
    case 'agenda': return viewAgenda(today);
    case 'promemoria': return viewPromemoria(today);
    case 'scadenze': return viewScadenze(today);
    default: return viewSpesa();
  }
}

const empty = (t, s) => `<div class="empty"><strong>${esc(t)}</strong><span>${esc(s)}</span></div>`;
const personTag = p => `<span class="tag p-${slug(p)}">${esc(p)}</span>`;

function viewAgenda(today) {
  const evs = state.data.eventi.filter(e => e.data >= today)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.ora || '').localeCompare(b.ora || '') || a.titolo.localeCompare(b.titolo, 'it'));
  if (!evs.length) return empty('Nessun impegno in programma.', 'Tocca + per aggiungere il primo.');
  let html = '', cur = '';
  evs.forEach(e => {
    if (e.data !== cur) { cur = e.data; html += `<h2 class="dayh">${esc(dayLabel(cur, today))}</h2>`; }
    html += `<button class="row p-${slug(e.per)}" data-act="edit-ev" data-id="${esc(e.id)}">
      <span class="when">${esc(e.ora || 'tutto il giorno')}</span>
      <span class="main"><strong>${esc(e.titolo)}</strong>${e.note ? `<em>${esc(e.note)}</em>` : ''}</span>
      <span class="meta">${personTag(e.per)}<small>da ${esc(e.autore)}</small></span></button>`;
  });
  return html;
}

function viewPromemoria(today) {
  const now = nowLocal();
  const list = state.data.promemoria.slice().sort((a, b) => a.quando.localeCompare(b.quando));
  const next = list.filter(r => r.inviato !== 'si');
  const done = list.filter(r => r.inviato === 'si').reverse().slice(0, 5);
  if (!next.length && !done.length) return empty('Nessun promemoria.', 'Tocca + per crearne uno: arriverà come notifica sul telefono.');
  const row = r => `<button class="row p-${slug(r.per)} ${r.inviato === 'si' ? 'past' : ''}" data-act="edit-rem" data-id="${esc(r.id)}">
      <span class="when">${ico('bell')}</span>
      <span class="main"><strong>${esc(r.testo)}</strong><em>${esc(whenLabel(r.quando, today))}${r.quando < now && r.inviato !== 'si' ? ', in attesa di invio' : ''}</em></span>
      <span class="meta">${personTag(r.per)}<small>da ${esc(r.autore)}</small></span></button>`;
  return (next.length ? next.map(row).join('') : empty('Nessun promemoria in programma.', 'Tocca + per crearne uno.'))
    + (done.length ? `<h2 class="dayh">Già inviati</h2>${done.map(row).join('')}` : '');
}

function viewScadenze(today) {
  const list = state.data.scadenze.filter(s => s.consumato !== 'si')
    .map(s => ({ ...s, giorni: diffDays(today, s.scadenza) }))
    .sort((a, b) => a.giorni - b.giorni || a.prodotto.localeCompare(b.prodotto, 'it'));
  if (!list.length) return empty('Niente in scadenza.', 'Tocca + per segnare la data di un prodotto.');
  return list.map(s => {
    const e = expiry(s.giorni);
    return `<div class="row split">
      <button class="grow" data-act="edit-sc" data-id="${esc(s.id)}">
        <span class="badge ${e.cls}">${esc(e.txt)}</span>
        <span class="main"><strong>${esc(s.prodotto)}</strong><em>${esc(fmtShort.format(parseYmd(s.scadenza)).replace('.', ''))}, avviso ${esc(s.avviso_giorni || '2')} gg prima</em></span></button>
      <button class="btn small" data-act="done-sc" data-id="${esc(s.id)}">Tolto</button></div>`;
  }).join('');
}

function viewSpesa() {
  const items = state.data.spesa;
  const open = items.filter(s => s.stato === 'da_comprare').sort((a, b) => (a.creato || '').localeCompare(b.creato || ''));
  const bought = items.filter(s => s.stato === 'comprato');
  const inList = new Set(open.map(s => s.prodotto.toLowerCase()));
  const usuals = state.data.abituali.slice().sort((a, b) => a.prodotto.localeCompare(b.prodotto, 'it'));
  return `<section class="block"><h2 class="dayh">È finito?</h2>
      <div class="chips">${usuals.map(u => `<button class="chipbtn ${inList.has(u.prodotto.toLowerCase()) ? 'on' : ''}" data-act="finito" data-p="${esc(u.prodotto)}">${inList.has(u.prodotto.toLowerCase()) ? ico('check') : ''}${esc(u.prodotto)}</button>`).join('') || '<em class="hint">Aggiungi i prodotti che finiscono più spesso dalle impostazioni.</em>'}</div>
      <form class="inline" data-form="spesa-add"><input name="prodotto" placeholder="Altro prodotto" autocomplete="off" required><button class="btn primary" type="submit">Aggiungi</button></form></section>
    <section class="block"><h2 class="dayh">Da comprare <small>${open.length}</small></h2>
      ${open.length ? open.map(s => `<label class="check"><input type="checkbox" data-act="buy" data-id="${esc(s.id)}"><span class="box">${ico('check')}</span><span class="tx">${esc(s.prodotto)}</span></label>`).join('') : '<p class="hint">La lista è vuota. Tocca un prodotto qui sopra quando finisce.</p>'}</section>
    ${bought.length ? `<section class="block"><h2 class="dayh">Presi <button class="btn small" data-act="clear-bought">Togli i presi</button></h2>
      ${bought.map(s => `<label class="check done"><input type="checkbox" checked data-act="unbuy" data-id="${esc(s.id)}"><span class="box">${ico('check')}</span><span class="tx">${esc(s.prodotto)}</span></label>`).join('')}</section>` : ''}`;
}

/* ---------- finestre (form) ---------- */
function sheetShell() { return '<div id="sheetRoot"></div>'; }

function openSheet(spec) {
  state.sheet = spec;
  restoreSheet();
}
function closeSheet() {
  state.sheet = null;
  const r = $('#sheetRoot');
  if (r) r.innerHTML = '';
  document.body.classList.remove('sheet-open');
  if (state.dirty) { state.dirty = false; render(); }
}
function restoreSheet() {
  const r = $('#sheetRoot'), s = state.sheet;
  if (!r || !s) return;
  if (r.querySelector('.sheet')) return; // già aperta: non ricostruire mentre scrivi
  r.innerHTML = `<div class="backdrop" data-act="close"></div>
    <form class="sheet" data-form="sheet" role="dialog" aria-label="${esc(s.title)}">
      <header><h2>${esc(s.title)}</h2><button type="button" class="x" data-act="close" aria-label="Chiudi">${ico('x')}</button></header>
      <div class="body">${typeof s.body === 'function' ? s.body() : s.body}</div>
      <footer>${s.onDelete ? '<button type="button" class="btn danger" data-act="sheet-delete">Elimina</button>' : ''}
        ${s.submit === null ? '' : `<button type="submit" class="btn primary">${esc(s.submit || 'Salva')}</button>`}</footer>
    </form>`;
  document.body.classList.add('sheet-open');
  const first = r.querySelector('input[type=text],input:not([type]),input[type=url]');
  if (first && !s.noFocus) setTimeout(() => first.focus(), 60);
}

const personPicker = (name, value) => `<div class="seg">${PERSONE.map(p =>
  `<label class="p-${slug(p)}"><input type="radio" name="${name}" value="${p}" ${p === value ? 'checked' : ''}><span>${p}</span></label>`).join('')}</div>`;

// Se il telefono non sa ancora chi sei (link senza «who»), il modulo lo chiede e se lo ricorda.
const whoFieldset = () => state.cfg.autore ? '' : `<fieldset><legend>Chi sei</legend><div class="seg two">${AUTORI.map(a => `<label><input type="radio" name="who" value="${a}" required><span>${a}</span></label>`).join('')}</div></fieldset>`;
function rememberWho(f) { if (f.who && AUTORI.includes(f.who) && !state.cfg.autore) { state.cfg.autore = f.who; save(LS_CFG, state.cfg); } }

function addEvent(e) {
  const today = ymd(new Date());
  const ev = e || { titolo: '', data: today, ora: '', per: 'Famiglia', note: '' };
  openSheet({
    title: e ? 'Modifica impegno' : 'Nuovo impegno',
    body: `${whoFieldset()}<label>Cosa<input name="titolo" type="text" required maxlength="80" value="${esc(ev.titolo)}" placeholder="Visita, compleanno, riunione…"></label>
      <div class="two"><label>Giorno<input name="data" type="date" required value="${esc(ev.data)}"></label>
      <label>Ora <small>(facoltativa)</small><input name="ora" type="time" value="${esc(ev.ora)}"></label></div>
      <fieldset><legend>Per chi</legend>${personPicker('per', ev.per)}</fieldset>
      <label>Note <small>(facoltative)</small><input name="note" type="text" maxlength="120" value="${esc(ev.note)}"></label>`,
    onSubmit: f => { rememberWho(f); return upsert('Eventi', { id: e ? e.id : rid(), titolo: f.titolo, data: f.data, ora: f.ora || '', per: f.per, note: f.note || '', autore: e ? e.autore : state.cfg.autore }); },
    onDelete: e ? () => remove('Eventi', e.id) : null
  });
}

function addReminder(r) {
  const d = new Date(); d.setDate(d.getDate() + 1);
  const def = ymd(d) + 'T09:00';
  const rm = r || { testo: '', quando: def, per: 'Famiglia' };
  openSheet({
    title: r ? 'Modifica promemoria' : 'Nuovo promemoria',
    body: `${whoFieldset()}<label>Ricordami di<input name="testo" type="text" required maxlength="100" value="${esc(rm.testo)}" placeholder="Portare il certificato, chiamare l'idraulico…"></label>
      <label>Quando<input name="quando" type="datetime-local" required value="${esc(rm.quando)}"></label>
      <fieldset><legend>Riguarda</legend>${personPicker('per', rm.per)}</fieldset>
      <p class="hint">La notifica arriva per email.</p>`,
    onSubmit: f => { rememberWho(f); return upsert('Promemoria', { id: r ? r.id : rid(), testo: f.testo, quando: f.quando, per: f.per, autore: r ? r.autore : state.cfg.autore }); },
    onDelete: r ? () => remove('Promemoria', r.id) : null
  });
}

function addExpiry(s) {
  const sc = s || { prodotto: '', scadenza: addDays(ymd(new Date()), 5), avviso_giorni: '2' };
  openSheet({
    title: s ? 'Modifica scadenza' : 'Nuova scadenza',
    body: `${whoFieldset()}<label>Prodotto<input name="prodotto" type="text" required maxlength="60" value="${esc(sc.prodotto)}" placeholder="Yogurt, prosciutto, latte…"></label>
      <label>Scade il<input name="scadenza" type="date" required value="${esc(sc.scadenza)}"></label>
      <label>Avvisami<select name="avviso_giorni">${[0, 1, 2, 3, 5, 7].map(n => `<option value="${n}" ${String(n) === String(sc.avviso_giorni || '2') ? 'selected' : ''}>${n === 0 ? 'il giorno stesso' : n === 1 ? '1 giorno prima' : n + ' giorni prima'}</option>`).join('')}</select></label>
      <p class="hint">L'avviso arriva ogni mattina tra le 8 e le 9.</p>`,
    onSubmit: f => { rememberWho(f); return upsert('Scadenze', { id: s ? s.id : rid(), prodotto: f.prodotto, scadenza: f.scadenza, avviso_giorni: f.avviso_giorni, autore: s ? s.autore : state.cfg.autore }); },
    onDelete: s ? () => remove('Scadenze', s.id) : null
  });
}

function usualsHtml() {
  return state.data.abituali.slice().sort((a, b) => a.prodotto.localeCompare(b.prodotto, 'it'))
    .map(u => `<span class="chipbtn static">${esc(u.prodotto)}<button type="button" data-act="del-usual" data-id="${esc(u.id)}" aria-label="Togli ${esc(u.prodotto)}">${ico('x')}</button></span>`).join('');
}

function openSettings() {
  const c = state.cfg;
  const mail = state.config.emailDestinatari || '';
  openSheet({
    title: 'Impostazioni',
    submit: 'Fatto',
    noFocus: true,
    body: () => `${c.mode === 'display' ? '' : `<fieldset><legend>Chi sei</legend><div class="seg two">${AUTORI.map(a => `<label><input type="radio" name="who" value="${a}" ${c.autore === a ? 'checked' : ''}><span>${a}</span></label>`).join('')}</div></fieldset>`}
      <fieldset><legend>Notifiche</legend>
        <label>Email che ricevono le notifiche<input name="emails" type="text" inputmode="email" autocomplete="off" ${c.mode === 'display' ? 'readonly' : ''} value="${esc(mail)}" placeholder="alfio@…, lucia@…"></label>
        <p class="hint">Più indirizzi separati da virgola.</p>
        ${c.mode === 'display' ? '' : '<div class="row-btns"><button type="button" class="btn" data-act="save-email">Salva email</button><button type="button" class="btn" data-act="test-notify">Invia una prova</button></div>'}
      </fieldset>
      ${c.mode === 'display' ? '' : colorsFieldset()}
      ${c.mode === 'display' ? '' : `<fieldset><legend>Prodotti che finiscono spesso</legend>
        <div class="chips" id="usuals">${usualsHtml()}</div>
        <div class="inline"><input name="nuovo_abituale" placeholder="Aggiungi un prodotto" autocomplete="off"><button type="button" class="btn" data-act="add-usual">Aggiungi</button></div></fieldset>`}
      <fieldset><legend>Questo dispositivo</legend>
        <div class="seg two"><label><input type="radio" name="mode" value="phone" ${c.mode !== 'display' ? 'checked' : ''}><span>Telefono</span></label>
        <label><input type="radio" name="mode" value="display" ${c.mode === 'display' ? 'checked' : ''}><span>Tablet</span></label></div>
        <button type="button" class="btn danger wide" data-act="reset">Scollega da questo dispositivo</button></fieldset>`,
    onSubmit: f => {
      if (f.who) state.cfg.autore = f.who;
      if (f.mode) state.cfg.mode = f.mode;
      save(LS_CFG, state.cfg);
      closeSheet();
      render();
    }
  });
}

let toastTimer = null;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ---------- azioni ---------- */
const findBy = (key, id) => state.data[key].find(r => r.id === id);

function finito(prodotto) {
  const p = prodotto.trim();
  if (!p) return;
  if (!state.cfg.autore) { toast('Scegli prima chi sei.'); openSettings(); return; }
  const same = state.data.spesa.find(s => s.prodotto.toLowerCase() === p.toLowerCase());
  if (same && same.stato === 'da_comprare') { toast(p + ' è già in lista.'); return; }
  if (same) upsert('Spesa', { id: same.id, stato: 'da_comprare' });
  else upsert('Spesa', { id: rid(), prodotto: p, stato: 'da_comprare', autore: state.cfg.autore });
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, id = t.dataset.id;
  switch (act) {
    case 'tab': state.tab = t.dataset.tab; render(); break;
    case 'add':
      if (state.tab === 'agenda') addEvent();
      else if (state.tab === 'promemoria') addReminder();
      else if (state.tab === 'scadenze') addExpiry();
      break;
    case 'edit-ev': addEvent(findBy('eventi', id)); break;
    case 'edit-rem': addReminder(findBy('promemoria', id)); break;
    case 'edit-sc': addExpiry(findBy('scadenze', id)); break;
    case 'done-sc': upsert('Scadenze', { id, consumato: 'si' }); toast('Tolto dalle scadenze.'); break;
    case 'finito': finito(t.dataset.p); break;
    case 'clear-bought': state.data.spesa.filter(s => s.stato === 'comprato').forEach(s => remove('Spesa', s.id)); break;
    case 'settings': openSettings(); break;
    case 'close': closeSheet(); break;
    case 'sheet-delete': if (state.sheet && state.sheet.onDelete) { state.sheet.onDelete(); closeSheet(); } break;
    case 'del-usual': remove('Abituali', id); refreshSettingsList(); break;
    case 'add-usual': {
      const inp = $('input[name=nuovo_abituale]');
      if (inp && inp.value.trim()) { upsert('Abituali', { id: rid(), prodotto: inp.value.trim() }); inp.value = ''; refreshSettingsList(); }
      break;
    }
    case 'set-color': {
      const person = t.dataset.person, color = t.dataset.color;
      state.config.colori = { ...(state.config.colori || {}), [person]: color };
      t.parentElement.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b === t));
      applyColors(); persist(); saveColors();
      break;
    }
    case 'save-email': {
      const inp = $('input[name=emails]');
      apiPost({ action: 'setEmail', emails: inp ? inp.value : '' })
        .then(r => { if (r.ok) { state.config.emailDestinatari = r.emailDestinatari; persist(); if (inp) inp.value = r.emailDestinatari; toast('Email salvate.'); } else toast(r.error || 'Non salvato.'); })
        .catch(() => toast('Nessuna rete.'));
      break;
    }
    case 'test-notify': apiPost({ action: 'test' }).then(r => toast(r.ok ? 'Prova inviata.' : 'Non riesco a inviare: ' + (r.error || 'controlla lo script.'))).catch(() => toast('Nessuna rete.')); break;
    case 'reset':
      if (confirm('Scollegare questo dispositivo dal planner?')) {
        localStorage.removeItem(LS_CFG); localStorage.removeItem(LS_CACHE); localStorage.removeItem(LS_QUEUE);
        state.cfg = null; queue = []; state.data = emptyData(); state.sheet = null; render();
      }
      break;
  }
});

document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset && t.dataset.act === 'buy') upsert('Spesa', { id: t.dataset.id, stato: 'comprato' });
  if (t.dataset && t.dataset.act === 'unbuy') upsert('Spesa', { id: t.dataset.id, stato: 'da_comprare' });
});

document.addEventListener('submit', ev => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(form).entries());
  switch (form.dataset.form) {
    case 'setup': {
      state.cfg = { api: f.api.trim(), token: f.token.trim(), mode: f.mode === 'display' ? 'display' : 'phone', autore: AUTORI.includes(f.who) ? f.who : (state.cfg && state.cfg.autore) || null };
      save(LS_CFG, state.cfg);
      state.authError = false;
      render();
      refresh();
      break;
    }
    case 'spesa-add': finito(f.prodotto || ''); break;
    case 'sheet': if (state.sheet) { const s = state.sheet; closeSheet(); s.onSubmit(f); } break;
  }
});

function refreshSettingsList() {
  const box = $('#usuals');
  if (box) box.innerHTML = usualsHtml();
}

/* Tablet: tenendo premuta l'intestazione si aprono le impostazioni */
let holdTimer = null;
document.addEventListener('pointerdown', ev => {
  if (ev.target.closest('[data-hold]')) holdTimer = setTimeout(openSettings, 1500);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(n => document.addEventListener(n, () => clearTimeout(holdTimer)));

boot();
