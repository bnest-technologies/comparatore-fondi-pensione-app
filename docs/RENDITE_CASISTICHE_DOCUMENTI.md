# Censimento delle casistiche — 91 documenti sulle rendite

Analisi condotta sui file in `Schede informative fondi pensione\Documenti su rendite`, estraendo il testo di ogni PDF e classificandolo in modo automatico. Serve a dare all'agente di estrazione un quadro completo prima di partire, invece di scoprire i casi limite uno alla volta. **Aggiornata il 12/09/2026** dopo il ricaricamento dei documenti mancanti.

## 1. Copertura

| | |
|---|---|
| File presenti | 94 |
| Fondi distinti | **92** |
| Con tabelle leggibili dal testo | **77** |
| Con tabelle presenti ma solo come immagine | **14** |
| Senza coefficienti nel documento | **1** |

Il ricaricamento ha risolto quasi tutti i casi aperti: gli albi **1, 5, 8, 22, 37, 39, 115, 153** ora contengono tabelle regolari, e **34** è stato eliminato perché il documento non è reperibile. Sono stati inoltre recuperati tre file che in precedenza sfuggivano all'analisi per via dell'apostrofo nel nome (**77 FONDOSANITÀ, 5029 CRÉDIT AGRICOLE, 5069 AXA**): tutti e tre hanno tabelle regolari.

**Restano da leggere visivamente (14 fondi)** — le tabelle ci sono, ma sono immagini:

- **12 documenti interamente a pagine-immagine**: albi **2, 93, 107, 122, 127, 136, 139, 143, 148, 157, 164, 170**. `pdftotext` restituisce zero caratteri su quasi tutte le pagine.
- **2 documenti testuali con le sole tabelle in forma di immagine**: **123 FONTE** (pagine 11–14: i titoli "Tabella C / Tabella E / Tabella F – Coefficienti di conversione…" sono testo, le tabelle sotto sono immagini) e **126 MEDIAFOND** (pagine 11–19 prive di testo).

**Un solo documento non contiene i coefficienti: 129 EUROFER.** Il file è quello ufficiale pubblicato dal fondo, ma è il fascicolo informativo della polizza collettiva Unipol: scheda sintetica, nota informativa, condizioni di assicurazione, glossario, modulo di adesione e informativa privacy. Le uniche tabelle numeriche sono alle pagine 15–30 e sono progetti esemplificativi ("Sviluppo delle prestazioni in base a: A) tasso di rendimento minimo garantito / B) ipotesi di rendimento finanziario"), ripetuti per ciascuna tariffa. L'espressione "coefficienti di conversione" non compare mai nel documento. Per questo fondo i coefficienti vanno reperiti altrove — allegato tecnico o richiesta diretta al fondo — oppure il fondo va marcato come non confrontabile sulle rendite.

**Duplicati da rimuovere**: l'albo **8** (Generali Global) ha oggi tre file. Quello buono è `8-GENERALI GLOBAL…` (47 pagine, tabelle testuali); vanno eliminati `08-GENERALI GLOBAL…` e `FPA_GG_Documento_sulle_rendite_2026-07`, entrambi di 9 pagine e con le tabelle non leggibili.

## 2. I layout di tabella

I layout **non sono alternativi**: si combinano. La forma più comune nei fondi negoziali è una tabella per **ogni combinazione** di tipologia × tasso tecnico × sesso, ciascuna con le colonne per rateazione.

| Layout | Righe / Colonne | Diffusione |
|---|---|---|
| **A** — per rateazione | età × annuale, semestrale, (quadrimestrale), (bimestrale), trimestrale, mensile | 72 documenti |
| **B** — per sesso | età × Maschi / Femmine, con frequenza unica dichiarata nel titolo | 37 documenti |
| **A × B** | tabelle separate per sesso, ognuna con le colonne per rateazione | frequente nei negoziali (es. PREVIAMBIENTE 88, PEGASO 100, TELEMACO 103, FONDAPI 116) |
| **C** — matrice reversibile | età testa primaria × differenza di età con la testa reversionaria (−5…+5), sola rata annuale | 36 documenti |

**Rateazioni effettivamente presenti**: oltre ad annuale/semestrale/trimestrale/mensile, **32 documenti prevedono la bimestrale** e **23 la quadrimestrale**. Il set di colonne non è mai assumibile a priori: va letto.

