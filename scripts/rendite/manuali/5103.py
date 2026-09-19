# -*- coding: utf-8 -*-
"""5103 ATHORA FUTURO PREVIDENZA - Athora Italia - doc. aggiornato al 31/07/2026. Trascritto a mano."""
import json, os

COL = ["annuale", "semestrale", "trimestrale", "mensile"]
ETA = list(range(50, 76))

VITALIZIA = [  # pag. 9
 (25.184,24.932,24.806,24.680),(25.813,25.555,25.426,25.297),(26.473,26.208,26.076,25.944),
 (27.166,26.894,26.758,26.622),(27.894,27.615,27.475,27.336),(28.659,28.373,28.229,28.086),
 (29.466,29.171,29.024,28.876),(30.316,30.013,29.861,29.710),(31.215,30.903,30.747,30.591),
 (32.167,31.845,31.684,31.524),(33.176,32.844,32.678,32.512),(34.246,33.903,33.732,33.561),
 (35.382,35.028,34.851,34.675),(36.591,36.225,36.042,35.859),(37.877,37.498,37.308,37.119),
 (39.248,38.855,38.659,38.463),(40.714,40.307,40.104,39.900),(42.287,41.864,41.653,41.441),
 (43.977,43.538,43.318,43.098),(45.798,45.340,45.111,44.882),(47.763,47.285,47.046,46.807),
 (49.886,49.388,49.138,48.889),(52.187,51.665,51.404,51.143),(54.682,54.135,53.862,53.588),
 (57.392,56.818,56.531,56.244),(60.341,59.738,59.436,59.134)]

CERTA5 = [  # pag. 10
 (25.172,24.920,24.794,24.668),(25.800,25.542,25.413,25.284),(26.458,26.193,26.061,25.928),
 (27.148,26.877,26.741,26.605),(27.874,27.595,27.456,27.316),(28.637,28.350,28.207,28.064),
 (29.440,29.146,28.998,28.851),(30.287,29.984,29.833,29.682),(31.182,30.870,30.714,30.558),
 (32.129,31.808,31.647,31.486),(33.131,32.800,32.634,32.469),(34.194,33.852,33.681,33.510),
 (35.322,34.969,34.792,34.615),(36.520,36.155,35.972,35.789),(37.794,37.416,37.227,37.038),
 (39.151,38.760,38.564,38.368),(40.601,40.195,39.992,39.789),(42.154,41.732,41.522,41.311),
 (43.819,43.381,43.162,42.943),(45.608,45.152,44.924,44.696),(47.532,47.057,46.819,46.582),
 (49.605,49.109,48.861,48.613),(51.841,51.322,51.063,50.804),(54.253,53.710,53.439,53.168),
 (56.857,56.289,56.004,55.720),(59.671,59.074,58.776,58.477)]

CERTA10 = [  # pag. 11
 (25.134,24.882,24.757,24.631),(25.756,25.499,25.370,25.241),(26.409,26.145,26.013,25.881),
 (27.093,26.822,26.687,26.551),(27.811,27.533,27.394,27.255),(28.565,28.279,28.136,27.994),
 (29.358,29.064,28.918,28.771),(30.193,29.891,29.740,29.589),(31.074,30.763,30.607,30.452),
 (32.003,31.683,31.523,31.363),(32.986,32.656,32.491,32.326),(34.025,33.685,33.515,33.344),
 (35.125,34.773,34.598,34.422),(36.289,35.926,35.745,35.563),(37.523,37.148,36.961,36.773),
 (38.832,38.444,38.250,38.056),(40.223,39.821,39.620,39.419),(41.702,41.285,41.076,40.868),
 (43.275,42.842,42.626,42.410),(44.949,44.500,44.275,44.050),(46.729,46.262,46.028,45.794),
 (48.619,48.133,47.890,47.647),(50.623,50.117,49.864,49.610),(52.742,52.215,51.951,51.687),
 (54.977,54.427,54.153,53.878),(57.326,56.752,56.466,56.179)]

# Figure-tipo di rendita reversibile (pag. 11-12): due sole combinazioni di eta,
# (aderente, reversionario, perc, valori per annuale/semestrale/trimestrale/mensile)
REVERSIBILI = [
  (65, 70, 100, (35.219, 34.867, 34.691, 34.515), 11),
  (65, 70,  50, (37.124, 36.753, 36.568, 36.382), 11),
  (60, 65, 100, (30.047, 29.746, 29.596, 29.446), 12),
  (60, 65,  50, (31.534, 31.218, 31.061, 30.903), 12),
]

CORREZIONE = [(None,1907,7),(1908,1917,6),(1918,1922,5),(1923,1927,4),(1928,1939,3),
              (1940,1948,2),(1949,1957,1),(1958,1966,0),(1967,1977,-1),(1978,1988,-2),
              (1989,2000,-3),(2001,2013,-4),(2014,2020,-5),(2021,None,-6)]

COSTI = [("spese_erogazione_rendita", 1.25, None, "spese di erogazione della rendita"),
         ("spese_frazionamento_semestrale", 1.00, "semestrale", "spese di frazionamento infrannuale"),
         ("spese_frazionamento_trimestrale", 1.50, "trimestrale", "spese di frazionamento infrannuale"),
         ("spese_frazionamento_mensile", 2.00, "mensile", "spese di frazionamento infrannuale")]

