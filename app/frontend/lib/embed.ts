/**
 * Comparatore incorporato in PrevidenzaPro.
 *
 * Quando il comparatore gira dentro un iframe di PrevidenzaPro non fa il login
 * da solo: chiede alla pagina che lo ospita un token di accesso, lo scambia con
 * il nostro backend e ottiene la sessione. Testata e navigazione spariscono,
 * perche quelle le mette la piattaforma che ci ospita.
 *
 * Protocollo dei messaggi (postMessage), da tenere allineato con PrevidenzaPro:
 *
 *   comparatore -> pagina   { source: 'comparatore-fondi-pensione', type: 'ready' }
 *   comparatore -> pagina   { source: 'comparatore-fondi-pensione', type: 'token-request' }
 *   pagina -> comparatore   { source: 'previdenzapro', type: 'token', token: '<jwt>' }
 *   pagina -> comparatore   { source: 'previdenzapro', type: 'logout' }
 *
 * Regole: il comparatore accetta messaggi solo dalle origini dichiarate dal
 * backend e non indica mai '*' come destinazione. La sessione resta in memoria,
 * mai in localStorage: dentro un iframe lo spazio di archiviazione puo essere
 * separato per sito, e un token in memoria sparisce quando la scheda si chiude.
 */

export const MITTENTE_COMPARATORE = 'comparatore-fondi-pensione';
export const MITTENTE_PIATTAFORMA = 'previdenzapro';

export type MessaggioInEntrata =
  | { source: typeof MITTENTE_PIATTAFORMA; type: 'token'; token: string }
  | { source: typeof MITTENTE_PIATTAFORMA; type: 'logout' };

/** Siamo dentro un iframe? */
export function dentroIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    // Se l'accesso a window.top lancia, siamo in un iframe di un altro dominio
    return true;
  }
}

/** Ricorda, per questa scheda, che il comparatore e stato aperto incorporato. */
const CHIAVE_INCORPORATO = 'comparatore:incorporato';

/**
 * La modalita incorporata si attiva con ?embed=1 al primo caricamento e vale
 * per tutta la sessione. Richiede comunque di essere davvero dentro un iframe,
 * cosi il parametro da solo non serve a nascondere la testata altrove.
 *
 * Il parametro non sopravvive alla navigazione interna, che riscrive
 * l'indirizzo con il solo percorso: se l'iframe viene ricaricato dopo, senza
 * memoria ripartiremmo in modalita pubblica e chiederemmo un login Google che
 * dentro PrevidenzaPro non ha senso. Per questo lo annotiamo in sessionStorage,
 * che vale per questa scheda e sparisce quando si chiude.
 */
export const MODALITA_INCORPORATA: boolean = (() => {
  if (typeof window === 'undefined') return false;
  if (!dentroIframe()) return false;

  let richiesta = false;
  try {
    const parametri = new URLSearchParams(window.location.search);
    richiesta = parametri.get('embed') === '1' || parametri.get('embed') === 'true';
  } catch {
    richiesta = false;
  }

  try {
    if (richiesta) window.sessionStorage.setItem(CHIAVE_INCORPORATO, '1');
    else if (window.sessionStorage.getItem(CHIAVE_INCORPORATO) === '1') richiesta = true;
  } catch {
    // archiviazione non disponibile: restiamo a quello che dice l'indirizzo
  }

  return richiesta;
})();