**Range di età**: 28 combinazioni diverse fra i documenti leggibili. La più frequente è 50–80, ma si va da 40–60 a 50–95, passando per 45–85, 55–75, 41–82, 49–78. Nessuna assunzione è lecita.

**Passo delle età**: non è sempre di un anno.
- **5087 UNICREDIT FUTURO PIP CNP** elenca le età a **passo 2** (49, 51, 53 … 77).
- **5051 AVIVA PRO FUTURO** usa un **passo misto**: da 55 a 65 procede di due anni in due anni, poi da 66 in avanti di anno in anno.

Le età intermedie non vanno interpolate né completate: si estrae quello che c'è. Se il comparatore avrà bisogno di un'età non tabulata, l'interpolazione è una scelta di prodotto da fare a valle, consapevolmente, non un'iniziativa dell'estrazione.

## 3. Quante tabelle per fondo

Il numero di tabelle per documento è il prodotto di più moltiplicatori:

- **tipologia di rendita**: vitalizia, certa 5, certa 10, reversibile (79 documenti, con 1–3 percentuali diverse), controassicurata (75 documenti), LTC (31 documenti);
- **tasso tecnico**: 50 documenti ne dichiarano uno solo, ma **18 ne hanno due, 6 ne hanno tre e 2 ne hanno cinque**. Ogni tasso tecnico raddoppia o triplica l'intero set di tabelle;
- **sesso**: 37 documenti distinguono M/F;
- **set di validità**: vedi §4.

COMETA, che è un caso medio, contiene 12 tabelle (6 tipologie × 2 tassi tecnici). Un negoziale con 3 tassi tecnici e distinzione per sesso ne può contenere oltre 30.

## 4. Set multipli e criteri di applicabilità

Oltre al caso già noto di EURORISPARMIO (due set distinti per data di adesione e di erogazione, con basi tecniche **e tabella di correzione età diverse**), esiste una variante ulteriore:

**CNP Top Pension (5027)** differenzia i coefficienti **per sesso solo per le adesioni antecedenti al 21/12/2012**, applicando tabelle unisex a quelle successive — conseguenza della direttiva europea sulla parità di genere nei contratti assicurativi. Lo stesso documento contiene quindi sia tabelle M/F sia tabelle unisex, entrambe valide, per platee diverse.

Il criterio che separa i set può quindi essere la data di adesione, la data di richiesta della prestazione, o entrambe. Va sempre catturato come testo letterale.

## 5. Scala dei coefficienti

Tre scale in uso: per **1 €** di premio (valori tipo 0,0458), per **1.000 €** (valori tipo 26,72) e per **10.000 €** (CNP 5027 dichiara esplicitamente "per 10.000,00 euro di capitale maturato"). 13 documenti usano la scala 10.000.

La dicitura può comparire in posizioni molto diverse: nel sottotitolo della tabella, in una parentesi allineata a destra sopra l'intestazione (`(valori per 1000)`), o solo nel testo dell'articolo che descrive il calcolo. **Il controllo di magnitudine resta il metodo più affidabile**: un vitalizio a 65 anni vale 35–65 per mille una volta normalizzato.

## 6. Perché l'estrazione va fatta in modalità visiva

L'analisi ha prodotto un risultato operativo netto: **il testo estratto da questi PDF non è affidabile per ricostruire le tabelle**, nemmeno quando l'estrazione riesce.

Esempio reale (PREVIAMBIENTE, albo 88) — le intestazioni sono distribuite su due righe e i valori risultano in ordine incoerente rispetto ad esse:

```
     Età      annuale                Rateazione della rendita   mensile           Età
assicurativa            semestrale trimestrale bimestrale                    assicurativa
              26,05002                                         25,73929
      50      26,71969  25,87961  25,79523     25,76723        26,39288           50
```

Due problemi visibili: una **riga di valori orfana**, priva dell'età di riferimento, e un ordine di colonne che non corrisponde alla decrescenza attesa (il valore in ultima posizione è più alto di quello in seconda). Associare le colonne alle frequenze partendo da questo testo è indecidibile: serve vedere la pagina.

### Il caso peggiore: l'estrazione parziale silenziosa

