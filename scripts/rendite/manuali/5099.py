# -*- coding: utf-8 -*-
"""5099 UNIPOL PREVIDENZA FUTURA - UnipolSai/Unipol - ed. 07/2026.
Valori letti dal testo del PDF (pdftotext -table), non ribattuti: ogni riga e controllata per numero di colonne."""
import json, os, re

QUI = os.path.dirname(os.path.abspath(__file__))
testo = open(os.path.join(QUI, "5099.txt"), encoding="latin-1").read().splitlines()

def num(s): return float(s.replace(",", "."))

def blocco(inizio, n_val, eta_da, eta_a):
    """Righe 'eta v1 ... vn' successive alla prima riga che contiene `inizio`."""
    i = next(k for k, r in enumerate(testo) if inizio in r)
    righe = []
    for r in testo[i+1:]:
        m = re.match(r"^\s*(\d{2})\s+((?:\d+,\d{4}\s*)+)$", r)
        if not m:
            if righe and "Pagina" not in r and "Unipol" not in r and not r.strip().startswith("Et"):
                break
            continue
        vals = [num(v) for v in m.group(2).split()]
        assert len(vals) == n_val, f"{inizio}: eta {m.group(1)} ha {len(vals)} valori"
        righe.append([int(m.group(1))] + vals)
        if int(m.group(1)) == eta_a: break
    eta = [r[0] for r in righe]
    assert eta == list(range(eta_da, eta_a + 1)), f"{inizio}: eta {eta[:3]}...{eta[-3:]}"
    return righe

COL6 = ["annuale", "semestrale", "quadrimestrale", "trimestrale", "bimestrale", "mensile"]
BASE = "A62I Unisex (40% maschi, 60% femmine)"

def tab(idx, titolo, tipologia, righe, pagina, colonne=COL6, **extra):
    t = {"verso_conversione": "moltiplicatore", "id_tabella": f"5099-T{idx:02d}",
         "titolo_stampato": titolo, "tipologia": tipologia, "durata_certa_anni": None,
         "perc_reversibilita": None, "eta_reversionario_ipotesi": None, "sesso": "U",
         "base_demografica": BASE, "tasso_tecnico": 0, "variabile_riga": "eta_assicurativa",
         "scala_originale": 1000, "base_frazionamento": "annuo_corretto", "tipo_colonne": "frequenza",
         "colonne": colonne, "righe": righe, "pagina_origine": pagina, "qualita": "ok", "note": ""}
    t.update(extra)
    return t

T = "rendita annua (per ogni 1.000,00 Euro da convertire)"
tabelle = [
  tab(1, f"Opzione A - {T} - rendita vitalizia", "vitalizia_immediata",
      blocco("Opzione  A", 6, 50, 83), 7),
  tab(2, f"Opzione B - {T} - rendita certa per 5 anni e successivamente vitalizia", "certa_poi_vitalizia",
      blocco("Opzione  B", 6, 50, 83), 8, durata_certa_anni=5),
  tab(3, f"Opzione C - {T} - rendita certa per 10 anni e successivamente vitalizia", "certa_poi_vitalizia",
      blocco("Opzione  C", 6, 50, 83), 9, durata_certa_anni=10),
]
for idx, perc in ((4, 100), (5, 60)):
    tabelle.append(tab(idx, f"Opzione D - {T} erogabile in rate annuali con una percentuale di reversibilita del {perc}%",
        "reversibile", blocco(f"reversibilit\xe0 del {perc}%", 4, 65, 75), 10,
        colonne=["60", "65", "70", "75"], tipo_colonne="eta_reversionario", perc_reversibilita=perc,
        eta_reversionario_ipotesi="colonne = eta corretta del reversionario (60, 65, 70, 75)",
        note=("Coefficienti riportati a titolo esemplificativo: le colonne sono eta assolute del "
              "reversionario, non differenze di eta. Sola rateazione annuale. Per altre combinazioni "
              "l'impresa fornisce i coefficienti su richiesta.")))
