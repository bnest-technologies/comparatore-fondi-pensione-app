# -*- coding: utf-8 -*-
"""5102 GENERAZIONE PREVIDENTE - Generali Italia - ed. 07/2026. Trascritto a mano."""
import json, os

COL = ["annuale", "semestrale", "quadrimestrale", "trimestrale", "bimestrale", "mensile"]
ETA = list(range(50, 79))

VITALIZIA = [  # pag. 3, tasso tecnico 0%
 (0.02527,0.02511,0.02506,0.02503,0.02501,0.02498),(0.02590,0.02573,0.02568,0.02565,0.02562,0.02560),
 (0.02656,0.02639,0.02633,0.02630,0.02627,0.02624),(0.02726,0.02707,0.02701,0.02698,0.02695,0.02692),
 (0.02799,0.02779,0.02773,0.02770,0.02766,0.02763),(0.02876,0.02855,0.02848,0.02845,0.02841,0.02838),
 (0.02957,0.02935,0.02928,0.02924,0.02920,0.02917),(0.03042,0.03019,0.03011,0.03008,0.03004,0.03000),
 (0.03132,0.03108,0.03100,0.03096,0.03092,0.03088),(0.03228,0.03202,0.03193,0.03189,0.03185,0.03180),
 (0.03329,0.03301,0.03292,0.03288,0.03283,0.03279),(0.03436,0.03407,0.03397,0.03392,0.03387,0.03383),
 (0.03550,0.03519,0.03509,0.03503,0.03498,0.03493),(0.03672,0.03638,0.03627,0.03621,0.03616,0.03610),
 (0.03801,0.03765,0.03753,0.03747,0.03741,0.03735),(0.03938,0.03900,0.03887,0.03881,0.03874,0.03868),
 (0.04086,0.04044,0.04030,0.04023,0.04017,0.04010),(0.04243,0.04198,0.04184,0.04176,0.04169,0.04162),
 (0.04413,0.04364,0.04348,0.04340,0.04333,0.04325),(0.04596,0.04543,0.04526,0.04517,0.04509,0.04500),
 (0.04793,0.04735,0.04717,0.04707,0.04698,0.04689),(0.05006,0.04943,0.04923,0.04913,0.04903,0.04893),
 (0.05237,0.05168,0.05146,0.05135,0.05124,0.05113),(0.05487,0.05412,0.05388,0.05375,0.05363,0.05351),
 (0.05759,0.05676,0.05649,0.05636,0.05623,0.05610),(0.06055,0.05964,0.05934,0.05919,0.05905,0.05890),
 (0.06378,0.06277,0.06244,0.06228,0.06211,0.06195),(0.06731,0.06619,0.06582,0.06564,0.06546,0.06528),
 (0.07119,0.06993,0.06952,0.06932,0.06912,0.06892)]

CONTROASS = [  # pag. 4, tasso tecnico 1%
 (0.02931,0.02907,0.02899,0.02895,0.02891,0.02887),(0.02981,0.02956,0.02948,0.02944,0.02938,0.02934),
 (0.03034,0.03006,0.02997,0.02993,0.02988,0.02984),(0.03086,0.03059,0.03050,0.03045,0.03041,0.03037),
 (0.03143,0.03115,0.03105,0.03101,0.03092,0.03088),(0.03202,0.03168,0.03158,0.03153,0.03149,0.03144),
 (0.03259,0.03228,0.03217,0.03212,0.03207,0.03202),(0.03322,0.03290,0.03280,0.03275,0.03263,0.03258),
 (0.03389,0.03348,0.03337,0.03331,0.03326,0.03320),(0.03450,0.03414,0.03403,0.03397,0.03391,0.03386),
 (0.03521,0.03484,0.03472,0.03466,0.03461,0.03444),(0.03596,0.03546,0.03533,0.03526,0.03520,0.03513),
 (0.03661,0.03620,0.03606,0.03600,0.03593,0.03587),(0.03740,0.03698,0.03684,0.03678,0.03671,0.03664),
 (0.03825,0.03762,0.03747,0.03739,0.03732,0.03725),(0.03893,0.03845,0.03829,0.03821,0.03814,0.03806),
 (0.03982,0.03933,0.03917,0.03909,0.03901,0.03894),(0.04076,0.04027,0.04011,0.03970,0.03961,0.03953),
 (0.04178,0.04087,0.04069,0.04061,0.04052,0.04043),(0.04242,0.04185,0.04167,0.04158,0.04149,0.04140),
 (0.04347,0.04290,0.04272,0.04263,0.04254,0.04246),(0.04461,0.04343,0.04322,0.04312,0.04302,0.04292),
 (0.04516,0.04450,0.04430,0.04420,0.04410,0.04401),(0.04632,0.04568,0.04548,0.04539,0.04530,0.04520),
 (0.04760,0.04699,0.04681,0.04575,0.04564,0.04553),(0.04904,0.04730,0.04708,0.04697,0.04687,0.04677),
 (0.04933,0.04866,0.04846,0.04837,0.04828,0.04819),(0.05081,0.05022,0.05005,0.04997,0.04989,0.04982),
 (0.05253,0.05033,0.05013,0.05003,0.04994,0.04985)]

