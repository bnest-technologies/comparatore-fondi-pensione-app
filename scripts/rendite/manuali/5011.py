# -*- coding: utf-8 -*-
"""5011 AXA MPS PREVIDENZA PERSONALE - AXA MPS Assicurazioni Vita - Condizioni generali, Allegato 1. Trascritto a mano."""
import json, os

COL = ["annuale", "semestrale", "mensile"]
ETA = list(range(50, 71))

CORRENTE = [  # pag. 14, prima tabella
 (25.120,24.970,24.830),(25.750,25.580,25.450),(26.410,26.230,26.090),(27.090,26.910,26.760),
 (27.820,27.620,27.460),(28.580,28.370,28.200),(29.380,29.160,28.980),(30.220,29.990,29.800),
 (31.110,30.870,30.670),(32.060,31.800,31.590),(33.060,32.790,32.560),(34.130,33.830,33.590),
 (35.260,34.950,34.690),(36.460,36.130,35.850),(37.740,37.390,37.090),(39.110,38.730,38.420),
 (40.580,40.170,39.830),(42.160,41.720,41.350),(43.860,43.380,42.990),(45.700,45.180,44.750),
 (47.680,47.110,46.650)]

ANTE2014 = [  # pag. 14, seconda tabella
 (35.470,35.150,34.900),(36.180,35.850,35.590),(36.930,36.590,36.310),(37.730,37.370,37.080),
 (38.560,38.190,37.880),(39.440,39.050,38.730),(40.370,39.970,39.630),(41.360,40.930,40.580),
 (42.410,41.960,41.590),(43.520,43.050,42.660),(44.710,44.210,43.800),(45.970,45.440,45.010),
 (47.310,46.750,46.290),(48.740,48.140,47.660),(50.260,49.620,49.110),(51.880,51.210,50.660),
 (53.610,52.900,52.310),(55.470,54.700,54.080),(57.470,56.640,55.970),(59.610,58.730,58.010),
 (61.930,60.970,60.200)]

CORR_CORRENTE = [(None,1907,7),(1908,1917,6),(1918,1921,5),(1922,1927,4),(1928,1938,3),
                 (1939,1947,2),(1948,1957,1),(1958,1966,0),(1967,1977,-1),(1978,1989,-2),
                 (1990,2001,-3),(2002,2014,-4)]
CORR_ANTE2014 = [(None,1926,3),(1927,1938,2),(1939,1947,1),(1948,1960,0),(1961,1970,-1),(1971,None,-2)]

for nome, b in (("CORRENTE", CORRENTE), ("ANTE2014", ANTE2014)):
    assert len(b) == len(ETA), f"{nome}: {len(b)} righe invece di {len(ETA)}"

COND_ANTE = "Adesioni con decorrenza fino al 31/03/2014 e versamenti fino al 16/06/2014"

def tabella(idx, titolo, tasso, valori, nota):
    return {
      "verso_conversione": "moltiplicatore", "id_tabella": f"5011-T{idx:02d}",
      "titolo_stampato": titolo, "tipologia": "vitalizia_immediata", "durata_certa_anni": None,
      "perc_reversibilita": None, "eta_reversionario_ipotesi": None, "sesso": "U",
      "base_demografica": None, "tasso_tecnico": tasso, "variabile_riga": "eta_assicurativa",
      "scala_originale": 1000, "base_frazionamento": "annuo_corretto", "tipo_colonne": "frequenza",
      "colonne": COL, "righe": [[e] + list(v) for e, v in zip(ETA, valori)],
      "pagina_origine": 14, "qualita": "ok", "note": nota,
    }

def correzione(regole):
    return [{"sesso": "U", "anno_nascita_da": a, "anno_nascita_a": b, "delta_anni": d} for a, b, d in regole]

NOTA_TASSO = ("Il titolo non dichiara il tasso tecnico; e ricavato dall'Art. 16 delle Condizioni, "
              "che fissa il tasso tecnico della rendita allo 0,00% (1,50% per le adesioni fino al 31/03/2014).")