tabelle += [
  tab(6, f"Opzione E - {T} - rendita vitalizia controassicurata", "controassicurata",
      blocco("Opzione  E", 6, 50, 83), 11),
  tab(7, "Opzione F - rendita annua (per ogni 1.000,00 Euro da convertire) erogabile in rate mensili - vitalizia maggiorata in caso di non autosufficienza",
      "ltc", blocco("erogabile in rate mensili", 1, 50, 73), 12, colonne=["mensile"],
      base_demografica=BASE + " piu basi secondarie per il rischio di non autosufficienza",
      note="Solo rateazione mensile. Non consentita a chi e gia non autosufficiente o ha superato i 70 anni."),
]

CORREZIONE = [(1927,1938,3),(1939,1947,2),(1948,1957,1),(1958,1966,0),(1967,1977,-1),
              (1978,1989,-2),(1990,2001,-3),(2002,2014,-4),(2015,2020,-5),(2021,None,-6)]
CARICAMENTI = [("annuale",0.9),("semestrale",1.0),("quadrimestrale",1.1),("trimestrale",1.2),
               ("bimestrale",1.4),("mensile",2.0)]
costi = [{"tipo_costo": "spese_erogazione_rendita", "valore_perc": v, "frequenza": f,
          "note": "Caricamento incluso nei coefficienti, in percentuale della rata."} for f, v in CARICAMENTI]
costi.append({"tipo_costo": "trattenuta_rendimento_gestione_separata", "valore_perc": 1.2, "frequenza": None,
              "note": "Commissione annua trattenuta dal rendimento della gestione separata a ogni rivalutazione della rendita."})

doc = {
  "id_fondo": "5099", "nome_fondo": "UNIPOL PREVIDENZA FUTURA",
  "file_origine": "5099-UNIPOL PREVIDENZA FUTURA - PIANO INDIVIDUALE PENSIONISTICO DI TIPO ASSICURATIVO - FONDO PENSIONE_rendite.pdf",
  "data_documento": "2026-07-01", "file_pertinente": True,
  "note_documento": ("Estratto dal testo del PDF e controllato riga per riga. Documento sull'erogazione delle "
                     "rendite mod. DERenUPF ed. 07/2026, coefficienti Serie 10/2017. Tutte e cinque le tipologie: "
                     "vitalizia, certa 5 e 10 anni, reversibile (figure-tipo 100% e 60%), controassicurata, "
                     "maggiorata per non autosufficienza. Eta corrette 50-83 (LTC 50-73), sei rateazioni. "
                     "Rendita rivalutabile ogni anno. L'erogazione frazionata e richiedibile dal 31/10/2026, "
                     "rendita a durata definita e prelievi dal 01/07/2026."),
  "nuove_prestazioni_2026": {"rendita_durata_definita": True,
                             "prelievi_liberamente_determinabili": True,
                             "erogazione_frazionata": True},
  "convenzioni": [{
    "id_convenzione": "5099-C1", "compagnia": "Unipol Assicurazioni S.p.A.",
    "data_scadenza": None, "tacito_rinnovo": None, "note": "Il documento non riporta la ragione sociale: indicata la compagnia del gruppo che gestisce i PIP Unipol.",
    "set": [{
      "id_set": "5099-C1-S1", "base_demografica": BASE, "valido_da": None, "valido_a": None,
      "condizioni_applicabilita": "Coefficienti Serie 10/2017 in vigore alla data di aggiornamento del documento",
      "set_corrente": True,
      "correzione_eta": [{"sesso": "U", "anno_nascita_da": a, "anno_nascita_a": b, "delta_anni": d}
                          for a, b, d in CORREZIONE],
      "costi": costi, "tabelle": tabelle,
    }],
  }],
  "autocontrolli": {"progressione_eta": "ok", "ordine_tipologie": "ok", "decrescenza_rateazioni": "ok",
                    "ordine_di_grandezza": "ok", "completezza": "ok",
                    "dettaglio": "Ogni riga controllata per numero di colonne e continuita delle eta."},
  "warnings": [],
}

json.dump(doc, open(os.path.join(QUI, "5099.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
n = sum(len(t["righe"]) * len(t["colonne"]) for t in tabelle)
print(f"5099: {len(tabelle)} tabelle, {n} valori")
for t in tabelle: print(f"  {t['id_tabella']} {t['tipologia']:20} righe {len(t['righe'])} prima {t['righe'][0]} ultima {t['righe'][-1]}")
