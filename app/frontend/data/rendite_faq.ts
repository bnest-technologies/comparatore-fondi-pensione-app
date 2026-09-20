/**
 * Domande frequenti sulla rendita, pensate per il consulente che deve spiegarle al cliente.
 *
 * Gli esempi numerici vengono dai coefficienti ufficiali presenti nel database delle rendite
 * (per esempio un PIP con tasso tecnico 0% e tavola A62), cosi coincidono con quello che il
 * simulatore mostra. Ogni risposta e una lista di paragrafi; `elenco` aggiunge punti elenco.
 */

export interface VoceFaqRendite {
  domanda: string;
  risposta: string[];
  elenco?: string[];
  /** paragrafi dopo l'elenco */
  chiusura?: string[];
}

export interface GruppoFaqRendite {
  id: string;
  titolo: string;
  sottotitolo: string;
  voci: VoceFaqRendite[];
}

export const RENDITE_FAQ: GruppoFaqRendite[] = [
  {
    id: 'basi',
    titolo: 'Le basi',
    sottotitolo: 'Cos’è la rendita e cosa si può scegliere alla pensione',
    voci: [
      {
        domanda: 'Cos’è la rendita del fondo pensione?',
        risposta: [
          'È la pensione complementare vera e propria: una somma pagata periodicamente (di solito ogni mese) a partire dal pensionamento, ottenuta convertendo il capitale accumulato nel fondo.',
          'La conversione avviene con un “coefficiente di trasformazione”, pubblicato dal fondo: la rendita annua è il capitale moltiplicato per il coefficiente. Se il coefficiente a 67 anni è 40 per mille, 100.000 euro diventano 4.000 euro lordi l’anno.',
        ],
      },
      {
        domanda: 'Capitale o rendita: cosa può scegliere il cliente?',
        risposta: [
          'Alla pensione il cliente può ritirare in capitale fino al 50% di quanto ha accumulato; il resto viene convertito in rendita.',
        ],
        elenco: [
          'Può ritirare tutto in capitale se la rendita che otterrebbe convertendo il 70% del capitale è inferiore alla metà dell’assegno sociale: succede con capitali piccoli.',
          'Può ritirare tutto in capitale anche chi è un “vecchio iscritto”, cioè iscritto a una forma pensionistica complementare prima del 29 aprile 1993.',
        ],
        chiusura: [
          'Nel simulatore la rendita è calcolata sull’intero capitale, per far vedere il massimo che il cliente può ottenere in forma di rendita.',
        ],
      },
      {
        domanda: 'Chi paga la rendita?',
        risposta: [
          'Una compagnia di assicurazione. Nei PIP e nei fondi aperti è in genere la stessa compagnia che gestisce il prodotto; nei fondi negoziali è la compagnia con cui il fondo ha stipulato una convenzione, che ha una scadenza e viene rinnovata periodicamente.',
          'Per questo, nel documento sulle rendite, conviene guardare anche il nome della compagnia e la durata della convenzione.',
        ],
      },
      {
        domanda: 'Una volta scelta, la rendita si può cambiare o riscattare?',
        risposta: [
          'No. La rendita vitalizia, una volta avviata, non si può riscattare né trasformare in capitale: per questo la scelta del tipo di rendita va fatta con attenzione al momento del pensionamento.',
        ],
      },
      {
        domanda: 'La rendita resta sempre uguale?',
        risposta: [
          'No, cresce nel tempo: ogni anno viene rivalutata con il rendimento della gestione separata della compagnia, al netto di una commissione trattenuta dalla compagnia stessa. Gli aumenti, una volta riconosciuti, restano acquisiti.',
          'Quanto cresce dipende anche dal tasso tecnico (vedi la domanda dedicata).',
        ],
      },
    ],
  },
  {
    id: 'tipologie',
    titolo: 'I tipi di rendita',
    sottotitolo: 'Quali esistono, come funzionano e quanto “costano” rispetto alla vitalizia semplice',
    voci: [
      {
        domanda: 'Che tipi di rendita esistono?',
        risposta: [
          'Quasi tutti i fondi offrono una rendita vitalizia di base e alcune varianti che aggiungono una protezione per i familiari o per la vecchiaia. Ogni protezione in più si paga con una rata un po’ più bassa.',
        ],
        elenco: [
          'Vitalizia immediata: pagata finché il cliente è in vita. È quella con la rata più alta.',
          'Certa per 5 o 10 anni e poi vitalizia: nei primi anni è pagata comunque, anche ai beneficiari se il cliente muore; poi prosegue finché il cliente è in vita.',
          'Reversibile: alla morte del cliente continua, in tutto o in parte (per esempio il 60% o il 100%), a favore di una persona scelta, di solito il coniuge.',
          'Controassicurata (con restituzione del capitale): alla morte del cliente i beneficiari ricevono il capitale residuo non ancora pagato sotto forma di rate.',
          'Con maggiorazione LTC (long term care): la rata raddoppia se il cliente perde l’autosufficienza. In cambio la rata iniziale è più bassa.',
        ],
        chiusura: [
          'Non tutti i fondi le offrono tutte: il simulatore mostra solo quelle previste dal fondo scelto.',
        ],
      },
      {
        domanda: 'Quanto costa, in termini di rata, ogni protezione in più?',
        risposta: [
          'Un esempio con i coefficienti reali di un PIP (tasso tecnico 0%), per un cliente di 65 anni e 100.000 euro di capitale, rata annua lorda:',
        ],
        elenco: [
          'Vitalizia immediata: circa 3.794 euro.',
          'Certa 10 anni e poi vitalizia: circa 3.763 euro (-1%).',
          'Reversibile al 60% su un coniuge di 60 anni: circa 3.233 euro (-15%).',
          'Controassicurata: circa 3.215 euro (-15%).',
          'Reversibile al 100% su un coniuge di 60 anni: circa 2.943 euro (-22%).',
        ],
        chiusura: [
          'La rendita certa costa poco perché, a 65 anni, la probabilità di morire nei primi anni è bassa; la reversibile costa di più perché la rendita deve coprire anche la vita, più lunga, di un coniuge più giovane.',
        ],
      },
      {
        domanda: 'Per chi è adatta ciascuna tipologia?',
        risposta: ['Una traccia per il colloquio con il cliente:'],
        elenco: [
          'Vitalizia immediata: per chi vuole la rata più alta e non ha familiari da proteggere.',
          'Certa 5 o 10 anni: per chi teme di “perdere” il capitale in caso di morte precoce, rinunciando a pochissimo.',
          'Reversibile: per chi ha un coniuge o un familiare che dipende dal suo reddito.',
          'Controassicurata: per chi vuole lasciare agli eredi quello che non ha ancora ricevuto.',
          'Con LTC: per chi vuole una tutela contro il rischio di non autosufficienza in vecchiaia.',
        ],
      },
      {
        domanda: 'Cosa sono la rendita a durata definita e i prelievi liberamente determinabili?',
        risposta: [
          'Sono prestazioni alternative alla rendita vitalizia introdotte dalle nuove regole e offerte da molti fondi dal 1° luglio 2026.',
        ],
        elenco: [
          'Rendita a durata definita: pagata per un numero di anni pari alla speranza di vita residua calcolata dall’ISTAT, arrotondata per difetto. Non dipende dalla sopravvivenza: finisce alla scadenza anche se il cliente è ancora in vita. Il capitale resta investito e la rata viene ricalcolata a ogni pagamento.',
          'Prelievi liberamente determinabili: il cliente decide quando e quanto prelevare, entro il limite delle rate di una rendita a durata definita “teorica” maturate e non ancora prelevate.',
        ],
        chiusura: [
          'Non sono rendite assicurative e non usano i coefficienti di trasformazione: il simulatore calcola le rendite vitalizie e le loro varianti.',
        ],
      },
    ],
  },
  {
    id: 'calcolo',
    titolo: 'Da cosa dipende l’importo',
    sottotitolo: 'Età, sesso, tasso tecnico, tavola di mortalità e rateazione',
    voci: [
      {
        domanda: 'Perché la rendita cambia con l’età?',
        risposta: [
          'Perché il capitale va distribuito sugli anni di vita attesi: più tardi si va in pensione, meno anni restano, e ogni rata è più alta.',
          'Con i coefficienti di un PIP a tasso tecnico 0%, 100.000 euro diventano circa 3.222 euro lordi l’anno a 60 anni, 3.794 a 65 e 4.600 a 70. Posticipare la conversione di cinque anni aumenta la rata del 15-20%.',
        ],
      },
      {
        domanda: 'Cos’è la “correzione dell’età” per anno di nascita?',
        risposta: [
          'Chi nasce più tardi, in media, vive più a lungo. Per tenerne conto i fondi non usano l’età anagrafica ma un’età “assicurativa”, ringiovanendo o invecchiando il cliente di qualche anno a seconda dell’anno di nascita, secondo una tabella pubblicata nel documento sulle rendite.',
          'Per esempio, per un nato negli anni ’80 molti fondi tolgono 2 anni: a 67 anni il coefficiente usato è quello dei 65. Il simulatore applica la correzione in automatico e indica l’età assicurativa usata.',
        ],
      },
      {
        domanda: 'Perché la rendita cambia se il cliente è uomo o donna?',
        risposta: [
          'Perché in media le donne vivono più a lungo: a parità di capitale, la rendita va pagata per più anni e la rata è più bassa. Con una tavola distinta per sesso, a 65 anni un uomo ottiene circa 57,7 euro l’anno ogni 1.000 di capitale, una donna 51,4 (circa l’11% in meno).',
          'Dal 21 dicembre 2012 i contratti individuali, come i PIP, devono usare coefficienti uguali per uomini e donne (“unisex”), calcolati su una popolazione mista. Alcuni fondi negoziali e i contratti stipulati prima di quella data usano ancora coefficienti distinti: per questo il simulatore chiede il sesso solo quando il fondo lo richiede.',
        ],
      },
      {
        domanda: 'Cos’è il tasso tecnico e come si sceglie?',
        risposta: [
          'È un rendimento che la compagnia “anticipa” nella prima rata. Con un tasso tecnico più alto la rata iniziale è più alta, ma le rivalutazioni degli anni successivi sono più basse, perché una parte del rendimento è già stata pagata in anticipo. Con tasso tecnico 0% la rata parte più bassa e cresce di più nel tempo.',
          'Per esempio, a 65 anni lo stesso fondo può offrire circa 37 euro l’anno ogni 1.000 con tasso 0% e circa 43 con tasso 1%. Non è un guadagno “gratis”: è una diversa distribuzione nel tempo.',
          'Quando un fondo offre più tassi tecnici, nel simulatore la scelta è del consulente: la rata più alta subito conviene a chi preferisce disporre di più reddito nei primi anni, quella più bassa a chi vuole una rendita che cresca di più nel tempo.',
        ],
      },
      {
        domanda: 'Cos’è la tavola di mortalità (A62, IPS55…)?',
        risposta: [
          'È la tabella di aspettative di vita usata dalla compagnia per calcolare i coefficienti, elaborata dall’ANIA. Le tavole più recenti, come la A62, prevedono vite più lunghe rispetto a quelle più vecchie, come la IPS55: a parità di altre condizioni danno coefficienti più bassi.',
          'Per il cliente conta soprattutto un aspetto: se il fondo aggiorna la tavola prima del suo pensionamento, i coefficienti possono scendere.',
        ],
      },
      {
        domanda: 'Perché la rata mensile vale un po’ meno della rata annua divisa per dodici?',
        risposta: [
          'Perché ricevere la rendita a rate frequenti ha un costo: la compagnia paga prima e gestisce più pagamenti. Nell’esempio del PIP a tasso 0%, a 65 anni il coefficiente è 37,94 per mille con rata annuale e 36,89 con rata mensile: circa il 3% in meno sull’importo annuo.',
        ],
      },
      {
        domanda: 'I coefficienti di oggi saranno quelli usati alla pensione del cliente?',
        risposta: [
          'Non necessariamente. La compagnia può aggiornarli, ad esempio quando cambiano le aspettative di vita o i tassi di mercato, secondo le “condizioni di rivedibilità” scritte nel documento sulle rendite. Di norma deve avvisare con anticipo e le modifiche non riguardano chi è già in rendita.',
          'Per questo la rendita del simulatore è una stima con i coefficienti in vigore oggi, non una garanzia.',
        ],
      },
    ],
  },
  {
    id: 'costi-tasse',
    titolo: 'Costi e tasse',
    sottotitolo: 'Cosa riduce la rata e come viene tassata',
    voci: [
      {
        domanda: 'Quali costi ci sono sulla rendita?',
        risposta: ['Di solito due, entrambi già compresi nel calcolo:'],
        elenco: [
          'Un caricamento per le spese di pagamento, già incluso nei coefficienti: tipicamente tra l’1% e il 3% della rata, più alto per le rate mensili.',
          'Una commissione trattenuta ogni anno dal rendimento della gestione separata, che riduce la rivalutazione della rendita.',
        ],
        chiusura: [
          'Entrambi sono indicati nel documento sulle rendite del fondo: sono voci utili per confrontare due fondi.',
        ],
      },
      {
        domanda: 'Come viene tassata la rendita?',
        risposta: [
          'La parte che deriva dai contributi dedotti e dal TFR è tassata con un’imposta sostitutiva del 15%, che scende di 0,30 punti per ogni anno di iscrizione oltre il quindicesimo, fino a un minimo del 9% dopo 35 anni.',
          'Non si pagano di nuovo tasse sui rendimenti già tassati durante l’accumulo né sui contributi non dedotti. I rendimenti che maturano dopo, durante il pagamento della rendita, sono tassati come rendimenti finanziari.',
          'Il simulatore applica l’imposta sostitutiva a tutta la rendita, per semplicità: la stima del netto è quindi prudente.',
        ],
      },
    ],
  },
  {
    id: 'documenti',
    titolo: 'Dove trovare le informazioni',
    sottotitolo: 'Cosa leggere nel documento sulle rendite e come confrontare i fondi',
    voci: [
      {
        domanda: 'Dove si trovano i coefficienti ufficiali di un fondo?',
        risposta: [
          'Nel “Documento sulle rendite”, che ogni fondo deve pubblicare sul proprio sito insieme alla Nota informativa. A volte i coefficienti sono in un allegato alla convenzione o alle condizioni di contratto. Il simulatore usa i coefficienti presi da questi documenti.',
        ],
      },
      {
        domanda: 'Cosa vale la pena controllare nel documento sulle rendite?',
        risposta: ['Le voci più utili, in ordine di importanza per il cliente:'],
        elenco: [
          'Quali tipi di rendita offre il fondo.',
          'Il tasso tecnico, o i tassi tecnici tra cui scegliere.',
          'I costi: caricamento sulla rata e commissione sulla gestione separata.',
          'La tavola di mortalità e la tabella di correzione dell’età.',
          'Le condizioni di rivedibilità dei coefficienti.',
          'La compagnia che paga la rendita e la scadenza della convenzione.',
        ],
      },
      {
        domanda: 'Nel documento trovo numeri come 25,98 oppure 0,0259: sono la stessa cosa?',
        risposta: [
          'Spesso sì: cambia solo l’unità di misura. Alcuni fondi pubblicano la rendita per 1 euro di capitale (0,0259), altri per 1.000 euro (25,98), altri ancora per 10.000.',
          'Alcuni fondi, invece, pubblicano il “divisore”: quanti euro di capitale servono per 1 euro di rendita annua (per esempio 22,5). In quel caso la rendita si ottiene dividendo il capitale, non moltiplicandolo. Il simulatore riconosce i diversi formati e li converte da solo.',
        ],
      },
      {
        domanda: 'Ha senso scegliere un fondo anche per la sua rendita?',
        risposta: [
          'Sì, come uno dei criteri. A parità di capitale, fondi diversi possono pagare rate diverse, anche del 10-20%, per effetto di tasso tecnico, tavola di mortalità e costi. Dopo due anni di iscrizione il cliente può trasferire la posizione in un altro fondo.',
          'Però la rendita pesa solo alla fine: durante gli anni di accumulo contano di più costi e rendimenti, che determinano quanto capitale ci sarà da convertire. Il confronto delle rendite nel simulatore serve a vedere l’insieme.',
        ],
      },
      {
        domanda: 'Perché la stima del simulatore può essere diversa dalla rendita effettiva?',
        risposta: ['Perché è una stima fatta oggi su un evento futuro:'],
        elenco: [
          'Il capitale reale dipenderà dai rendimenti effettivi e dai versamenti.',
          'I coefficienti possono essere aggiornati prima del pensionamento.',
          'L’imposta è calcolata in modo semplificato e prudente.',
          'Se il fondo non pubblica il coefficiente per l’età esatta, il simulatore lo ricava da quelli vicini e lo segnala.',
        ],
      },
    ],
  },
];
