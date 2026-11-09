# Integrazione con PrevidenzaPro

Contratto tecnico dell'accesso SSO e della modalita incorporata del comparatore.
Documento condiviso con lo sviluppatore di PrevidenzaPro: se cambia qualcosa qui,
va cambiato su entrambi i lati.

Stato: SSO e modalita incorporata implementati e collaudati in locale.
La sincronizzazione degli abbonamenti aspetta il contratto delle API.

## Come funziona

1. PrevidenzaPro verifica che l'utente abbia diritto al comparatore ed emette un
   JWT firmato RS256, valido 60 secondi e utilizzabile una sola volta.
2. La pagina di PrevidenzaPro carica il comparatore in un iframe e gli passa il
   token con `postMessage`.
3. Il comparatore chiama `POST /auth/sso/exchange`, il backend verifica il token
   ed emette la propria sessione.
4. Alla scadenza il comparatore chiede un token nuovo alla pagina che lo ospita.

**Il controllo degli accessi resta a PrevidenzaPro.** Se smette di emettere
token per un utente, quell'utente non entra piu: al massimo resta dentro fino
alla scadenza della sessione in corso.

## Il token

Intestazione: `alg: RS256` e `kid`. Altri algoritmi vengono rifiutati, `none`
compreso.

| Campo | Obbligatorio | Contenuto |
|---|---|---|
| `iss` | si | emittente, deve coincidere con la configurazione |
| `aud` | si | `comparatore-fondi-pensione` |
| `sub` | si | UUID dell'utente PrevidenzaPro, stabile e mai riassegnato |
| `jti` | si | identificativo univoco del token |
| `iat` | si | momento di emissione |
| `exp` | si | scadenza, circa 60 secondi dopo `iat` |
| `email` | si | email dell'utente |
| `email_verified` | no | se assente si considera verificata |
| `name` | no | nome e cognome |
| `organization_id` | no | organizzazione, anche individuale |
| `software` | no | identificativo del comparatore |
| `access_level` | no | per esempio `licensed` |
| `authorization_valid_until` | no | scadenza dell'autorizzazione, vedi sotto |

I nomi dei campi facoltativi si possono cambiare dalla configurazione
(`APP_SSO_CLAIM_EMAIL`, `APP_SSO_CLAIM_NAME`, ...), senza toccare il codice.

Campi in piu nel token non danno fastidio: la verifica ignora quelli che non
conosce. `organization_id`, `software` e `access_level` non decidono l'accesso,
ma vengono conservati nei metadati del profilo e serviranno per la
rendicontazione degli abbonamenti.

`authorization_valid_until` invece viene applicato: **la sessione del
comparatore non sopravvive all'autorizzazione.** Se la scadenza e piu vicina dei
60 minuti consueti, la sessione dura fino a quel momento; se e gia passata,
l'accesso viene rifiutato anche con un token per il resto valido. Si accetta sia
una data ISO 8601 con fuso orario, sia un epoch. Il campo puo mancare, e allora
non vincola nulla; ma se c'e e non si riesce a leggerlo l'accesso viene
rifiutato e il valore finisce nei log: una scadenza illeggibile non deve valere
come "nessuna scadenza".

### Cosa viene rifiutato

- firma non verificabile con le chiavi del JWKS;
- algoritmo diverso da RS256;
- token senza `kid`;
- `aud` o `iss` diversi da quelli configurati;
- token scaduto, o emesso piu di 120 secondi prima (tolleranza 60 secondi sullo
  scarto di orologio);
- token gia usato, riconosciuto dal `jti`;
- campi obbligatori mancanti;
- `authorization_valid_until` gia passato, oppure presente ma illeggibile.

In tutti questi casi la risposta e `401` con un messaggio generico. Il motivo
preciso resta nei nostri log.

### Rotazione delle chiavi

Il JWKS viene tenuto in cache un'ora. Un `kid` sconosciuto fa rileggere il JWKS
subito, al massimo una volta al minuto. Durante una rotazione conviene quindi
tenere la chiave vecchia e la nuova nel JWKS per qualche giorno.

## Messaggi fra la pagina e l'iframe

L'indirizzo dell'iframe deve avere `?embed=1`:

    https://accademia-previdenza.web.app/?embed=1

La modalita incorporata si attiva solo se il parametro c'e **e** siamo davvero
dentro un iframe.

Dal comparatore alla pagina:

```js
{ source: 'comparatore-fondi-pensione', type: 'ready' }         // pronto a ricevere il primo token
{ source: 'comparatore-fondi-pensione', type: 'token-request' } // serve un token nuovo
```

Dalla pagina al comparatore:

```js
{ source: 'previdenzapro', type: 'token', token: '<jwt>' }      // consegna del token
{ source: 'previdenzapro', type: 'logout' }                     // chiudi la sessione
```

Regole su entrambi i lati: `targetOrigin` sempre esplicito, mai `*`, e si
verifica `event.origin` prima di leggere il messaggio. Il comparatore accetta
messaggi solo dalle origini elencate in `APP_SSO_PARENT_ORIGINS`.

Sequenza tipica: l'iframe manda `ready`, la pagina risponde con `token`. Se dopo
quattro secondi non arriva nulla il comparatore manda `token-request`, nel caso
la pagina avesse finito di caricare prima di lui. Dopo quindici secondi mostra un
avviso.

## Comportamento della sessione

