# Modello dati Rendite — come si integra col database esistente

## 1. Il problema

Il database attuale (fonte principale COVIP) è **flat**: una riga per fondo/comparto, e ogni informazione è un attributo puntuale che diventa una colonna (costi, rendimenti, tipologia di fondo…).

I dati sulle rendite non sono puntuali: per ogni singolo fondo esistono **N matrici bidimensionali** (età × frequenza di pagamento), ciascuna con propri metadati (tipologia di rendita, tasso tecnico, base demografica, sesso, scala di espressione). Non esiste "la colonna coefficiente di rendita" del fondo: ne esistono qualche centinaio per fondo.

Tentare di appiattire le tabelle in colonne della riga-fondo non funziona, per tre motivi:
- il **range di età varia** tra fondi (50–80, 55–75, altri) → colonne sparse e in gran parte NULL;
- il **set di frequenze varia** (alcuni hanno anche la bimestrale) → lo schema cambierebbe a ogni nuovo PDF letto;
- il numero di tabelle per fondo varia (unisex vs M/F, 3 tipologie o 6) → moltiplicatore ingestibile.

## 2. La soluzione: non allargare, affiancare

**Il database esistente non si tocca.** Si affiancano nuove entità in relazione 1:N, agganciate al fondo tramite il **numero di albo COVIP** (già presente come prefisso nel nome dei PDF: `129-FONDO PENSIONE EUROFER_rendite.pdf` → `129`).

Verificato sui dati della repo `daniele21/fund-comparison`: tutti i CSV in `data/` usano `N. ALBO` come chiave (`fondi_info.csv`, `FP_costi`, `database_comparti_2026-06-10`), quindi il join è diretto e non serve alcuna tabella di mappatura.

Una differenza di granularità da tenere presente: il database attuale è organizzato **per comparto** (489 righe di comparto su 124 fondi), mentre la convenzione di rendita è un attributo **del fondo**, non del comparto. Le entità delle rendite si agganciano quindi al livello fondo, e nel comparatore un confronto sulle rendite fra due comparti dello stesso fondo restituirà — correttamente — gli stessi coefficienti. Copertura attuale: 90 fondi con documento sulle rendite su 124 presenti in anagrafica.

I coefficienti si salvano in **formato "long"**: una riga per ogni cella della matrice, invece di una colonna per ogni età. Lo schema resta fisso qualunque sia il range di età o il set di frequenze del singolo fondo.

```
[ fondi ]  (esistente, COVIP)
    │ 1
    │ N
[ rendite_convenzioni ]
    │ 1
    │ N
[ rendite_set ] ──N── [ rendite_correzione_eta ]
    │ 1        └──N── [ rendite_costi ]
    │ N
[ rendite_tabelle ]
    │ 1
    │ N
[ rendite_coefficienti ]   ← formato long, il cuore del dato
```

**Perché esiste `rendite_set`** (livello che a prima vista sembrerebbe superfluo): un singolo documento può contenere **più set completi di coefficienti validi in periodi diversi**. EURORISPARMIO (albo 50) ne ha due — uno per chi ha aderito prima del 01/04/2024 e chiede la prestazione entro il 01/04/2027, uno per tutti gli altri — e i due set differiscono per tavola demografica (A62I vs A62D), tasso tecnico (1% vs 0%), caricamenti **e persino per la tabella di correzione dell'età**. Senza questo livello, un'estrazione prende un set a caso e produce numeri sbagliati senza che nulla lo segnali.

**Volume stimato:** ~90 fondi × ~3 tipologie × ~1,5 (unisex/M+F) × ~30 età × ~4 frequenze ≈ **50–60.000 righe**. Nessun problema di scala: è un dataset piccolo, interrogabile con una query semplice.

## 3. Schema delle entità

### 3.1 `rendite_convenzioni`
Una riga per convenzione assicurativa del fondo (di norma una, ma alcuni fondi ne hanno più di una).

| Campo | Tipo | Note |
|---|---|---|
| `id_convenzione` | PK | generata (`<albo>-C1`, `<albo>-C2`…) |
| `id_fondo` | FK | numero albo COVIP |
| `compagnia` | text | ragione sociale; se RTI, elenco completo |
| `data_scadenza` | date | null se non indicata |
| `tacito_rinnovo` | bool | null se non desumibile |
| `data_documento` | date | data/versione del documento sulle rendite |
| `file_origine` | text | nome del PDF |

### 3.2 `rendite_set`
Una riga per ogni set di coefficienti con proprie basi tecniche e proprio periodo di validità. Nella maggior parte dei fondi ce n'è uno solo.

| Campo | Tipo | Note |
|---|---|---|
| `id_set` | PK | `<albo>-C1-S1` |
| `id_convenzione` | FK | |
| `base_demografica` | text | es. `A62I`, `A62D`, `IPS55DIFF` |
| `valido_da` | date | null se non indicato |
| `valido_a` | date | null se aperto |
| `condizioni_applicabilita` | text | testo letterale che delimita la platea (es. "aderenti precedenti al 01/04/2024 che richiedono la prestazione prima del 01/04/2027") |
| `set_corrente` | bool | true per il set applicabile a un nuovo aderente oggi |

