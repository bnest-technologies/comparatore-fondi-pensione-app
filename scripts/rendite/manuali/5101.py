# -*- coding: utf-8 -*-
"""5101 PIANO PENSIONE MONEYFARM - Allianz Global Life dac - ed. 07/2026. Trascritto a mano."""
import json, os

COL = ["annuale", "semestrale", "quadrimestrale", "trimestrale", "mensile"]
ETA = list(range(50, 86))

VITALIZIA = [  # pag. 7, tavola A62, tasso tecnico 0,00%
 (0.02426,0.02421,0.02419,0.02417,0.02391),(0.02485,0.02480,0.02478,0.02475,0.02449),
 (0.02554,0.02549,0.02546,0.02544,0.02517),(0.02613,0.02608,0.02605,0.02603,0.02575),
 (0.02682,0.02676,0.02674,0.02671,0.02643),(0.02760,0.02755,0.02752,0.02749,0.02720),
 (0.02839,0.02833,0.02830,0.02828,0.02798),(0.02917,0.02912,0.02909,0.02906,0.02875),
 (0.03006,0.03000,0.02997,0.02994,0.02962),(0.03094,0.03088,0.03085,0.03082,0.03049),
 (0.03192,0.03186,0.03183,0.03180,0.03146),(0.03291,0.03284,0.03281,0.03278,0.03243),
 (0.03399,0.03392,0.03389,0.03385,0.03349),(0.03517,0.03510,0.03506,0.03503,0.03465),
 (0.03644,0.03637,0.03634,0.03630,0.03591),(0.03772,0.03765,0.03761,0.03757,0.03717),
 (0.03919,0.03912,0.03908,0.03904,0.03862),(0.04067,0.04059,0.04055,0.04051,0.04008),
 (0.04234,0.04225,0.04221,0.04217,0.04172),(0.04410,0.04402,0.04398,0.04393,0.04346),
 (0.04607,0.04598,0.04593,0.04589,0.04540),(0.04813,0.04804,0.04799,0.04794,0.04743),
 (0.05029,0.05019,0.05015,0.05010,0.04956),(0.05265,0.05255,0.05250,0.05244,0.05189),
 (0.05530,0.05519,0.05514,0.05509,0.05450),(0.05805,0.05794,0.05788,0.05783,0.05721),
 (0.06110,0.06098,0.06092,0.06086,0.06021),(0.06444,0.06431,0.06425,0.06419,0.06350),
 (0.06798,0.06784,0.06778,0.06771,0.06699),(0.07190,0.07176,0.07169,0.07162,0.07086),
 (0.07613,0.07598,0.07590,0.07583,0.07502),(0.08075,0.08059,0.08051,0.08043,0.07957),
 (0.08575,0.08559,0.08550,0.08542,0.08451),(0.09116,0.09098,0.09089,0.09080,0.08983),
 (0.09695,0.09676,0.09667,0.09657,0.09555),(0.10324,0.10304,0.10294,0.10284,0.10174)]

CORREZIONE = [(None,1930,3),(1931,1947,2),(1948,1954,1),(1955,1962,0),(1963,1967,-1),
              (1968,1973,-2),(1974,1979,-3),(1980,1988,-4),(1989,None,-5)]

COSTI = [("caricamento_rata_rendita",1.80,"annuale"),("caricamento_rata_rendita",2.00,"semestrale"),
         ("caricamento_rata_rendita",2.10,"quadrimestrale"),("caricamento_rata_rendita",2.20,"trimestrale"),
         ("caricamento_rata_rendita",3.30,"mensile")]

assert len(VITALIZIA) == len(ETA), f"{len(VITALIZIA)} righe invece di {len(ETA)}"

doc = {
  "id_fondo": "5101", "nome_fondo": "PIANO PENSIONE MONEYFARM",
  "file_origine": "5101-PIANO PENSIONE MONEYFARM - PIANO INDIVIDUALE PENSIONISTICO DI TIPO ASSICURATIVO - FONDO PENSIONE_rendite.pdf",
  "data_documento": "2026-07-01", "file_pertinente": True,
  "note_documento": ("Trascritto a mano. Edizione 07/2026. Il documento pubblica una sola tavola "
                     "(vitalizia immediata, eta 50-85, cinque rateazioni senza la bimestrale). "
                     "Non sono previste rendite certe, reversibili, controassicurate o LTC. "
                     "La rendita vitalizia non e rivalutabile annualmente. "
                     "Oltre ai caricamenti percentuali e previsto un costo fisso di 25 euro l'anno."),
  "nuove_prestazioni_2026": {"rendita_durata_definita": True,
                             "prelievi_liberamente_determinabili": True,
                             "erogazione_frazionata": False},
  "convenzioni": [{
    "id_convenzione": "5101-C1", "compagnia": "Allianz Global Life dac",
    "data_scadenza": None, "tacito_rinnovo": None,
    "note": "PIP istituito e gestito da Allianz Global Life dac (gruppo Allianz SE), distribuito da Moneyfarm.",
    "set": [{
      "id_set": "5101-C1-S1", "base_demografica": "A62", "valido_da": None, "valido_a": None,
      "condizioni_applicabilita": None, "set_corrente": True,
      "correzione_eta": [{"sesso": "U", "anno_nascita_da": a, "anno_nascita_a": b, "delta_anni": d}
                          for a, b, d in CORREZIONE],
      "costi": [{"tipo_costo": t, "valore_perc": v, "frequenza": f,
                 "note": "caricamento sul coefficiente in funzione della periodicita"} for t, v, f in COSTI],
      "tabelle": [{
        "verso_conversione": "moltiplicatore", "id_tabella": "5101-T01",
        "titolo_stampato": "Tabella dei coefficienti di conversione in Rendita vitalizia (pagabile in rate posticipate) Tavola A62 - Tasso tecnico 0,00%",
        "tipologia": "vitalizia_immediata", "durata_certa_anni": None, "perc_reversibilita": None,
        "eta_reversionario_ipotesi": None, "sesso": "U", "base_demografica": "A62",
        "tasso_tecnico": 0, "variabile_riga": "eta_assicurativa", "scala_originale": 1,
        "base_frazionamento": "annuo_corretto", "tipo_colonne": "frequenza", "colonne": COL,
        "righe": [[e] + list(v) for e, v in zip(ETA, VITALIZIA)],
        "pagina_origine": 7, "qualita": "ok", "note": "",
      }],
    }],
  }],
  "autocontrolli": {"progressione_eta": "ok", "ordine_tipologie": "non_applicabile",
                    "decrescenza_rateazioni": "ok", "ordine_di_grandezza": "ok",
                    "completezza": "ok", "dettaglio": "Trascrizione manuale verificata sul documento."},
  "warnings": [],
}

out = os.path.join(os.path.dirname(__file__), "5101.json")
json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
n = sum(len(t["righe"]) * len(t["colonne"]) for c in doc["convenzioni"] for s in c["set"] for t in s["tabelle"])
print(f"5101: 1 tabella, {n} valori, eta {ETA[0]}-{ETA[-1]}")
