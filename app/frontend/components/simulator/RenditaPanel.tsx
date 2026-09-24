import React, { useEffect, useMemo, useState } from 'react';
import type { PensionFund } from '../../types';
import type { Frequenza, RenditeExtractionResult, Sesso } from '../../types/rendite';
import {
  calcolaRendita,
  opzioniDisponibili,
  requisitiInput,
  setCorrente,
  setDisponibili,
  RATE_PER_ANNO,
  RenditaNonCalcolabile,
  type OpzioneRendita,
} from '../../utils/renditeCalculator';
import { formatCurrency } from '../../utils/simulatorCalc';
import { useAuth } from '../../auth';
import { useCoperturaRendite, useRenditeFondo } from '../../lib/rendite';
import { SUBSCRIPTION_URL } from '../../constants';
import SimulatorSlider from './SimulatorSlider';
import { NotaReversibilita, SchedaFondo, TabellaCoefficienti } from './SchedaRendita';
import { etichettaTariffa } from '../../utils/renditeConfronto';

interface RenditaPanelProps {
  fondo: PensionFund | null;
  isFreePlan: boolean;
  /** capitale lordo accumulato alla data del pensionamento */
  montanteLordo: number;
  /** aliquota dell'imposta sostitutiva (0,09 - 0,15), la stessa del netto in capitale */
  aliquotaSostitutiva: number;
  orizzonteAnni: number;
}

const ETICHETTE_RATE: Record<Frequenza, string> = {
  annuale: 'Annuale',
  semestrale: 'Semestrale',
  quadrimestrale: 'Quadrimestrale',
  trimestrale: 'Trimestrale',
  bimestrale: 'Bimestrale',
  mensile: 'Mensile',
};
const NOME_RATA: Record<Frequenza, string> = {
  annuale: 'annua', semestrale: 'semestrale', quadrimestrale: 'quadrimestrale',
  trimestrale: 'trimestrale', bimestrale: 'bimestrale', mensile: 'mensile',
};

const chiaveOpzione = (o: OpzioneRendita) =>
  [o.tipologia, o.durataCertaAnni, o.percReversibilita, o.tassoTecnico].join('|');

/** Rateazioni che il fondo pubblica per l'opzione scelta, dalla piu frequente alla meno. */
function rateazioniDisponibili(dati: RenditeExtractionResult, o: OpzioneRendita, idSet?: string): Frequenza[] {
  const set = setCorrente(dati, idSet);
  const trovate = new Set<Frequenza>();
  for (const t of set?.tabelle ?? []) {
    if (t.tipologia !== o.tipologia || t.durata_certa_anni !== o.durataCertaAnni
        || t.perc_reversibilita !== o.percReversibilita || t.tasso_tecnico !== o.tassoTecnico) continue;
    if (t.tipo_colonne === 'frequenza') {
      t.colonne.forEach((c) => { if (c in RATE_PER_ANNO) trovate.add(c as Frequenza); });
    } else {
      trovate.add('annuale');                       // le matrici reversibili sono in rate annuali
    }
  }
  return (Object.keys(RATE_PER_ANNO) as Frequenza[])
    .filter((f) => trovate.has(f))
    .sort((a, b) => RATE_PER_ANNO[b] - RATE_PER_ANNO[a]);
}

const Riquadro: React.FC<{ children: React.ReactNode; tono?: 'neutro' | 'avviso' }> = ({ children, tono = 'neutro' }) => (
  <div className={`rounded-2xl border p-4 sm:p-5 text-sm leading-relaxed ${
    tono === 'avviso'
      ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/20 text-slate-700 dark:text-slate-300'
      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
  }`}>
    {children}
  </div>
);