LTC = [  # pag. 5, tasso tecnico 0%, con raddoppio per non autosufficienza
 (0.02414,0.02404,0.02401,0.02399,0.02398,0.02396),(0.02471,0.02461,0.02458,0.02456,0.02454,0.02453),
 (0.02532,0.02521,0.02517,0.02515,0.02514,0.02512),(0.02595,0.02583,0.02580,0.02578,0.02576,0.02574),
 (0.02661,0.02649,0.02645,0.02643,0.02641,0.02639),(0.02730,0.02717,0.02713,0.02711,0.02709,0.02707),
 (0.02803,0.02790,0.02785,0.02783,0.02781,0.02779),(0.02879,0.02865,0.02861,0.02858,0.02856,0.02854),
 (0.02960,0.02945,0.02940,0.02938,0.02936,0.02933),(0.03045,0.03030,0.03024,0.03022,0.03019,0.03017),
 (0.03135,0.03119,0.03113,0.03110,0.03108,0.03105),(0.03230,0.03213,0.03207,0.03204,0.03201,0.03198),
 (0.03331,0.03312,0.03306,0.03303,0.03300,0.03297),(0.03438,0.03418,0.03411,0.03408,0.03405,0.03401),
 (0.03551,0.03529,0.03522,0.03519,0.03515,0.03512),(0.03670,0.03648,0.03640,0.03637,0.03633,0.03629),
 (0.03798,0.03774,0.03766,0.03762,0.03758,0.03754),(0.03934,0.03908,0.03900,0.03896,0.03891,0.03887),
 (0.04080,0.04052,0.04043,0.04038,0.04034,0.04029),(0.04236,0.04206,0.04196,0.04191,0.04186,0.04181),
 (0.04404,0.04371,0.04361,0.04355,0.04350,0.04345),(0.04583,0.04549,0.04537,0.04531,0.04526,0.04520),
 (0.04777,0.04739,0.04727,0.04721,0.04714,0.04708),(0.04986,0.04945,0.04931,0.04924,0.04918,0.04911),
 (0.05211,0.05166,0.05152,0.05144,0.05137,0.05130),(0.05455,0.05406,0.05390,0.05382,0.05374,0.05366),
 (0.05719,0.05665,0.05648,0.05639,0.05630,0.05621),(0.06006,0.05947,0.05927,0.05918,0.05908,0.05898),
 (0.06318,0.06252,0.06231,0.06220,0.06210,0.06199)]

# pag. 6: la reversibile e data solo per figure tipo. Colonne = eta del reversionario.
REV100 = {65:(0.03296,0.03398,0.03534), 67:(0.03398,0.03521,0.03691), 70:(0.03534,0.03691,0.03920)}
REV60  = {65:(0.03526,0.03595,0.03685), 67:(0.03692,0.03778,0.03894), 70:(0.03949,0.04065,0.04228)}

CORREZIONE = [(1900,1907,7),(1908,1917,6),(1918,1922,5),(1923,1927,4),(1928,1940,3),
              (1941,1948,2),(1949,1957,1),(1958,1966,0),(1967,1977,-1),(1978,1988,-2),
              (1989,1999,-3),(2000,2011,-4),(2012,2020,-5),(2021,None,-6)]


def tabella(tid, tipologia, dati, tt, pagina, titolo, note="", qualita="ok"):
    assert len(dati) == len(ETA), f"{tid}: {len(dati)} righe invece di {len(ETA)}"
    return {
        "verso_conversione": "moltiplicatore", "id_tabella": tid, "titolo_stampato": titolo,
        "tipologia": tipologia, "durata_certa_anni": None, "perc_reversibilita": None,
        "eta_reversionario_ipotesi": None, "sesso": "U",
        "base_demografica": "A62U indifferenziata per sesso", "tasso_tecnico": tt,
        "variabile_riga": "eta_assicurativa", "scala_originale": 1,
        "base_frazionamento": "annuo_corretto", "tipo_colonne": "frequenza", "colonne": COL,
        "righe": [[e] + list(v) for e, v in zip(ETA, dati)],
        "pagina_origine": pagina, "qualita": qualita, "note": note,
    }


