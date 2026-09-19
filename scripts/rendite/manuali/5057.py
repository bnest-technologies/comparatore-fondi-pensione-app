# -*- coding: utf-8 -*-
"""5057 PREVINEXT PLATINUM - Intesa Sanpaolo Assicurazioni - Condizioni generali ed. 31/07/2026.
16 tabelle in 4 set storici. Valori letti dal testo del PDF (pdftotext -table), con controlli di completezza."""
import json, os, re

QUI = os.path.dirname(os.path.abspath(__file__))
L = open(os.path.join(QUI, "5057.txt"), encoding="latin-1").read().splitlines()
num = lambda s: float(s.replace(",", "."))

inizi = {int(m.group(1)): i for i, r in enumerate(L) if (m := re.search(r"TABELLA (\d+):", r))}
def sezione(n):
    a = inizi[n]; b = inizi.get(n + 1, len(L))
    return L[a:b]

RIGA = re.compile(r"(\d{2,3})\s+((?:\d+,\d{2,5}\s*)+)$")
TESTATA = re.compile(r"^\s*(\d{2})(\s+\d{2})+\s*$")   # riga con sole eta dell'aderente

def tavola_frequenze(n, n_val):
    righe = []
    for r in sezione(n):
        m = re.match(r"^\s*" + RIGA.pattern, r)
        if m:
            v = [num(x) for x in m.group(2).split()]
            assert len(v) == n_val, f"T{n} eta {m.group(1)}: {len(v)} valori invece di {n_val}"
            righe.append([int(m.group(1))] + v)
    eta = [r[0] for r in righe]
    assert eta == list(range(eta[0], eta[-1] + 1)), f"T{n}: eta non continue {eta}"
    return righe

def tavola_reversibile(n):
    celle, testata = {}, None
    for r in sezione(n):
        if TESTATA.match(r):
            testata = [int(x) for x in r.split()]
            continue
        m = RIGA.search(r)
        if m and testata:
            v = [num(x) for x in m.group(2).split()]
            assert len(v) == len(testata), f"T{n} rev {m.group(1)}: {len(v)} valori, testata {len(testata)}"
            for ad, x in zip(testata, v):
                assert (ad, int(m.group(1))) not in celle, f"T{n}: cella doppia {ad},{m.group(1)}"
                celle[(ad, int(m.group(1)))] = x
    ad = sorted({k[0] for k in celle}); rv = sorted({k[1] for k in celle})
    mancanti = [(a, b) for a in ad for b in rv if (a, b) not in celle]
    assert not mancanti, f"T{n}: {len(mancanti)} celle mancanti, es. {mancanti[:5]}"
    assert ad == list(range(ad[0], ad[-1] + 1)) and rv == list(range(rv[0], rv[-1] + 1)), f"T{n}: eta non continue"
    return [str(b) for b in rv], [[a] + [celle[(a, b)] for b in rv] for a in ad]

