# Narrivu

Agenda di famiglia indipendente da Google Calendar. Dati su un Google Sheet, API in Apps Script, pagina su GitHub Pages, notifiche con ntfy. Nessun server da gestire.

- **Tablet a muro** (`mode=display`): sola lettura, mostra 7 giorni, scadenze e spesa.
- **Telefoni di Alfio e Lucia** (`mode=phone`): inseriscono eventi, promemoria, scadenze e prodotti finiti. Ogni voce porta il nome di chi l'ha inserita.
- Eventi e promemoria riguardano **Famiglia, Lucia, Eddie o Zaja**.

## Installazione (circa 20 minuti)

### 1. Il foglio e lo script
1. Crea un nuovo Google Sheet (nome a piacere, es. "Narrivu").
2. **Estensioni > Apps Script**. Incolla il contenuto di `apps-script/Code.gs`.
3. **Impostazioni progetto** > spunta "Mostra il file manifest appsscript.json", poi incolla il contenuto di `apps-script/appsscript.json`.
4. Seleziona la funzione `setup` e premi **Esegui**; autorizza l'accesso. Crea le schede, il token segreto, il canale ntfy e i trigger (promemoria ogni 5 minuti, riepilogo scadenze ogni mattina alle 8).
5. **Distribuisci > Nuova distribuzione > App web**: esegui come *te*, accesso *Chiunque*. Copia l'URL che finisce con `/exec`.

### 2. La pagina web
1. Il codice sta nel repository `dati-grezzi/narrivu`: l'app web è nella radice, lo script in `apps-script/`.
2. **Settings > Pages**: pubblica dal ramo `main`, cartella `/ (root)`.
3. `PAGES_URL` in `Code.gs` è già `https://datigrezzi.it/Narrivu/`.
4. Riesegui `showSetup`: nel registro compaiono tre link pronti (Alfio, Lucia, tablet).

### 3. Notifiche
1. Installa **ntfy** da Play Store su entrambi i telefoni.
2. Iscriviti al canale `casa-…` mostrato da `showSetup` (server `ntfy.sh`). In alternativa, nelle impostazioni dell'app c'è un link `ntfy://` che lo fa in un tocco.
3. Prova con **Impostazioni (pressione lunga sul titolo) > Invia una prova** (o la funzione `testNotifica`).

Chiunque conosca il nome del canale può leggere le notifiche: il nome è casuale, ma non dire di usarlo per dati sensibili.

### 4. Aprire i link
- Sui telefoni: apri il proprio link in Chrome, poi menu > **Installa app / Aggiungi a schermata Home**. Il link salva le impostazioni e si ripulisce da solo.
- Sul tablet: apri il link `mode=display`; consigliato **Fully Kiosk Browser** (schermo sempre acceso, avvio automatico, kiosk). Per la batteria usa una presa smart con limite di carica all'80%.

## Come si usa
- **Agenda**: tasto + per un nuovo impegno. Il colore indica per chi è, il cerchietto la persona che l'ha inserito.
- **Spesa**: tocca un prodotto abituale in "È finito?" e finisce nella lista; sul telefono spunta quando lo compri. Il tablet mostra la lista.
- **Scadenze**: prodotto, data e giorni di preavviso (predefiniti: 2). La notifica arriva la mattina; "consumato" la chiude.
- **Promemoria**: data e ora; la notifica parte entro 5 minuti dall'orario.
- Pressione lunga sul titolo/pallino: impostazioni.

## Aggiornare
Modifica i file, ricarica su GitHub e aumenta `CACHE` in `sw.js` (es. `narrivu-v7`), altrimenti i dispositivi restano sulla versione vecchia. Dopo modifiche a `Code.gs`: **Distribuisci > Gestisci distribuzioni > Modifica > Nuova versione**.

## Prove in locale
```
node dev/mock-server.js          # app + API finta con dati di esempio
node dev/test-backend.js         # test di Code.gs con servizi Google simulati
```
Apri `http://localhost:8080/#api=http://localhost:8080/api&t=dev&mode=display` (oppure `mode=phone&who=Alfio`).

## Limiti noti
- Le notifiche arrivano con ritardo massimo di ~5 minuti (granularità dei trigger).
- Con più modifiche simultanee prevale l'ultima; i telefoni offline accodano e inviano al ritorno della rete.
- Il token è l'unico segreto: chi ha il link può modificare i dati. Se lo perdi, rigenera con `setup()` e rifai i link.

## Crediti
Il logo unisce l'icona "home" di Heroicons (licenza MIT) con comignolo e fumo dell'icona "cottage" di Material Icons (Google, Apache 2.0). Font: Bricolage Grotesque (OFL).
