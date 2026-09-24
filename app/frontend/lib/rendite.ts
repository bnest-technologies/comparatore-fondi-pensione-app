/**
 * Accesso ai coefficienti di rendita.
 *
 * I coefficienti sono contenuto premium e non stanno nel bundle: si scaricano dal
 * backend un fondo alla volta, solo quando servono. La risposta resta in memoria
 * per la durata della sessione, cosi cambiare eta o rateazione non rifa la chiamata.
 */
import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from '../auth';
import type { RenditeExtractionResult, TipologiaRendita } from '../types/rendite';

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

/** Chi puo vedere i coefficienti: piano Full Access attivo o amministratore, come nel resto dell'app. */
export function useAccessoRendite() {
  const { user, token } = useAuth();
  const abbonato = (user?.plan === 'full-access' && (user?.status ?? 'active') === 'active') || user?.isAdmin === true;
  return { abbonato, token, autenticato: Boolean(user) };
}

export interface RiepilogoRendite {
  disponibile: boolean;
  tipologie: TipologiaRendita[];
  tassi_tecnici: number[];
  distingue_sesso: boolean;
  eta_minima: number | null;
  eta_massima: number | null;
}

const cacheRiepilogo = new Map<number, Promise<RiepilogoRendite | null>>();

/** Cosa offre un fondo, senza valori: informazione aperta anche al piano Free. */
export function useRiepilogoRendite(nAlbo: number | null | undefined) {
  const [riepilogo, setRiepilogo] = useState<RiepilogoRendite | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  useEffect(() => {
    if (nAlbo == null) { setRiepilogo(null); return; }
    let attivo = true;
    let p = cacheRiepilogo.get(nAlbo);
    if (!p) {
      p = api.get<RiepilogoRendite>(`/api/rendite/disponibilita?albo=${nAlbo}`)
        .then((r) => r.data)
        .catch(() => { cacheRiepilogo.delete(nAlbo); return null; });
      cacheRiepilogo.set(nAlbo, p);
    }
    setCaricamento(true);
    p.then((r) => { if (attivo) { setRiepilogo(r); setCaricamento(false); } });
    return () => { attivo = false; };
  }, [nAlbo]);
  return { riepilogo, caricamento };
}

export type FondoConfronto = RenditeExtractionResult & { riepilogo: RiepilogoRendite };

const cacheConfronto = new Map<string, Promise<Record<string, FondoConfronto>>>();

/** Tavole di una tipologia per tutti i fondi: alimenta la sezione Rendite. Solo abbonati. */
export function useRenditeConfronto(tipologia: TipologiaRendita, token: string | undefined, abilitato: boolean) {
  const [stato, setStato] = useState<StatoRendite>('idle');
  const [fondi, setFondi] = useState<Record<string, FondoConfronto> | null>(null);

  useEffect(() => {
    if (!abilitato) { setStato('idle'); setFondi(null); return; }
    let attivo = true;
    let p = cacheConfronto.get(tipologia);
    if (!p) {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      p = api.get<{ fondi: Record<string, FondoConfronto> }>(`/api/rendite/confronto?tipologia=${tipologia}`, { headers })
        .then((r) => r.data.fondi)
        .catch((err) => {
          cacheConfronto.delete(tipologia);
          const codice = err?.response?.status;
          throw new Error(codice === 401 || codice === 403 ? 'non_abbonato' : 'errore');
        });
      cacheConfronto.set(tipologia, p);
    }
    setStato('caricamento');
    p.then((f) => { if (attivo) { setFondi(f); setStato('pronto'); } })
      .catch((e: Error) => { if (attivo) { setFondi(null); setStato(e.message === 'non_abbonato' ? 'non_abbonato' : 'errore'); } });
    return () => { attivo = false; };
  }, [tipologia, token, abilitato]);

  return { stato, fondi };
}