COMETA (albo 61) è l'esempio che dovrebbe chiudere la discussione. L'estrazione testuale **riesce**: produce 33 righe di coefficienti, ben formate e plausibili. Nessun controllo automatico segnala un problema. Ma il documento ne contiene in realtà oltre 250 — le 33 recuperate appartengono a una sola delle dodici tabelle. L'estrazione ha restituito il 13% dei dati **presentandolo come un risultato completo**.

Le righe recuperate mostrano anche la struttura a due blocchi affiancati, che dal testo è indistinguibile da una tabella a più colonne:

```
50   0,0309909  0,0291965   60   0,0369519  0,0351483
```

Qui `50` e `60` sono due righe diverse della stessa tabella, stampate l'una accanto all'altra. Letta come una riga sola, produce quattro coefficienti attribuiti all'età 50.

Ho provato a misurare quanto sia diffuso il fenomeno confrontando le righe estratte con quelle attese, ma la stima è circolare: anche il numero di tipologie e tassi tecnici "attesi" viene letto dallo stesso testo parziale, quindi un documento troncato sembra completo. **L'incompletezza da estrazione testuale non è rilevabile in modo automatico**: è esattamente questo che la rende pericolosa.

Conclusione per l'estrazione: **i PDF vanno dati all'agente come documenti da leggere visivamente**, non come testo pre-estratto. Vale per tutti, non solo per i 12 a pagine-immagine, e vale soprattutto per quelli in cui l'estrazione testuale sembra funzionare.

## 7. Controllo incrociato gratuito: fondi che condividono la convenzione

Diversi fondi negoziali usano la stessa compagnia con le **stesse identiche tabelle**. Sono stati individuati tre gruppi con coefficienti perfettamente coincidenti:

- **88 PREVIAMBIENTE · 103 TELEMACO · 116 FONDAPI · 124 BYBLOS**
- **4 ALLIANZ PREVIDENZA · 118 INSIEME**
- **65 SECONDAPENSIONE · 169 CORE PENSION**

È un test di qualità a costo zero: dopo l'estrazione, i coefficienti di questi fondi devono coincidere cella per cella. Qualsiasi differenza è un errore di lettura, non una differenza reale di prodotto.

## 8. Altre casistiche rilevate

| Casistica | Numeri | Nota |
|---|---|---|
| **Nuove prestazioni Legge di Bilancio 2026** | **62 documenti su 94** | rendita a durata definita, prelievi liberamente determinabili, erogazione frazionata. Non hanno coefficienti; da registrare come flag |
| RITA citata | 43 | non pertinente alle tabelle |
| Convenzione in scadenza / rinnovo | 26 | rilevante per `data_scadenza` e `tacito_rinnovo` |
| Raggruppamento temporaneo di imprese o coassicurazione | 6 | più compagnie per una sola convenzione |
| Tabelle "sviluppo delle prestazioni" / "progetto esemplificativo" | presenti in diversi fascicoli | **non sono coefficienti di conversione**: sono proiezioni su un premio di 10.000 € con righe = anni. È la tabella che in call sembrava un caso anomalo con "righe 0–30 e base 10.000". Va esclusa dall'estrazione |
| Tabella di correzione dell'età | 28 documenti | gli altri non la prevedono |
| Righe per "anni trascorsi" | **0 casi confermati** | l'unico riscontro testuale era un falso positivo (formula di rivalutazione). La casistica sospettata in call corrisponde in realtà alle tabelle di sviluppo prestazioni |

## 9. Cosa fare prima di lanciare l'estrazione

1. **Eliminare i due file superflui dell'albo 8**, tenendo solo `8-GENERALI GLOBAL…` da 47 pagine.
2. **Decidere cosa fare di EUROFER (129)**: reperire i coefficienti da un'altra fonte, oppure marcare il fondo come non confrontabile sulle rendite. È l'unico caso rimasto in cui il dato non esiste nel documento.
3. Lanciare l'estrazione in modalità visiva su tutti i PDF, un documento per esecuzione. I 14 documenti a tabelle-immagine non richiedono un trattamento diverso: è lo stesso flusso.
4. Usare il controllo incrociato del §7 come primo test di qualità sui risultati.

**Stato attuale: 91 fondi su 92 sono lavorabili** (77 con tabelle testuali, 14 solo visive). L'unico escluso è EUROFER.