for nome, blocco in (("VITALIZIA", VITALIZIA), ("CERTA5", CERTA5), ("CERTA10", CERTA10)):
    assert len(blocco) == len(ETA), f"{nome}: {len(blocco)} righe invece di {len(ETA)}"

def tab(idx, titolo, tipologia, durata, valori, pagina):
    return {
      "verso_conversione": "moltiplicatore", "id_tabella": f"5103-T{idx:02d}",
      "titolo_stampato": titolo, "tipologia": tipologia, "durata_certa_anni": durata,
      "perc_reversibilita": None, "eta_reversionario_ipotesi": None, "sesso": "U",
      "base_demografica": "A62 D pesata 40% maschi e 60% femmine", "tasso_tecnico": 0,
      "variabile_riga": "eta_assicurativa", "scala_originale": 1000,
      "base_frazionamento": "annuo_corretto", "tipo_colonne": "frequenza", "colonne": COL,
      "righe": [[e] + list(v) for e, v in zip(ETA, valori)],
      "pagina_origine": pagina, "qualita": "ok", "note": "",
    }

tabelle = [
  tab(1, "6.1 COEFFICIENTI DI CONVERSIONE IN RENDITA VITALIZIA PER DIVERSE RATEAZIONI DELLA RENDITA PER 1.000 EURO DI CAPITALE",
      "vitalizia_immediata", None, VITALIZIA, 9),
  tab(2, "6.2 TABELLA DEI COEFFICIENTI DI CONVERSIONE IN RENDITA CERTA PER 5 ANNI POI VITALIZIA",
      "certa_poi_vitalizia", 5, CERTA5, 10),
  tab(3, "6.3 TABELLA DEI COEFFICIENTI DI CONVERSIONE IN RENDITA CERTA PER 10 ANNI POI VITALIZIA",
      "certa_poi_vitalizia", 10, CERTA10, 11),
]

for i, (eta_a, eta_r, perc, valori, pagina) in enumerate(REVERSIBILI, start=4):
    t = tab(i, "ESEMPI DI CONVERSIONE IN RENDITA VITALIZIA REVERSIBILE", "reversibile", None, [], pagina)
    t.update({"perc_reversibilita": perc, "eta_reversionario_ipotesi": eta_r,
              "righe": [[eta_a] + list(valori)], "qualita": "da_verificare",
              "note": ("Il documento non pubblica la tavola completa delle rendite reversibili: "
                       f"riporta solo esempi. Questa e la combinazione aderente {eta_a} anni / "
                       f"reversionario {eta_r} anni con reversibilita {perc}%.")})
    tabelle.append(t)

doc = {
  "id_fondo": "5103", "nome_fondo": "ATHORA FUTURO PREVIDENZA",
  "file_origine": "5103-ATHORA FUTURO PREVIDENZA - PIANO INDIVIDUALE PENSIONISTICO DI TIPO ASSICURATIVO - FONDO PENSIONE_rendite.pdf",
  "data_documento": "2026-07-31", "file_pertinente": True,
  "note_documento": ("Trascritto a mano. Documento aggiornato al 31/07/2026. Coefficienti espressi per "
                     "1.000 euro di capitale: la rendita annua e montante/1.000 x coefficiente, e la rata "
                     "si ottiene dividendo per il frazionamento. Eta 50-75 su tre tavole complete "
                     "(vitalizia, certa 5 anni, certa 10 anni) con quattro rateazioni; manca la "
                     "quadrimestrale e la bimestrale. Le rendite reversibili sono pubblicate solo come "
                     "esempi su due combinazioni di eta. Non sono previste rendite controassicurate ne LTC."),
  "nuove_prestazioni_2026": {"rendita_durata_definita": True,
                             "prelievi_liberamente_determinabili": True,
                             "erogazione_frazionata": False},
  "convenzioni": [{
    "id_convenzione": "5103-C1", "compagnia": "Athora Italia S.p.A.",
    "data_scadenza": None, "tacito_rinnovo": None,
    "note": ("PIP gestito direttamente dalla compagnia. Il documento elenca le condizioni di "
             "rivedibilita dei coefficienti con preavviso all'aderente."),
    "set": [{
      "id_set": "5103-C1-S1", "base_demografica": "A62 D pesata 40% maschi e 60% femmine",
      "valido_da": None, "valido_a": None, "condizioni_applicabilita": None, "set_corrente": True,
      "correzione_eta": [{"sesso": "U", "anno_nascita_da": a, "anno_nascita_a": b, "delta_anni": d}
                          for a, b, d in CORREZIONE],
      "costi": [{"tipo_costo": t, "valore_perc": v, "frequenza": f, "note": n}
                 for t, v, f, n in COSTI],
      "tabelle": tabelle,
    }],
  }],
  "autocontrolli": {"progressione_eta": "ok", "ordine_tipologie": "ok",
                    "decrescenza_rateazioni": "ok", "ordine_di_grandezza": "ok",
                    "completezza": "parziale",
                    "dettaglio": ("Trascrizione manuale verificata sul documento. Le reversibili sono "
                                  "incomplete per scelta dell'emittente, non per mancata estrazione.")},
  "warnings": ["Rendite reversibili disponibili solo come figure-tipo su due combinazioni di eta."],
}

out = os.path.join(os.path.dirname(__file__), "5103.json")
json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
n = sum(len(t["righe"]) * len(t["colonne"]) for c in doc["convenzioni"] for s in c["set"] for t in s["tabelle"])
print(f"5103: {len(tabelle)} tabelle, {n} valori, eta {ETA[0]}-{ETA[-1]}")