/** Origine della pagina che ci ha caricati, quando il browser la dichiara. */
export function origineOspite(): string | null {
  if (typeof document === 'undefined' || !document.referrer) return null;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

export interface OpzioniPonte {
  /** Origini da cui accettiamo messaggi, lette da /auth/sso/config */
  originiAmmesse: string[];
  /** Chiamata quando la pagina ci manda un token */
  alToken: (token: string) => void;
  /** Chiamata quando l'utente esce da PrevidenzaPro */
  alLogout: () => void;
}

/** Un token arrivato prima che sapessimo quali origini accettare. */
export interface MessaggioAnticipato {
  origine: string;
  token: string;
}

/**
 * Registra subito un ascoltatore che mette da parte i token ricevuti.
 *
 * Serve perche le origini ammesse le sappiamo solo dopo aver interrogato il
 * backend: se la pagina che ci ospita manda il token senza aspettare il nostro
 * 'ready', in quella finestra andrebbe perso. Qui non validiamo nulla, teniamo
 * solo da parte origine e token; a dire se sono accettabili ci pensa il ponte.
 */
export function raccogliTokenAnticipati(): { messaggi: MessaggioAnticipato[]; chiudi(): void } {
  const messaggi: MessaggioAnticipato[] = [];
  if (typeof window === 'undefined') return { messaggi, chiudi: () => {} };

  const ascoltatore = (evento: MessageEvent) => {
    const dati = evento.data as MessaggioInEntrata | undefined;
    if (!dati || dati.source !== MITTENTE_PIATTAFORMA) return;
    if (dati.type === 'token' && typeof dati.token === 'string' && dati.token) {
      messaggi.push({ origine: evento.origin, token: dati.token });
    }
  };
  window.addEventListener('message', ascoltatore);
  return { messaggi, chiudi: () => window.removeEventListener('message', ascoltatore) };
}

export interface Ponte {
  /** Dice alla pagina che siamo pronti a ricevere il primo token */
  annunciaPronto(): void;
  /**
   * Riprende i token arrivati prima che il ponte esistesse, scartando quelli
   * di origini non ammesse. Vero se almeno uno e stato accettato.
   */
  riprendi(messaggi: MessaggioAnticipato[]): boolean;
  /** Chiede un token nuovo, per rinnovare la sessione */
  chiediToken(): void;
  /** Aspetta il prossimo token, con scadenza */
  attendiToken(timeoutMs?: number): Promise<string>;
  chiudi(): void;
}

export function creaPonte(opzioni: OpzioniPonte): Ponte {
  const ammesse = opzioni.originiAmmesse.map((o) => o.replace(/\/$/, ''));
  const inAttesa: Array<(token: string) => void> = [];

  const ammessa = (origine: string): boolean => ammesse.includes(origine.replace(/\/$/, ''));

  const ascoltatore = (evento: MessageEvent) => {
    if (!ammessa(evento.origin)) return;
    const dati = evento.data as MessaggioInEntrata | undefined;
    if (!dati || dati.source !== MITTENTE_PIATTAFORMA) return;

    if (dati.type === 'token' && typeof dati.token === 'string' && dati.token) {
      opzioni.alToken(dati.token);
      while (inAttesa.length) inAttesa.shift()!(dati.token);
      return;
    }
    if (dati.type === 'logout') {
      opzioni.alLogout();
    }
  };

  window.addEventListener('message', ascoltatore);

  /**
   * Il messaggio va a chi ci ospita. Se il browser ci dice da dove veniamo e
   * l'origine e fra quelle ammesse, scriviamo solo a lei; altrimenti proviamo
   * tutte le origini ammesse. Non trasportiamo nulla di riservato, ma
   * '*' non lo usiamo comunque.
   */
  const invia = (messaggio: Record<string, unknown>) => {
    const ospite = origineOspite();
    const destinazioni = ospite && ammessa(ospite) ? [ospite] : ammesse;
    for (const destinazione of destinazioni) {
      try {
        window.parent.postMessage({ source: MITTENTE_COMPARATORE, ...messaggio }, destinazione);
      } catch (err) {
        console.warn('[Embed] Messaggio non recapitato a', destinazione, err);
      }
    }
  };

  return {
    annunciaPronto: () => invia({ type: 'ready' }),
    riprendi: (messaggi) => {
      let accettato = false;
      for (const messaggio of messaggi) {
        if (!ammessa(messaggio.origine)) {
          console.warn('[Embed] Token ignorato: origine non ammessa', messaggio.origine);
          continue;
        }
        opzioni.alToken(messaggio.token);
        accettato = true;
      }
      return accettato;
    },
    chiediToken: () => invia({ type: 'token-request' }),
    attendiToken: (timeoutMs = 15000) =>
      new Promise<string>((risolvi, rifiuta) => {
        const scadenza = window.setTimeout(() => {
          const indice = inAttesa.indexOf(risolviConPulizia);
          if (indice >= 0) inAttesa.splice(indice, 1);
          rifiuta(new Error("Nessun token ricevuto dalla pagina che ospita il comparatore"));
        }, timeoutMs);
        function risolviConPulizia(token: string) {
          window.clearTimeout(scadenza);
          risolvi(token);
        }
        inAttesa.push(risolviConPulizia);
      }),
    chiudi: () => {
      window.removeEventListener('message', ascoltatore);
      inAttesa.length = 0;
    },
  };
}

export interface ConfigSSO {
  enabled: boolean;
  parent_origins: string[];
}

export async function leggiConfigSSO(apiBase: string): Promise<ConfigSSO> {
  const risposta = await fetch(`${apiBase}/auth/sso/config`, {
    headers: { Accept: 'application/json' },
  });
  if (!risposta.ok) throw new Error(`Configurazione SSO non disponibile (${risposta.status})`);
  return (await risposta.json()) as ConfigSSO;
}

export interface EsitoScambio {
  token: string;
  user: Record<string, unknown>;
}

/** Scambia il token di PrevidenzaPro con la sessione del comparatore. */
export async function scambiaToken(apiBase: string, token: string): Promise<EsitoScambio> {
  const risposta = await fetch(`${apiBase}/auth/sso/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!risposta.ok) {
    const dettaglio = await risposta.text().catch(() => '');
    throw new Error(`Accesso rifiutato (${risposta.status}) ${dettaglio}`.trim());
  }
  return (await risposta.json()) as EsitoScambio;
}

/**
 * Quando scade la nostra sessione, leggendo il campo exp del token.
 * Non e una verifica di sicurezza, serve solo a sapere quando rinnovare.
 */
export function scadenzaSessione(token: string): number | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalizzato = payload.replace(/-/g, '+').replace(/_/g, '/');
    const dati = JSON.parse(atob(normalizzato.padEnd(Math.ceil(normalizzato.length / 4) * 4, '=')));
    return typeof dati.exp === 'number' ? dati.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Fra quanti millisecondi chiedere il rinnovo: due minuti prima della scadenza. */
export function attesaPrimaDelRinnovo(token: string): number | null {
  const scadenza = scadenzaSessione(token);
  if (!scadenza) return null;
  const anticipo = 2 * 60 * 1000;
  return Math.max(10_000, scadenza - Date.now() - anticipo);
}
