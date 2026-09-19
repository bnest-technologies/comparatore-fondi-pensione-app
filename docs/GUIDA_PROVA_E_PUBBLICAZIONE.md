# Prova in locale e pubblicazione

Guida operativa per provare le novità sul proprio computer e poi pubblicarle, prima in un
ambiente di test separato e solo dopo sul sito pubblico. Tutti i comandi si lanciano dalla
cartella della repo (`C:\Users\Giova\dev\fund-comparison`); quelli `.sh` in **Git Bash**.

---

## 1. Anteprima locale (nessuna credenziale)

Doppio clic su `scripts\local\avvia_anteprima.cmd`.

Si aprono due finestre (backend e sito) e poi il browser su `http://localhost:5173/simulator`.
Il backend simula un utente **Full Access** già autenticato: niente login Google, niente
database utenti, niente dati reali toccati. Per vedere il sito come un utente **Free**:

```
scripts\local\avvia_anteprima.cmd free
```

Per fermare tutto basta chiudere le due finestre.

Cosa guardare:
- **Simulatore → passaggio 3 "Netto alla Pensione"**: scegliere un fondo in alto, poi la sezione
  "In alternativa al capitale: la rendita" in fondo alla pagina.
- **Simulatore in modalità Confronto** (2 o più fondi) → passaggio 3: la tabella
  "Rendita mensile netta a confronto".
- **FAQ TFR e rendite** (menu): la nuova sezione "La rendita spiegata al cliente".
- In versione **Free**: la scheda con il lucchetto al posto della rendita.

---

## 2. Strumenti (una volta sola)

- Firebase CLI e pnpm: già installati.
- Google Cloud SDK: da installare, richiede la conferma di Windows:
  ```
  winget install Google.CloudSDK
  ```
  poi chiudere e riaprire il terminale.

Accesso, con l'account proprietario del progetto (giovanni.larosa@bnest.it):
```
gcloud auth login
firebase login
```

---

## 3. Capire dove gira oggi il sito

```
scripts/deploy/rileva_produzione.sh
```

Elenca i servizi Cloud Run e i siti Firebase dei tre progetti (`accademia-previdenza`,
`financial-suite`, `gen-lang-client-0685938029`). Serve a individuare il servizio backend di
produzione e il progetto Firebase collegato al dominio del cliente.

---

## 4. Copiare la configurazione dalla produzione

La configurazione del deploy (variabili, segreti, service account) non è nella repo. Invece di
ricostruirla a mano la si copia dal servizio che gira oggi:

```
scripts/deploy/clona_config.sh --project <PROGETTO> --service <SERVIZIO> --region europe-west1 --env test --firebase-project <PROGETTO_FIREBASE>
scripts/deploy/clona_config.sh --project <PROGETTO> --service <SERVIZIO> --region europe-west1 --env prod --firebase-project <PROGETTO_FIREBASE>
```

I file generati sono esclusi da git. Contengono i **nomi** dei segreti, non i valori.

---

## 5. Pubblicazione di test (il sito pubblico non cambia)

```
scripts/deploy/deploy_backend.sh --env test --build
```

Crea il servizio `<SERVIZIO>-test` e stampa il suo indirizzo. Copiare quell'indirizzo in
`infra/deploy/environments/test.env` alla voce `FRONTEND_VITE_API_BASE`, poi:

```
scripts/deploy/deploy_frontend.sh --env test
```

Il sito va su un canale di anteprima Firebase con un indirizzo privato, stampato alla fine.
Il login Google su quell'indirizzo può richiedere di autorizzarlo nella console Google
(Credenziali OAuth): lo script `clona_config.sh` segnala le variabili da rivedere.

---

## 6. Pubblicazione in produzione

Solo dopo aver controllato il test:

```
scripts/deploy/deploy_all.sh --env prod --build-backend
```

**Prima** di questo passaggio va rimesso a posto il testo delle FAQ sul TFR
(`app/frontend/data/tfr_faq.txt`). Non è nella repo e oggi non è su questo computer: senza
quel file il sito si pubblica ugualmente, ma la parte TFR della pagina FAQ mostra solo un
avviso.

---

## Cosa è stato verificato prima della pubblicazione

- Il backend dà le tavole agli abbonati e le nega agli utenti Free, sospesi o non autenticati
  (test con token reali).
- La rendita è calcolata e plausibile per tutti i 91 fondi.
- La build del sito passa, con e senza il file delle FAQ TFR.