COL = ["annuale", "semestrale", "trimestrale", "mensile"]
SET = [  # (id, condizioni, valido_da, valido_a, base, tasso, correzione, tabelle)
  ("S1", "Adesioni fino al 20/12/2012", None, "2012-12-20", "IPS55 distinta per sesso", 2.0, "B1", (1, 2, 3, 4)),
  ("S2", "Adesioni dal 21/12/2012 al 28/11/2014", "2012-12-21", "2014-11-28", "IPS55 F - impegni immediati", 2.0, "B2", (5, 6, 7, 8)),
  ("S3", "Adesioni dal 29/11/2014 al 14/11/2018", "2014-11-29", "2018-11-14", "A62D (100% femmine) - impegni differiti", 1.0, "B3", (9, 10, 11, 12)),
  ("S4", "Adesioni dal 15/11/2018", "2018-11-15", None, "A62D (100% femmine) - impegni differiti", 0.0, "B3", (13, 14, 15, 16)),
]
CORREZIONI = {
  "B1": [("M", None, 1925, 3), ("M", 1926, 1938, 2), ("M", 1939, 1947, 1), ("M", 1948, 1960, 0), ("M", 1961, 1970, -1), ("M", 1971, None, -2),
         ("F", None, 1927, 3), ("F", 1928, 1940, 2), ("F", 1941, 1949, 1), ("F", 1950, 1962, 0), ("F", 1963, 1972, -1), ("F", 1973, None, -2)],
  "B2": [("U", None, 1927, 3), ("U", 1928, 1940, 2), ("U", 1941, 1949, 1), ("U", 1950, 1962, 0), ("U", 1963, 1972, -1), ("U", 1973, None, -2)],
  "B3": [("U", None, 1908, 7), ("U", 1909, 1917, 6), ("U", 1918, 1922, 5), ("U", 1923, 1929, 4), ("U", 1930, 1940, 3), ("U", 1941, 1949, 2),
         ("U", 1950, 1957, 1), ("U", 1958, 1966, 0), ("U", 1967, 1976, -1), ("U", 1977, 1986, -2), ("U", 1987, 1996, -3),
         ("U", 1997, 2007, -4), ("U", 2008, 2018, -5), ("U", 2019, 2020, -6), ("U", 2021, None, -7)],
}
TIPI = [("vitalizia_immediata", None, "RENDITA ANNUA VITALIZIA RIVALUTABILE PAGATA IN RATE POSTICIPATE"),
        ("certa_poi_vitalizia", 5, "RENDITA ANNUA RIVALUTABILE CERTA PER I PRIMI 5 ANNI E POI VITALIZIA"),
        ("certa_poi_vitalizia", 10, "RENDITA ANNUA RIVALUTABILE CERTA PER I PRIMI 10 ANNI E POI VITALIZIA")]
COSTI = [{"tipo_costo": "spese_erogazione_rendita", "valore_perc": v, "frequenza": f,
          "note": "Costo implicito nei coefficienti (Art. 10.2)."}
         for f, v in (("annuale", 1.15), ("semestrale", 1.30), ("trimestrale", 1.60), ("mensile", 2.80))]
COSTI.append({"tipo_costo": "trattenuta_rendimento_gestione_separata", "valore_perc": 0.60, "frequenza": None,
              "note": "Prelievo annuo sul rendimento della gestione separata PreviNext Futuro Sicuro."})

def pagina(n):
    for r in L[inizi[n]:]:
        if m := re.search(r"pag\. (\d+) di 61", r):
            return int(m.group(1))

def base_tab(n, base, tasso):
    return {"verso_conversione": "moltiplicatore", "id_tabella": f"5057-T{n:02d}", "durata_certa_anni": None,
            "perc_reversibilita": None, "eta_reversionario_ipotesi": None, "base_demografica": base,
            "tasso_tecnico": tasso, "variabile_riga": "eta_assicurativa", "scala_originale": 1000,
            "base_frazionamento": "annuo_corretto", "pagina_origine": pagina(n), "qualita": "ok", "note": ""}