### 3.3 `rendite_tabelle`
Una riga per ogni tabella di coefficienti presente nel documento (combinazione tipologia × tasso tecnico × sesso × opzione).

| Campo | Tipo | Note |
|---|---|---|
| `id_tabella` | PK | `<albo>-C1-S1-T01` |
| `id_set` | FK | |
| `id_convenzione` | FK | |
| `id_fondo` | FK | denormalizzato, per query dirette senza join |
| `tipologia` | enum | `vitalizia_immediata`, `certa_poi_vitalizia`, `reversibile`, `controassicurata`, `ltc` |
| `durata_certa_anni` | int | 5 o 10; null se non applicabile |
| `perc_reversibilita` | numeric | es. 60, 80, 100; null se non applicabile |
| `eta_reversionario_ipotesi` | text | ipotesi usata dalla compagnia (es. "femmina 5 anni più giovane") |
| `sesso` | enum | `M`, `F`, `U` (unisex) |
| `base_demografica` | text | es. `IPS55` |
| `tasso_tecnico` | numeric | in %, **per tabella** (può variare tra tipologie dello stesso fondo) |
| `variabile_riga` | enum | `eta_assicurativa` (caso normale) o `anni_trascorsi` (caso anomalo) |
| `scala_originale` | int | 1, 1000 o 10000 — scala in cui il documento esprime i valori |
| `base_frazionamento` | enum | `annuo_corretto` o `per_rata` — **vedi §5** |
| `qualita` | enum | `ok`, `da_verificare`, `fallita` |
| `pagina_origine` | int | |

### 3.4 `rendite_coefficienti` — formato long
Il cuore del dato. Una riga per cella.

| Campo | Tipo | Note |
|---|---|---|
| `id_tabella` | FK | PK composta con i tre campi seguenti |
| `eta` | int | valore della riga (età assicurativa, o anni trascorsi) |
| `frequenza` | enum | `annuale`, `semestrale`, `quadrimestrale`, `trimestrale`, `bimestrale`, `mensile` |
| `delta_eta_reversionario` | int | solo per le tabelle reversibili: differenza in anni tra età della testa primaria e della testa reversionaria (tipicamente da −5 a +5). `0` (o null) per tutte le altre tipologie |
| `coefficiente_per_mille` | numeric | **normalizzato**: valore per 1.000 € di montante |
| `coefficiente_originale` | numeric | valore come stampato nel PDF, per audit |

`delta_eta_reversionario` esiste perché le tabelle reversibili non hanno la stessa forma delle altre: le colonne non sono le frequenze ma le differenze di età tra le due teste (EURORISPARMIO, albo 50, riporta 11 colonne da −5 a +5, con la sola frequenza annuale). Senza questo campo quelle tabelle non sono rappresentabili.

### 3.5 `rendite_correzione_eta`
Conversione età anagrafica → età assicurativa, per anno di nascita. Agganciata al **set**, non alla convenzione, perché può cambiare tra un set e l'altro dello stesso fondo. Non tutti i documenti la prevedono (COMETA, ad esempio, non ne ha).

| Campo | Tipo | Note |
|---|---|---|
| `id_set` | FK | |
| `id_fondo` | FK | |
| `sesso` | enum | `M`, `F`, `U` |
| `anno_nascita_da` | int | estremo inferiore incluso |
| `anno_nascita_a` | int | estremo superiore incluso |
| `delta_anni` | int | con segno (es. `-1`, `+7`) |

### 3.6 `rendite_costi`
Caricamenti sulla rendita e costo della gestione separata.

| Campo | Tipo | Note |
|---|---|---|
| `id_set` | FK | |
| `tipo_costo` | enum | `caricamento_rata_rendita`, `caricamento_premio`, `caricamento_inserimento_convenzione`, `costo_gestione_separata` |
| `valore_perc` | numeric | |
| `frequenza` | enum | valorizzata quando il caricamento **varia per rateazione**, come in EURORISPARMIO (0,90% annuale / 1,00% semestrale / 1,20% trimestrale / 2,00% mensile); null quando è unico |
| `ambito` | text | `tutte` oppure la tipologia a cui si applica |
| `note` | text | |

### 3.7 Campo aggiuntivo sul fondo — nuove prestazioni 2026

La Legge di Bilancio 2026 (L. 199/2025, art. 11 co. 3-bis D.Lgs. 252/2005) ha introdotto tre prestazioni alternative alla rendita vitalizia: **rendita a durata definita**, **prelievi liberamente determinabili**, **erogazione frazionata del montante**. Diversi documenti sulle rendite sono già stati integrati per descriverle (EURORISPARMIO lo è).

Queste prestazioni sono erogate direttamente dal fondo, senza compagnia assicurativa, e **non hanno coefficienti di conversione**: non producono quindi righe in `rendite_tabelle`. Vale però la pena registrare a livello di fondo tre flag booleani (`offre_rendita_durata_definita`, `offre_prelievi_liberi`, `offre_erogazione_frazionata`) più la data di disponibilità dichiarata: è un elemento di confronto tra fondi che oggi nessun comparatore mostra, ed è informazione già presente nei PDF che stiamo comunque leggendo.

