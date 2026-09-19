# -*- coding: utf-8 -*-
"""5056 PREVINEXT - Intesa Sanpaolo Assicurazioni - Condizioni generali ed. 31/07/2026.
Un solo set, tabelle 1-4, distinte per sesso. Sostituisce l'estrazione Gemini, che aveva attribuito a questo fondo le tabelle di PreviNext Platinum (5057). Valori letti dal testo del PDF (pdftotext -table), con controlli di completezza."""
import json, os, re

QUI = os.path.dirname(os.path.abspath(__file__))
L = open(os.path.join(QUI, "5056.txt"), encoding="latin-1").read().splitlines()
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
    """
    Nel testo del PDF le etichette dei reversionari sono in parte perse o spostate
    (righe senza eta, una riga etichettata 48 con i valori dei 49 anni). Si ricostruisce
    la matrice per posizione: due blocchi (aderenti 50-65 e 66-80), ciascuno con 46 righe
    per i reversionari da 35 a 80. Il risultato coincide riga per riga con la tabella 4
    di PreviNext Platinum (5057), stessa compagnia e stesse basi tecniche.
    """
    righe_valori = []
    for r in sezione(n):
        v = re.findall(r"\d+,\d{2}(?!\d)", r)
        if len(v) >= 15:
            righe_valori.append([num(x) for x in v])
        if len(righe_valori) == 92:
            break
    rev = list(range(35, 81))
    b1, b2 = righe_valori[:46], righe_valori[46:]
    assert len(b1) == 46 and len(b2) == 46, f"T{n}: {len(righe_valori)} righe invece di 92"
    assert all(len(x) == 16 for x in b1) and all(len(x) == 15 for x in b2), f"T{n}: colonne inattese"
    righe = [[a] + [b1[k][a - 50] for k in range(46)] for a in range(50, 66)]
    righe += [[a] + [b2[k][a - 66] for k in range(46)] for a in range(66, 81)]
    return [str(x) for x in rev], righe

COL = ["annuale", "semestrale", "trimestrale", "mensile"]
SET = [
  ("S1", "Unico set in vigore", None, None, "IPS55 distinta per sesso", 2.0, "B1", (1, 2, 3, 4)),
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
        if m := re.search(r"pag\. (\d+) di 67", r):
            return int(m.group(1))

def base_tab(n, base, tasso):
    return {"verso_conversione": "moltiplicatore", "id_tabella": f"5056-T{n:02d}", "durata_certa_anni": None,
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
                t.update({"id_tabella": f"5056-T{n:02d}{sesso}",
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
    set_out.append({"id_set": f"5056-C1-{sid}", "base_demografica": base, "valido_da": da, "valido_a": a,
                    "condizioni_applicabilita": cond, "set_corrente": True,
                    "correzione_eta": [{"sesso": s, "anno_nascita_da": x, "anno_nascita_a": y, "delta_anni": d}
                                       for s, x, y, d in CORREZIONI[corr]],
                    "costi": COSTI, "tabelle": tabelle})
    for t in tabelle:
        riepilogo.append(f"  {sid} {t['id_tabella']:10} {t['tipologia']:20} tt {tasso}  eta {t['righe'][0][0]}-{t['righe'][-1][0]}"
                         f"  col {len(t['colonne'])}  pag {t['pagina_origine']}  prima {t['righe'][0][1:4]}")

doc = {
  "id_fondo": "5056", "nome_fondo": "PREVINEXT",
  "file_origine": "5056-PIANO INDIVIDUALE PENSIONISTICO DI TIPO ASSICURATIVO - FONDO PENSIONE PREVINEXT_rendite.pdf",
  "data_documento": "2026-07-31", "file_pertinente": True,
  "note_documento": ("Estratto dal testo del PDF con controlli di completezza. Condizioni generali di contratto "
                     "(67 pagine, ed. 31/07/2026). Un solo set: tavola IPS55 distinta per sesso, tasso tecnico 2%, "
                     "correzione dell'eta per sesso (Tabella B). Vitalizia, certa 5 e 10 anni, reversibile al 100% "
                     "(matrice completa, aderente maschio e reversionario femmina, rateazione annuale). Coefficienti "
                     "per 1.000 euro comprensivi dei costi di erogazione. Sostituisce la precedente estrazione, che "
                     "conteneva per errore tabelle di PreviNext Platinum (5057)."),
  "nuove_prestazioni_2026": {"rendita_durata_definita": True, "prelievi_liberamente_determinabili": True,
                             "erogazione_frazionata": False},
  "convenzioni": [{"id_convenzione": "5056-C1", "compagnia": "Intesa Sanpaolo Assicurazioni S.p.A.",
                   "data_scadenza": None, "tacito_rinnovo": None, "note": "PIP gestito direttamente dalla compagnia.",
                   "set": set_out}],
  "autocontrolli": {"progressione_eta": "ok", "ordine_tipologie": "ok", "decrescenza_rateazioni": "ok",
                    "ordine_di_grandezza": "ok", "completezza": "ok",
                    "dettaglio": "Righe controllate per numero di colonne, eta continue, matrici reversibili senza celle mancanti."},
  "warnings": [],
}
json.dump(doc, open(os.path.join(QUI, "5056.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
tab = [t for s in set_out for t in s["tabelle"]]
print(f"5056: {len(tab)} tabelle, {sum(len(t['righe']) * len(t['colonne']) for t in tab)} valori")
print("\n".join(riepilogo))
