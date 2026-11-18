/**
 * Narrivu — caricatore (da incollare UNA volta nell'editor, al posto di Code.gs).
 *
 * Legge il codice vero (apps-script/Code.gs) dal repository GitHub e lo esegue.
 * Così lo script si aggiorna da solo: basta pubblicare su GitHub, senza toccare l'editor.
 *  - il codice resta 5 minuti in cache; se GitHub non risponde si usa l'ultima copia (fino a 6 ore);
 *  - legge solo da questo indirizzo: chi può scrivere sul repository controlla lo script.
 * Dopo un aggiornamento urgente: esegui aggiorna() per scartare la cache.
 */
const CODE_URL = 'https://raw.githubusercontent.com/dati-grezzi/Narrivu/main/apps-script/Code.gs';
const FUNZIONI_ = ['doGet', 'doPost', 'setup', 'showSetup', 'rigeneraToken', 'testNotifica', 'checkReminders', 'dailyJob'];

function modulo_() {
  const cache = CacheService.getScriptCache();
  let src = cache.get('CODE_SRC');
  if (!src) {
    try {
      const res = UrlFetchApp.fetch(CODE_URL + '?_=' + Date.now(), { muteHttpExceptions: true });
      const txt = res.getContentText();
      if (res.getResponseCode() === 200 && /function doGet\(/.test(txt)) {
        src = txt;
        cache.put('CODE_SRC', src, 300);
        cache.put('CODE_STALE', src, 21600);
      }
    } catch (err) { Logger.log('GitHub non raggiungibile: ' + err); }
    if (!src) src = cache.get('CODE_STALE');
  }
  if (!src) throw new Error('Codice non disponibile: GitHub non risponde e non c\'è una copia recente.');
  return new Function(src + '\nreturn {' + FUNZIONI_.join(',') + '};')();
}

function aggiorna() {
  CacheService.getScriptCache().removeAll(['CODE_SRC', 'CODE_STALE']);
  modulo_();
  Logger.log('Codice aggiornato da GitHub.');
}

function doGet(e) { return modulo_().doGet(e); }
function doPost(e) { return modulo_().doPost(e); }
function setup() { return modulo_().setup(); }
function showSetup() { return modulo_().showSetup(); }
function rigeneraToken() { return modulo_().rigeneraToken(); }
function testNotifica() { return modulo_().testNotifica(); }
function checkReminders() { return modulo_().checkReminders(); }
function dailyJob() { return modulo_().dailyJob(); }