## 4. Come si usa (query del comparatore)

Dato input utente `(id_fondo, tipologia, durata, sesso, anno_nascita, età_pensionamento, frequenza, montante)`:

1. `rendite_set` → seleziona il set con `set_corrente = true` per quel fondo;
2. `rendite_correzione_eta` → recupera il `delta_anni` di quel set per quell'anno di nascita → **età assicurativa** = età + delta (se il fondo non prevede correzione, età assicurativa = età);
3. `rendite_tabelle` → individua la tabella che corrisponde a tipologia/durata/sesso/tasso tecnico;
4. `rendite_coefficienti` → recupera il `coefficiente_per_mille` per (età assicurativa, frequenza);
5. **rendita annua lorda** = montante × coefficiente_per_mille / 1.000; l'importo della singola rata si ottiene poi dividendo per il numero di rate annue quando `base_frazionamento = annuo_corretto`.

Il confronto tra fondi è quindi un semplice `GROUP BY id_fondo` sulla stessa query, a parità di parametri: è esattamente la sezione "Rendite" del comparatore.

## 5. Tre trappole da non sbagliare

**a) La scala.** I documenti esprimono i coefficienti per 1 €, per 1.000 € o (raramente) per 10.000 €. Vanno normalizzati tutti a **per mille** in `coefficiente_per_mille`, conservando il valore grezzo in `coefficiente_originale`. Regola di riconoscimento: un coefficiente vitalizio a 65 anni vale realisticamente **~35–65 per mille** (valori verificati: COMETA 45,8‰ uomini e 39,2‰ donne; EURORISPARMIO 43,9‰ e 40,9‰ nei due set). Se il valore letto è ~0,05 la scala è 1; se è ~50 la scala è 1.000; se è ~500 la scala è 10.000.

**b) Il significato delle colonne di frequenza.** Due convenzioni diverse coesistono nei documenti:
- `annuo_corretto` (caso più frequente): tutte le colonne esprimono un coefficiente **annuo**, ridotto leggermente all'aumentare della frazionabilità → i valori delle colonne sono simili tra loro (scarti dell'ordine dell'1–3%);
- `per_rata`: la colonna esprime il coefficiente **della singola rata** → il valore mensile è circa 1/12 di quello annuale.

Confondere i due casi introduce un errore di **fattore 12** nella rendita calcolata. Il criterio di riconoscimento è meccanico: se `mensile / annuale ≈ 0,08` siamo in `per_rata`; se `≈ 0,97` siamo in `annuo_corretto`. Il campo `base_frazionamento` registra il caso, così il calcolo a valle sa se moltiplicare per il numero di rate. Verifica su EURORISPARMIO: a 65 anni annuale 0,043925 e mensile 0,042574, rapporto 0,969 → `annuo_corretto`, confermato dal testo del documento ("per determinare la rata di rendita si divide il valore della rendita annua per il numero delle rate").

**c) I set multipli.** Un documento può contenere due o più set completi di tabelle, validi per platee diverse, senza che la differenza sia evidente: i titoli delle tabelle sono identici e l'unica distinzione è una riga di testo tra un blocco e l'altro. Estrarre "la tabella vitalizia" di un fondo che ne ha due significa avere il 50% di probabilità di popolare il database con i coefficienti sbagliati — e nessun controllo numerico se ne accorgerebbe, perché entrambi i set sono internamente coerenti e plausibili. È l'errore più insidioso dei tre, perché silenzioso.

## 6. Formato di consegna dell'estrazione

L'agente Gemini produce **un JSON per PDF**, non un unico file globale. Se un documento fallisce non compromette gli altri e si rilancia solo quello.

Due scelte di formato che riguardano direttamente questo modello:

**I coefficienti arrivano come matrice, non in formato long.** Ogni tabella ha un array `colonne` con le etichette e un array `righe` nella forma `[età, v1, v2, …]`. Il formato long descritto in §3.3 è il formato di **destinazione**, prodotto da uno script di flattening deterministico, non quello di consegna. Il motivo è pratico: un fondo come COMETA ha oltre 500 coefficienti, e chiedere al modello di emettere un oggetto per cella moltiplicherebbe per cinque il testo da trasferire e le occasioni di errore. Copiare righe intere è l'operazione in cui un modello sbaglia meno.

**I valori arrivano grezzi, non normalizzati.** Il JSON riporta i numeri come stampati più il campo `scala_originale`; il calcolo di `coefficiente_per_mille` avviene a valle. Ogni operazione aritmetica chiesta al modello su migliaia di celle è un errore potenziale in più, e per giunta invisibile.

Il `sesso` è sempre un attributo della tabella: quando il PDF affianca le colonne Maschi e Femmine, il JSON contiene due tabelle distinte. Così `colonne` contiene sempre e solo rateazioni oppure differenze di età del reversionario, e il flattening è uniforme per tutti i layout.

Il prompt operativo completo è in `PROMPT PER GEMINI.md`; le casistiche rilevate sui 92 documenti sono in `Casistiche documenti rendite.md`.
