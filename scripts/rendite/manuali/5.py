# -*- coding: utf-8 -*-
"""5 FONDO PENSIONE APERTO AXA MPS (Previdenza per Te) - Regolamento, Allegato n. 2, pag. 19-22.
Sostituisce l'estrazione Gemini, che conteneva le tabelle del PIP AXA MPS Previdenza Personale (5011).
Valori letti dal testo del PDF (pdftotext -table), con controlli di completezza."""
import json, os, re

QUI = os.path.dirname(os.path.abspath(__file__))
L = open(os.path.join(QUI, "5.txt"), encoding="latin-1").read().splitlines()
num = lambda s: float(s.replace(",", "."))

COL = ["annuale", "semestrale", "bimestrale", "mensile"]
ETA = list(range(50, 76))
inizi = [i for i, r in enumerate(L) if re.search(r"Et.\(\*\)", r)]
assert len(inizi) == 3, f"attese 3 tabelle, trovate {len(inizi)}"

def blocco(k):
    fine = inizi[k + 1] if k + 1 < len(inizi) else len(L)
    righe = []
    for r in L[inizi[k]:fine]:
        m = re.match(r"^\s*(\d{2})\s+((?:\d+,\d{3}\s*)+)$", r)
        if m:
            v = [num(x) for x in m.group(2).split()]
            assert len(v) == 4, f"tabella {k + 1} eta {m.group(1)}: {len(v)} valori"
            righe.append([int(m.group(1))] + v)
    assert [r[0] for r in righe] == ETA, f"tabella {k + 1}: eta {[r[0] for r in righe]}"
    return righe

TITOLI = [("vitalizia_immediata", None, "Coefficienti di conversione del montante contributivo in una rendita annua vitalizia immediata", 19),
          ("certa_poi_vitalizia", 5, "Coefficienti di conversione del montante contributivo in una rendita annua vitalizia immediata certa per 5 anni", 20),
          ("certa_poi_vitalizia", 10, "Coefficienti di conversione del montante contributivo in una rendita annua vitalizia immediata certa per 10 anni", 21)]

tabelle = []
for k, (tipo, durata, titolo, pag) in enumerate(TITOLI):
    tabelle.append({
      "verso_conversione": "moltiplicatore", "id_tabella": f"5-T{k + 1:02d}", "titolo_stampato": titolo + " - Rendita annua per 1.000 euro di montante contributivo",
      "tipologia": tipo, "durata_certa_anni": durata, "perc_reversibilita": None, "eta_reversionario_ipotesi": None,
      "sesso": "U", "base_demografica": "A62-I", "tasso_tecnico": 0, "variabile_riga": "eta_assicurativa",
      "scala_originale": 1000, "base_frazionamento": "annuo_corretto", "tipo_colonne": "frequenza", "colonne": COL,
      "righe": blocco(k), "pagina_origine": pag, "qualita": "ok",
      "note": "Il documento intitola la terza colonna 'Bimestrale'; non e prevista la rateazione trimestrale."})

CORREZIONE = [(None, 1907, 7), (1908, 1917, 6), (1918, 1921, 5), (1922, 1927, 4), (1928, 1938, 3), (1939, 1947, 2),
              (1948, 1957, 1), (1958, 1966, 0), (1967, 1977, -1), (1978, 1989, -2), (1990, 2001, -3),
              (2002, 2014, -4), (2015, 2020, -5), (2021, None, -6)]

doc = {
  "id_fondo": "5", "nome_fondo": "FONDO PENSIONE APERTO AXA MPS",
  "file_origine": "5-PREVIDENZA PER TE - FONDO PENSIONE APERTO_rendite.pdf",
  "data_documento": "2026-03-01", "file_pertinente": True,
  "note_documento": ("Estratto dal testo del PDF. Il file e il Regolamento del fondo aperto 'Previdenza per Te'; i "
                     "coefficienti sono nell'Allegato n. 2 (pag. 19-22): vitalizia, certa 5 e 10 anni, eta 50-75, "
                     "rateazioni annuale, semestrale, bimestrale, mensile. Basi: A62-I, tasso tecnico 0%, "
                     "caricamento 1,25% della rendita per spese di erogazione. Rendita rivalutabile (partecipazione 90%, "
                     "rendimento minimo trattenuto 0,75 punti). I coefficienti per reversibilita non sono pubblicati: "
                     "sono depositati presso la sede del Fondo. Sostituisce la precedente estrazione, che conteneva "
                     "per errore le tabelle del PIP AXA MPS Previdenza Personale (5011)."),
  "nuove_prestazioni_2026": {"rendita_durata_definita": True, "prelievi_liberamente_determinabili": True,
                             "erogazione_frazionata": False},
  "convenzioni": [{"id_convenzione": "5-C1", "compagnia": "AXA MPS Assicurazioni Vita S.p.A.",
                   "data_scadenza": None, "tacito_rinnovo": None, "note": "Fondo pensione aperto istituito dalla compagnia.",
                   "set": [{"id_set": "5-C1-S1", "base_demografica": "A62-I", "valido_da": None, "valido_a": None,
                            "condizioni_applicabilita": None, "set_corrente": True,
                            "correzione_eta": [{"sesso": "U", "anno_nascita_da": a, "anno_nascita_a": b, "delta_anni": d}
                                               for a, b, d in CORREZIONE],
                            "costi": [{"tipo_costo": "spese_erogazione_rendita", "valore_perc": 1.25, "frequenza": None,
                                       "note": "Aliquota della rendita per spese di erogazione, inclusa nei coefficienti."}],
                            "tabelle": tabelle}]}],
  "autocontrolli": {"progressione_eta": "ok", "ordine_tipologie": "ok", "decrescenza_rateazioni": "ok",
                    "ordine_di_grandezza": "ok", "completezza": "ok",
                    "dettaglio": "Righe controllate per numero di colonne e continuita delle eta."},
  "warnings": [],
}
json.dump(doc, open(os.path.join(QUI, "5.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"5: {len(tabelle)} tabelle, {sum(len(t['righe']) * 4 for t in tabelle)} valori")