def tabella_rev(tid, perc, dati, pagina):
    return {
        "verso_conversione": "moltiplicatore", "id_tabella": tid,
        "titolo_stampato": f"Coefficienti rendita vitalizia reversibile - reversibilita {perc}%",
        "tipologia": "reversibile", "durata_certa_anni": None, "perc_reversibilita": perc,
        "eta_reversionario_ipotesi": "colonne = eta di calcolo del reversionario (65, 67, 70)",
        "sesso": "U", "base_demografica": "A62U indifferenziata per sesso", "tasso_tecnico": 0,
        "variabile_riga": "eta_assicurativa", "scala_originale": 1,
        "base_frazionamento": "annuo_corretto", "tipo_colonne": "eta_reversionario",
        "colonne": ["65", "67", "70"],
        "righe": [[e] + list(v) for e, v in sorted(dati.items())],
        "pagina_origine": pagina, "qualita": "da_verificare",
        "note": ("Il documento riporta solo figure tipo, non una tavola completa: le colonne sono "
                 "eta assolute del reversionario (65, 67, 70), non differenze di eta. "
                 "Sola rateazione annuale. Per altre combinazioni il fondo rinvia a preventivo."),
    }

doc = {
  "id_fondo": "5102", "nome_fondo": "GENERAZIONE PREVIDENTE",
  "file_origine": "5102-GENERAZIONE PREVIDENTE - PIANO INDIVIDUALE PENSIONISTICO DI TIPO ASSICURATIVO - FONDO PENSIONE_rendite.pdf",
  "data_documento": "2026-07-01", "file_pertinente": True,
  "note_documento": ("Trascritto a mano. Edizione 07/2026. Tavole per eta 50-78 con sei rateazioni. "
                     "La rendita reversibile e fornita solo per figure tipo. "
                     "Presente maggiorazione del 30% se attiva l'assicurazione accessoria LTC in fase di accumulo."),
  "nuove_prestazioni_2026": {"rendita_durata_definita": True,
                             "prelievi_liberamente_determinabili": True,
                             "erogazione_frazionata": False},
  "convenzioni": [{
    "id_convenzione": "5102-C1", "compagnia": "Generali Italia S.p.A.",
    "data_scadenza": None, "tacito_rinnovo": None,
    "note": "PIP di Generali Italia. Coefficienti rivedibili al verificarsi delle condizioni di tabella H.",
    "set": [{
      "id_set": "5102-C1-S1", "base_demografica": "A62U indifferenziata per sesso",
      "valido_da": None, "valido_a": None, "condizioni_applicabilita": None, "set_corrente": True,
      "correzione_eta": [{"sesso": "U", "anno_nascita_da": a, "anno_nascita_a": b, "delta_anni": d}
                          for a, b, d in CORREZIONE],
      "costi": [],
      "tabelle": [
        tabella("5102-T01", "vitalizia_immediata", VITALIZIA, 0, 3,
                "Coefficienti di conversione del capitale di un euro in rendita annua vitalizia pagabile in rate posticipate"),
        tabella("5102-T02", "controassicurata", CONTROASS, 1, 4,
                "Coefficienti di conversione ... rendita annua vitalizia controassicurata"),
        tabella("5102-T03", "ltc", LTC, 0, 5,
                "Coefficienti di conversione ... con raddoppio in caso di non autosufficienza",
                note="I coefficienti considerano anche il rischio di perdita di autosufficienza."),
        tabella_rev("5102-T04", 100, REV100, 6),
        tabella_rev("5102-T05", 60, REV60, 6),
      ],
    }],
  }],
  "autocontrolli": {"progressione_eta": "ok", "ordine_tipologie": "ok",
                    "decrescenza_rateazioni": "ok", "ordine_di_grandezza": "ok",
                    "completezza": "ok", "dettaglio": "Trascrizione manuale verificata sul documento."},
  "warnings": [],
}

out = os.path.join(os.path.dirname(__file__), "5102.json")
json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
n = sum(len(t["righe"]) * len(t["colonne"]) for c in doc["convenzioni"] for s in c["set"] for t in s["tabelle"])
print(f"5102: {sum(len(s['tabelle']) for c in doc['convenzioni'] for s in c['set'])} tabelle, {n} valori")