COSTI = [{"tipo_costo": "caricamento_premio", "valore_perc": 3.00, "frequenza": None,
          "note": "Spesa percentuale su ciascun versamento (Art. 11), fase di accumulo."},
         {"tipo_costo": "trattenuta_rendimento_gestione_separata", "valore_perc": 1.10, "frequenza": None,
          "note": "Commissione trattenuta sul rendimento della gestione separata in fase di erogazione (Art. 16)."}]

doc = {
  "id_fondo": "5011", "nome_fondo": "AXA MPS PREVIDENZA PERSONALE",
  "file_origine": "5011-AXA MPS PREVIDENZA PERSONALE - PIANO INDIVIDUALE PENSIONISTICO DI TIPO ASSICURATIVO - FONDO PENSIONE_rendite.pdf",
  "data_documento": None, "file_pertinente": True,
  "note_documento": ("Trascritto a mano. Il file non e un documento sulle rendite ma le Condizioni generali di "
                     "contratto: i coefficienti sono nell'Allegato 1 (pag. 14), eta 50-70, tre rateazioni "
                     "(annuale, semestrale, mensile). Due set: quello in vigore e quello per le adesioni fino "
                     "al 31/03/2014. Solo rendita vitalizia immediata; non sono pubblicate tavole certe, "
                     "reversibili, controassicurate o LTC. La rendita si rivaluta ogni anno. La base demografica "
                     "non e dichiarata. Rendita a durata definita: 5 euro per rata trimestrale; prelievi: 5 euro "
                     "per prelievo. L'esempio a pag. 15 cita per l'eta 61 il valore 39,96, che non corrisponde alla "
                     "tabella in vigore (34,130): e un residuo di una versione precedente, i valori delle tabelle "
                     "sono stati mantenuti. I coefficienti distinti per sesso in vigore prima del 21/12/2012 non "
                     "sono nel documento."),
  "nuove_prestazioni_2026": {"rendita_durata_definita": True,
                             "prelievi_liberamente_determinabili": True,
                             "erogazione_frazionata": False},
  "convenzioni": [{
    "id_convenzione": "5011-C1", "compagnia": "AXA MPS Assicurazioni Vita S.p.A.",
    "data_scadenza": None, "tacito_rinnovo": None, "note": "PIP gestito direttamente dalla compagnia.",
    "set": [
     {"id_set": "5011-C1-S1", "base_demografica": None, "valido_da": None, "valido_a": None,
      "condizioni_applicabilita": "Adesioni con decorrenza dal 01/04/2014 e versamenti dal 17/06/2014",
      "set_corrente": True, "correzione_eta": correzione(CORR_CORRENTE), "costi": COSTI,
      "tabelle": [tabella(1, "Coefficienti di conversione del capitale assicurato in una rendita annua vitalizia immediata - Rendita annua per 1.000 euro di capitale assicurato",
                          0, CORRENTE, NOTA_TASSO + " Generazione di riferimento 1958-1966.")]},
     {"id_set": "5011-C1-S2", "base_demografica": None, "valido_da": None, "valido_a": "2014-06-16",
      "condizioni_applicabilita": COND_ANTE, "set_corrente": False,
      "correzione_eta": correzione(CORR_ANTE2014), "costi": COSTI,
      "tabelle": [tabella(2, "Coefficienti di conversione del capitale assicurato in una rendita annua vitalizia immediata - Validi per le adesioni con decorrenza fino al 31 marzo 2014 e per i versamenti fino al 16 giugno 2014",
                          1.5, ANTE2014, NOTA_TASSO + " Generazione di riferimento 1949-1959.")]},
    ],
  }],
  "autocontrolli": {"progressione_eta": "ok", "ordine_tipologie": "non_applicabile",
                    "decrescenza_rateazioni": "ok", "ordine_di_grandezza": "ok", "completezza": "ok",
                    "dettaglio": "Trascrizione manuale verificata sul documento."},
  "warnings": ["Esempio a pag. 15 incoerente con la tabella in vigore (39,96 contro 34,130 a eta 61)."],
}

out = os.path.join(os.path.dirname(__file__), "5011.json")
json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"5011: 2 tabelle, {2*len(ETA)*len(COL)} valori, eta {ETA[0]}-{ETA[-1]}")
