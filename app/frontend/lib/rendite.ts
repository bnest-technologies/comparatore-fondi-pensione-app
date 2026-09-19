/**
 * Accesso ai coefficienti di rendita.
 *
 * I coefficienti sono contenuto premium e non stanno nel bundle: si scaricano dal
 * backend un fondo alla volta, solo quando servono. La risposta resta in memoria
 * per la durata della sessione, cosi cambiare eta o rateazione non rifa la chiamata.
 */
import { useEffect, useState } from 'react';
import { api } from './api';
import type { RenditeExtractionResult } from '../types/rendite';

export type StatoRendite = 'idle' | 'caricamento' | 'pronto' | 'assente' | 'non_abbonato' | 'errore';

const cache = new Map<number, Promise<RenditeExtractionResult | null>>();

/** null se il fondo non pubblica tavole; errore 'non_abbonato' se il server rifiuta. */
function scaricaRendite(nAlbo: number, token?: string): Promise<RenditeExtractionResult | null> {
  const inCache = cache.get(nAlbo);
  if (inCache) return inCache;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const richiesta = api
    .get<RenditeExtractionResult>(`/api/rendite/${nAlbo}`, { headers })
    .then((r) => r.data)
    .catch((err) => {
      const codice = err?.response?.status;
      if (codice === 404) return null;
      cache.delete(nAlbo);                        // un errore non va ricordato: si riprova
      throw new Error(codice === 401 || codice === 403 ? 'non_abbonato' : 'errore');
    });
  cache.set(nAlbo, richiesta);
  return richiesta;
}

/** Coefficienti di un fondo, caricati solo se `abilitato` (utente abbonato con un fondo scelto). */
export function useRenditeFondo(nAlbo: number | null | undefined, token: string | undefined, abilitato: boolean) {
  const [stato, setStato] = useState<StatoRendite>('idle');
  const [dati, setDati] = useState<RenditeExtractionResult | null>(null);

  useEffect(() => {
    if (!abilitato || nAlbo == null) {
      setStato('idle');
      setDati(null);
      return;
    }
    let attivo = true;
    setStato('caricamento');
    scaricaRendite(nAlbo, token)
      .then((d) => {
        if (!attivo) return;
        setDati(d);
        setStato(d && d.file_pertinente !== false ? 'pronto' : 'assente');
      })
      .catch((e: Error) => {
        if (!attivo) return;
        setDati(null);
        setStato(e.message === 'non_abbonato' ? 'non_abbonato' : 'errore');
      });
    return () => { attivo = false; };
  }, [nAlbo, token, abilitato]);

  return { stato, dati };
}

/** Quanti fondi hanno i coefficienti: informazione pubblica, serve al messaggio per il piano Free. */
export function useCoperturaRendite() {
  const [fondiCoperti, setFondiCoperti] = useState<number | null>(null);
  useEffect(() => {
    let attivo = true;
    api
      .get<{ fondi_coperti: number }>('/api/rendite/disponibilita')
      .then((r) => { if (attivo) setFondiCoperti(r.data.fondi_coperti); })
      .catch(() => { /* il messaggio funziona anche senza il numero */ });
    return () => { attivo = false; };
  }, []);
  return fondiCoperti;
}