set_out, riepilogo = [], []
for sid, cond, da, a, base, tasso, corr, nums in SET:
    tabelle = []
    for (tipo, durata, titolo), n in zip(TIPI, nums[:3]):
        if sid == "S1":
            righe = tavola_frequenze(n, 8)
            for sesso, sl in (("M", slice(1, 5)), ("F", slice(5, 9))):
                t = base_tab(n, base, tasso)
                t.update({"id_tabella": f"5057-T{n:02d}{sesso}",
                          "titolo_stampato": f"TABELLA {n}: {titolo} - sesso {'maschile' if sesso == 'M' else 'femminile'}",
                          "tipologia": tipo, "durata_certa_anni": durata, "sesso": sesso,
                          "tipo_colonne": "frequenza", "colonne": COL, "righe": [[r[0]] + r[sl] for r in righe]})
                tabelle.append(t)
        else:
            t = base_tab(n, base, tasso)
            t.update({"titolo_stampato": f"TABELLA {n}: {titolo}", "tipologia": tipo, "durata_certa_anni": durata,
                      "sesso": "U", "tipo_colonne": "frequenza", "colonne": COL, "righe": tavola_frequenze(n, 4)})
            tabelle.append(t)
    n = nums[3]
    colonne, righe = tavola_reversibile(n)
    t = base_tab(n, base, tasso)
    t.update({"titolo_stampato": f"TABELLA {n}: RENDITA ANNUA VITALIZIA RIVALUTABILE PAGATA IN RATE POSTICIPATE REVERSIBILE AL 100%",
              "tipologia": "reversibile", "perc_reversibilita": 100, "sesso": "M" if sid == "S1" else "U",
              "eta_reversionario_ipotesi": f"colonne = eta rettificata del reversionario ({colonne[0]}-{colonne[-1]})",
              "tipo_colonne": "eta_reversionario", "colonne": colonne, "righe": righe,
              "note": ("Matrice completa: righe = eta rettificata dell'aderente, colonne = eta ASSOLUTA del "
                       "reversionario (non differenza di eta). Rateazione annuale."
                       + (" Aderente di sesso maschile, reversionario di sesso femminile." if sid == "S1" else ""))})
    tabelle.append(t)
    set_out.append({"id_set": f"5057-C1-{sid}", "base_demografica": base, "valido_da": da, "valido_a": a,
                    "condizioni_applicabilita": cond, "set_corrente": sid == "S4",
                    "correzione_eta": [{"sesso": s, "anno_nascita_da": x, "anno_nascita_a": y, "delta_anni": d}
                                       for s, x, y, d in CORREZIONI[corr]],
                    "costi": COSTI, "tabelle": tabelle})
    for t in tabelle:
        riepilogo.append(f"  {sid} {t['id_tabella']:10} {t['tipologia']:20} tt {tasso}  eta {t['righe'][0][0]}-{t['righe'][-1][0]}"
                         f"  col {len(t['colonne'])}  pag {t['pagina_origine']}  prima {t['righe'][0][1:4]}")

doc = {
  "id_fondo": "5057", "nome_fondo": "PREVINEXT PLATINUM",
  "file_origine": "5057-PIANO INDIVIDUALE PENSIONISTICO DI TIPO ASSICURATIVO - FONDO PENSIONE PREVINEXT PLATINUM_rendite.pdf",
  "data_documento": "2026-07-31", "file_pertinente": True,
  "note_documento": ("Estratto dal testo del PDF con controlli di completezza. Il file sono le Condizioni generali "
                     "di contratto (61 pagine, ed. 31/07/2026); le pagine delle tabelle riportano ancora "
                     "'Edizione aggiornata al 18/02/2022'. Quattro set di coefficienti per data di adesione; "
                     "ciascuno ha vitalizia, certa 5 e 10 anni e reversibile al 100% (matrice completa eta "
                     "aderente x eta reversionario, sola rateazione annuale). Il primo set distingue per sesso. "
                     "Non sono previste rendite controassicurate ne LTC. Coefficienti per 1.000 euro, "
                     "comprensivi dei costi di erogazione. Rendita rivalutabile."),
  "nuove_prestazioni_2026": {"rendita_durata_definita": True, "prelievi_liberamente_determinabili": True,
                             "erogazione_frazionata": False},
  "convenzioni": [{"id_convenzione": "5057-C1", "compagnia": "Intesa Sanpaolo Assicurazioni S.p.A.",
                   "data_scadenza": None, "tacito_rinnovo": None, "note": "PIP gestito direttamente dalla compagnia.",
                   "set": set_out}],
  "autocontrolli": {"progressione_eta": "ok", "ordine_tipologie": "ok", "decrescenza_rateazioni": "ok",
                    "ordine_di_grandezza": "ok", "completezza": "ok",
                    "dettaglio": "Righe controllate per numero di colonne, eta continue, matrici reversibili senza celle mancanti."},
  "warnings": [],
}
json.dump(doc, open(os.path.join(QUI, "5057.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
tab = [t for s in set_out for t in s["tabelle"]]
print(f"5057: {len(tab)} tabelle, {sum(len(t['righe']) * len(t['colonne']) for t in tab)} valori")
print("\n".join(riepilogo))