- Dura 60 minuti, oppure meno se `authorization_valid_until` e piu vicina. La
  durata viene da `APP_JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, che oggi non e
  impostata su nessuno dei due ambienti: vale quindi il valore predefinito. Il
  rinnovo parte due minuti prima della scadenza con `token-request`, quindi una
  sessione accorciata si rinnova prima: se nel frattempo l'autorizzazione e
  finita, PrevidenzaPro non emette il token e l'utente esce.
- Resta **in memoria**: niente `localStorage`, perche dentro un iframe
  l'archiviazione puo essere separata per sito. Ricaricando la pagina si
  richiede il token.
- Al messaggio `logout` viene cancellata subito.
- Senza sessione il comparatore non mostra la pagina pubblica, ma un avviso che
  invita a rientrare da PrevidenzaPro.

Incorporati spariscono testata, barra laterale, pie di pagina, navigazione
mobile, banner dei cookie (il consenso lo raccoglie la piattaforma ospite) e
widget di assistenza (il primo livello e di PrevidenzaPro).

## Endpoint

### `GET /auth/sso/config`

Dice al frontend se puo tentare l'accesso incorporato e da quali origini
accettare messaggi. Non espone emittente ne indirizzo del JWKS.

```json
{ "enabled": true, "parent_origins": ["https://staging.previdenzapro.it"] }
```

### `POST /auth/sso/exchange`

```json
{ "token": "<jwt di PrevidenzaPro>" }
```

Risposta `200`:

```json
{ "token": "<sessione del comparatore>", "user": { "id": "...", "email": "...", "plan": "full-access" } }
```

Errori: `401` token non valido, scaduto o gia usato; `503` SSO non configurato
su quell'ambiente o JWKS non raggiungibile.

## Utenti

Il profilo si ritrova in quest'ordine:

1. per identificativo interno `pp_<sub>`, se l'utente e gia entrato;
2. per email verificata, cosi chi entrava con Google ritrova il suo profilo;
3. altrimenti se ne crea uno nuovo.

Se l'email non coincide si crea un profilo nuovo: meglio un doppione che
un'associazione sbagliata. L'identificativo PrevidenzaPro viene salvato nei
metadati del profilo.

Chi entra con un token valido e **attivo** e con piano `full-access`, senza
passare dall'approvazione di un amministratore: il diritto di accesso lo ha gia
verificato PrevidenzaPro.

## Configurazione

| Variabile | Esempio | Note |
|---|---|---|
| `APP_SSO_ENABLED` | `true` | spento, ogni accesso SSO e rifiutato |
| `APP_SSO_ISSUER` | `https://staging.previdenzapro.it` | valore atteso in `iss` |
| `APP_SSO_AUDIENCE` | `comparatore-fondi-pensione` | valore atteso in `aud` |
| `APP_SSO_JWKS_URL` | `https://.../.well-known/jwks.json` | chiavi pubbliche |
| `APP_SSO_PARENT_ORIGINS` | `https://staging.previdenzapro.it` | origini dell'iframe, separate da virgola |
| `APP_SSO_JWKS_TTL_SECONDS` | `3600` | durata della cache del JWKS |
| `APP_SSO_JWKS_MIN_REFETCH` | `60` | intervallo minimo fra riletture forzate |
| `APP_SSO_LEEWAY_SECONDS` | `60` | tolleranza sullo scarto di orologio |
| `APP_SSO_MAX_TOKEN_AGE` | `120` | eta massima del token |
| `APP_SSO_DEFAULT_PLAN` | `full-access` | piano di chi entra via SSO |
| `APP_SSO_CLAIM_AUTH_UNTIL` | `authorization_valid_until` | claim con la scadenza dell'autorizzazione |

Da aggiungere su Firebase Hosting quando i domini sono confermati, per impedire
che il comparatore venga incorporato altrove:

```
Content-Security-Policy: frame-ancestors 'self' https://staging.previdenzapro.it https://app.previdenzapro.it
```

## Provare in locale

`scripts/local/simulatore_previdenzapro.py` fa le veci di PrevidenzaPro: pubblica
un JWKS, firma i token e mostra una pagina con l'iframe. Ha i pulsanti per i casi
che devono fallire: token scaduto, emesso per un altro software, firmato da una
chiave estranea, riusato.

```bash
# backend
APP_FIRESTORE_ENABLED=false APP_SSO_ENABLED=true \
APP_SSO_ISSUER=http://localhost:8012 \
APP_SSO_AUDIENCE=comparatore-fondi-pensione \
APP_SSO_JWKS_URL=http://localhost:8012/.well-known/jwks.json \
APP_SSO_PARENT_ORIGINS=http://localhost:8012 \
APP_SSO_JWKS_MIN_REFETCH=0 ANTEPRIMA_PORTA=8011 \
APP_CORS_ORIGINS="http://localhost:5174,http://localhost:8012" \
app/backend/.venv/Scripts/python.exe scripts/local/anteprima_backend.py

# frontend
cd app/frontend && VITE_API_BASE=http://localhost:8011 npx vite --port 5174 --strictPort

# simulatore, poi apri http://localhost:8012
app/backend/.venv/Scripts/python.exe scripts/local/simulatore_previdenzapro.py
```

Test della verifica: `pytest tests/services/test_sso_service.py` (31 test).

## Cosa manca

- Contratto delle API degli abbonamenti, atteso da PrevidenzaPro: stati,
  criteri di validita, impaginazione, limiti di frequenza.
- Sincronizzazione oraria con riconciliazione giornaliera e storico delle
  sottoscrizioni, compreso il campo `acquisition_type` (`single` / `bundle`).
- Elenco degli abbonati e storico nel pannello di amministrazione.
- Ambiente di test separato, con database distinto da quello di produzione.
- Dominio di produzione di PrevidenzaPro da confermare.