const RenditaPanel: React.FC<RenditaPanelProps> = ({
  fondo, isFreePlan, montanteLordo, aliquotaSostitutiva, orizzonteAnni,
}) => {
  const { token } = useAuth();
  const fondiCoperti = useCoperturaRendite();
  const { stato, dati } = useRenditeFondo(fondo?.nAlbo, token, !isFreePlan && !!fondo);

  const [etaPensionamento, setEtaPensionamento] = useState(67);
  const [chiave, setChiave] = useState<string | null>(null);
  const [frequenza, setFrequenza] = useState<Frequenza>('mensile');
  const [sesso, setSesso] = useState<Sesso>('M');
  const [etaReversionario, setEtaReversionario] = useState(64);

  // fondi con piu tariffe (per data di adesione, o per tasso tecnico scelto alla conversione)
  const [idSet, setIdSet] = useState<string | null>(null);
  const tariffe = useMemo(() => (dati ? setDisponibili(dati) : []), [dati]);
  const piuTariffe = tariffe.length > 1;
  useEffect(() => {
    // al cambio di fondo si parte dalla tariffa in vigore; se il fondo non ne indica una, la sceglie l'utente
    setIdSet(tariffe.length > 1 ? (tariffe.find((t) => t.set_corrente === true)?.id_set ?? null) : null);
  }, [tariffe]);
  const tariffaDaSceglierePronta = piuTariffe && idSet == null;
  const idSetUsato = piuTariffe && idSet != null ? idSet : undefined;

  const opzioni = useMemo(
    () => (dati && !tariffaDaSceglierePronta ? opzioniDisponibili(dati, idSetUsato) : []),
    [dati, idSetUsato, tariffaDaSceglierePronta]);
  const requisiti = useMemo(
    () => (dati && !tariffaDaSceglierePronta ? requisitiInput(dati, idSetUsato) : null),
    [dati, idSetUsato, tariffaDaSceglierePronta]);

  // al cambio di fondo: vitalizia semplice se c'e, altrimenti la prima opzione
  useEffect(() => {
    if (!opzioni.length) { setChiave(null); return; }
    if (chiave && opzioni.some((o) => chiaveOpzione(o) === chiave)) return;
    const base = opzioni.find((o) => o.tipologia === 'vitalizia_immediata') ?? opzioni[0];
    setChiave(chiaveOpzione(base));
  }, [opzioni]); // eslint-disable-line react-hooks/exhaustive-deps

  const opzione = opzioni.find((o) => chiaveOpzione(o) === chiave) ?? null;
  const rateazioni = useMemo(() => (dati && opzione ? rateazioniDisponibili(dati, opzione, idSetUsato) : []), [dati, opzione, idSetUsato]);
  const frequenzaUsata: Frequenza = rateazioni.includes(frequenza) ? frequenza : (rateazioni[0] ?? 'annuale');

  // l'anno di nascita si ricava da eta al pensionamento e orizzonte: non serve chiederlo
  const annoNascita = new Date().getFullYear() + orizzonteAnni - etaPensionamento;

  const esito = useMemo(() => {
    if (!dati || !opzione) return null;
    try {
      return {
        risultato: calcolaRendita(dati, {
          idSet: idSetUsato,
          etaPensionamento,
          annoNascita,
          sesso: requisiti?.richiedeSesso ? sesso : undefined,
          tipologia: opzione.tipologia,
          durataCertaAnni: opzione.durataCertaAnni,
          percReversibilita: opzione.percReversibilita,
          deltaEtaReversionario: opzione.tipologia === 'reversibile' ? etaReversionario - etaPensionamento : null,
          frequenza: frequenzaUsata,
          tassoTecnico: opzione.tassoTecnico,
          montante: montanteLordo,
        }),
        errore: null as string | null,
      };
    } catch (e) {
      return { risultato: null, errore: e instanceof RenditaNonCalcolabile ? e.motivo : 'Calcolo non riuscito' };
    }
  }, [dati, opzione, idSetUsato, etaPensionamento, annoNascita, requisiti, sesso, etaReversionario, frequenzaUsata, montanteLordo]);

  const intestazione = (
    <div>
      <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        In alternativa al capitale: la rendita
      </h4>
      <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1">
        Quanto riceverebbe il cliente ogni mese convertendo il capitale in rendita, con i coefficienti ufficiali del fondo.
      </p>
    </div>
  );

  /* ── Piano Free: si dice cosa c'e, senza mostrare cifre ── */
  if (isFreePlan) {
    return (
      <div className="space-y-4" data-tour="simulator-rendita">
        {intestazione}
        <Riquadro tono="avviso">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 text-lg mt-0.5">🔒</span>
            <div className="space-y-2">
              <p className="font-semibold text-slate-900 dark:text-slate-100">Rendita mensile con i coefficienti reali del fondo</p>
              <p>
                Con il piano <strong>Full Access</strong> il simulatore trasforma il capitale in rendita usando le tavole
                ufficiali di conversione{fondiCoperti ? <> di <strong>{fondiCoperti} fondi pensione</strong></> : ''}:
                vitalizia, certa per 5 o 10 anni, reversibile, con restituzione del capitale, in base a età, sesso e rateazione.
              </p>
              <a
                href={SUBSCRIPTION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg shadow-sm hover:shadow-md transition-all"
              >
                Acquista Full Access
              </a>
            </div>
          </div>
        </Riquadro>
      </div>
    );
  }

  if (!fondo) {
    return (
      <div className="space-y-4">
        {intestazione}
        <Riquadro>Seleziona il fondo del cliente in alto per calcolare la rendita con i coefficienti del fondo.</Riquadro>
      </div>
    );
  }

  if (stato === 'caricamento' || stato === 'idle') {
    return (
      <div className="space-y-4">
        {intestazione}
        <div className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
      </div>
    );
  }

  if (stato !== 'pronto' || !dati) {
    const messaggi: Record<string, string> = {
      assente: `${fondo.pip} non pubblica le tavole dei coefficienti di conversione in rendita: la rendita non può essere stimata con dati ufficiali.`,
      non_abbonato: 'I coefficienti di rendita sono riservati agli abbonati Full Access.',
      errore: 'Non è stato possibile caricare i coefficienti del fondo. Riprova tra qualche istante.',
    };
    return (
      <div className="space-y-4">
        {intestazione}
        <Riquadro tono="avviso">{messaggi[stato] ?? messaggi.errore}</Riquadro>
      </div>
    );
  }

  const r = esito?.risultato ?? null;
  const rateAnno = RATE_PER_ANNO[frequenzaUsata];
  const renditaNettaAnnua = r ? r.renditaAnnuaLorda * (1 - aliquotaSostitutiva) : 0;
  const rataNetta = r ? renditaNettaAnnua / rateAnno : 0;
  const compagnia = dati.convenzioni?.find((c) => (c.set ?? []).some((s) => s.id_set === r?.idSet))?.compagnia;

  return (
    <div className="space-y-5 sm:space-y-6" data-tour="simulator-rendita">
      {intestazione}

      <SchedaFondo dati={dati} idSet={idSetUsato} />

      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-3 sm:p-5 md:p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-10">
          <SimulatorSlider
            label="Età del cliente al pensionamento"
            tooltip="Serve a scegliere il coefficiente. L'anno di nascita si ricava da questa età e dall'orizzonte della simulazione."
            value={etaPensionamento}
            onChange={setEtaPensionamento}
            min={57}
            max={75}
            step={1}
            format={(v) => `${v} anni`}
            accent="emerald"
          />
          {opzione?.tipologia === 'reversibile' && (
            <SimulatorSlider
              label="Età del beneficiario della reversibilità"
              tooltip="Età, al momento del pensionamento del cliente, della persona che riceverà la rendita dopo di lui."
              value={etaReversionario}
              onChange={setEtaReversionario}
              min={40}
              max={85}
              step={1}
              format={(v) => `${v} anni`}
              accent="emerald"
            />
          )}
        </div>

        {piuTariffe && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Tariffa applicabile</span>
            <select
              value={idSet ?? ''}
              onChange={(e) => setIdSet(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            >
              {idSet == null && <option value="">Scegli la tariffa…</option>}
              {tariffe.map((t) => (
                <option key={t.id_set} value={t.id_set}>{etichettaTariffa(t)}</option>
              ))}
            </select>
            <span className="block text-xs text-slate-400 dark:text-slate-500">
              {tariffaDaSceglierePronta
                ? 'Il fondo prevede più tariffe e non indica quale sia in vigore: scegli quella del cliente per vedere la rendita.'
                : 'Il fondo applica coefficienti diversi in base alla data di adesione o al tasso tecnico scelto.'}
            </span>
          </label>
        )}

        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${tariffaDaSceglierePronta ? 'hidden' : ''}`}>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo di rendita</span>
            <select
              value={chiave ?? ''}
              onChange={(e) => setChiave(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            >
              {opzioni.map((o) => (
                <option key={chiaveOpzione(o)} value={chiaveOpzione(o)}>{o.etichetta}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Rateazione</span>
            <select
              value={frequenzaUsata}
              onChange={(e) => setFrequenza(e.target.value as Frequenza)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            >
              {rateazioni.map((f) => <option key={f} value={f}>{ETICHETTE_RATE[f]}</option>)}
            </select>
          </label>
        </div>

        {requisiti?.richiedeSesso && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sesso del cliente</span>
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              {(['M', 'F'] as Sesso[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSesso(s)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    sesso === s ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {s === 'M' ? 'Uomo' : 'Donna'}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">Questo fondo usa coefficienti diversi per uomini e donne.</span>
          </div>
        )}
      </div>

      {esito?.errore && !tariffaDaSceglierePronta && <Riquadro tono="avviso">{esito.errore}</Riquadro>}

      {r && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-5 md:px-6 py-3 sm:py-4 gap-1 sm:gap-2">
              <div>
                <span className="text-xs sm:text-sm md:text-base text-slate-700 dark:text-slate-300">Rendita annua lorda</span>
                <p className="text-[11px] sm:text-xs md:text-sm text-slate-400 dark:text-slate-500 mt-0.5">
                  {formatCurrency(montanteLordo)} × coefficiente {r.coefficientePerMille.toLocaleString('it-IT', { maximumFractionDigits: 3 })}‰
                  {r.correzioneEtaApplicata !== 0 && <> (età assicurativa {r.etaAssicurativa} anni)</>}
                </p>
              </div>
              <span className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(r.renditaAnnuaLorda)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-5 md:px-6 py-3 sm:py-4 gap-1 sm:gap-2">
              <div>
                <span className="text-xs sm:text-sm md:text-base text-slate-700 dark:text-slate-300">Tassa sulla rendita</span>
                <p className="text-[11px] sm:text-xs md:text-sm text-slate-400 dark:text-slate-500 mt-0.5">
                  Stessa imposta sostitutiva del capitale ({(aliquotaSostitutiva * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%)
                </p>
              </div>
              <span className="text-sm sm:text-base font-semibold text-rose-600 dark:text-rose-400">
                -{formatCurrency(r.renditaAnnuaLorda - renditaNettaAnnua)}
              </span>
            </div>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/30 border-t-2 border-emerald-300 dark:border-emerald-700 px-3 sm:px-5 md:px-6 py-4 sm:py-5 md:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs sm:text-sm md:text-base font-bold text-emerald-800 dark:text-emerald-200">
                  Rata {NOME_RATA[frequenzaUsata]} netta stimata
                </p>
                <p className="text-[11px] sm:text-xs md:text-sm text-emerald-600 dark:text-emerald-400 mt-0.5 sm:mt-1">
                  {formatCurrency(renditaNettaAnnua)} netti l'anno, rivalutati ogni anno con i rendimenti della gestione
                </p>
              </div>
              <span className="text-xl sm:text-2xl md:text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(rataNetta)}
              </span>
            </div>
          </div>
        </div>
      )}

      {opzione && (
        <TabellaCoefficienti
          dati={dati}
          opzione={opzione}
          frequenza={frequenzaUsata}
          etaEvidenziata={r?.etaAssicurativa}
          idSet={idSetUsato}
        />
      )}

      {opzione?.tipologia === 'reversibile' && <NotaReversibilita dati={dati} opzione={opzione} idSet={idSetUsato} />}

      {r && (
        <div className="space-y-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          <p>
            Coefficienti {compagnia ? <>di <strong className="font-medium text-slate-600 dark:text-slate-300">{compagnia}</strong></> : 'del fondo'}
            {r.tassoTecnico != null && <>, tasso tecnico {String(r.tassoTecnico).replace('.', ',')}%</>}
            {r.baseDemografica && <>, tavola {r.baseDemografica}</>}.
          </p>
          {r.avvertenze.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 text-amber-700 dark:text-amber-400">
              {r.avvertenze.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          <p className="text-slate-400 dark:text-slate-500">
            Nota: la rendita è calcolata sull'intero capitale e con i coefficienti in vigore oggi, che la compagnia può
            aggiornare prima del pensionamento. Alla pensione il cliente può ritirare fino al 50% in capitale e convertire il resto.
          </p>
        </div>
      )}
    </div>
  );
};

export default RenditaPanel;
