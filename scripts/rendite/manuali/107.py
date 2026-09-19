# -*- coding: utf-8 -*-
"""107 FONCER - Unipol Assicurazioni (marchio UGF) - Nota informativa collettiva di rendita immediata.
Documento scansionato: nessuna tavola dei coefficienti, solo il progetto esemplificativo (pag. 14-30).
Trascritta a mano la riga 'anni trascorsi = 0' di ogni ipotesi, che e la rendita iniziale su 10.000 euro di premio lordo."""
import json, os

# tariffa -> tasso tecnico, pagina, {(eta, sesso): (vitalizia, certa5, certa10, reversibile100, controassicurata)}
# La reversibile e la stessa coppia in entrambe le figure: aderente 65 M con reversionario 60 F.
TARIFFE = {
  "A0": (0.0, 13, {(65, "M"): (498.09, 495.26, 485.54, 328.43, 335.60),
                   (60, "F"): (342.65, 342.36, 341.42, 328.43, 261.47)}),
  "A1": (1.0, 17, {(65, "M"): (559.59, 556.55, 545.25, 384.28, 468.37),
                   (60, "F"): (399.90, 399.53, 398.35, 384.28, 374.61)}),
  "A2": (2.0, 21, {(65, "M"): (625.37, 621.24, 608.28, 445.01, 555.29),
                   (60, "F"): (461.94, 461.46, 460.01, 445.01, 445.68)}),
  "AS": (2.5, 25, {(65, "M"): (659.30, 654.79, 640.97, 477.12, 595.53),
                   (60, "F"): (494.67, 494.13, 492.53, 477.12, 480.62)}),
}
TIPI = [("75", "vitalizia_immediata", None, "Rendita vitalizia"),
        ("76", "certa_poi_vitalizia", 5, "Rendita certa 5 anni e poi vitalizia"),
        ("77", "certa_poi_vitalizia", 10, "Rendita certa 10 anni e poi vitalizia"),
        ("71", "controassicurata", None, "Rendita vitalizia con controassicurazione")]

NOTA = ("Valore ricavato dal progetto esemplificativo (anni trascorsi = 0), non da una tavola: "
        "rendita annua iniziale per 10.000 euro di premio unico LORDO (caricamento 0,40% incluso). "
        "Una sola figura per sesso.")

set_out, n_tab = [], 0
for tariffa, (tasso, pagina, figure) in TARIFFE.items():
    tabelle = []
    for i, (cod, tipo, durata, titolo) in enumerate(TIPI):
        col = 4 if cod == "71" else i
        for (eta, sesso), v in figure.items():
            n_tab += 1
            tabelle.append({
              "verso_conversione": "moltiplicatore", "id_tabella": f"107-T{n_tab:02d}",
              "titolo_stampato": f"Tariffa {cod}{tariffa} - {titolo} - sviluppo delle prestazioni, anno 0",
              "tipologia": tipo, "durata_certa_anni": durata, "perc_reversibilita": None,
              "eta_reversionario_ipotesi": None, "sesso": sesso, "base_demografica": None,
              "tasso_tecnico": tasso, "variabile_riga": "eta_assicurativa", "scala_originale": 10000,
              "base_frazionamento": "annuo_corretto", "tipo_colonne": "frequenza", "colonne": ["annuale"],
              "righe": [[eta, v[col]]], "pagina_origine": pagina + (0 if sesso == "M" else 2),
              "qualita": "da_verificare", "note": NOTA})
    n_tab += 1
    tabelle.append({
      "verso_conversione": "moltiplicatore", "id_tabella": f"107-T{n_tab:02d}",
      "titolo_stampato": f"Tariffa 79{tariffa} - Rendita vitalizia reversibile - sviluppo delle prestazioni, anno 0",
      "tipologia": "reversibile", "durata_certa_anni": None, "perc_reversibilita": 100,
      "eta_reversionario_ipotesi": "colonne = eta del reversionario (60, sesso femminile)",
      "sesso": "M", "base_demografica": None, "tasso_tecnico": tasso, "variabile_riga": "eta_assicurativa",
      "scala_originale": 10000, "base_frazionamento": "annuo_corretto", "tipo_colonne": "eta_reversionario",
      "colonne": ["60"], "righe": [[65, figure[(65, "M")][3]]], "pagina_origine": pagina, "qualita": "da_verificare",
      "note": NOTA + " Coppia: aderente 65 anni maschio, reversionario 60 anni femmina, reversibilita 100%."})
    set_out.append({
      "id_set": f"107-C1-{tariffa}", "base_demografica": None, "valido_da": None, "valido_a": None,
      "condizioni_applicabilita": f"Tariffe 75{tariffa}-76{tariffa}-77{tariffa}-79{tariffa}-71{tariffa}: tasso tecnico {tasso:g}%",
      "set_corrente": True, "correzione_eta": [],
      "costi": [{"tipo_costo": "caricamento_premio", "valore_perc": 0.40, "frequenza": None,
                 "note": "Caricamento su ogni premio unico; costi di emissione 0 euro."},
                {"tipo_costo": "trattenuta_rendimento_gestione_separata", "valore_perc": 0.50, "frequenza": None,
                 "note": "Commissione di gestione annua sulla Gestione Speciale VITATTIVA."}],
      "tabelle": tabelle})

doc = {
  "id_fondo": "107", "nome_fondo": "FONCER",
  "file_origine": "107-FONDO PENSIONE FONCER_rendite.pdf",
  "data_documento": None, "file_pertinente": True,
  "note_documento": ("Documento scansionato (52 pagine, senza testo): Scheda sintetica, Nota informativa e "
                     "Condizioni del contratto collettivo di rendita immediata Unipol (marchio UGF, riferimenti "
                     "ISVAP: edizione anteriore al 2012). Non pubblica tavole dei coefficienti. I valori sono "
                     "ricavati dal progetto esemplificativo: per ciascuna delle quattro famiglie di tariffe "
                     "(tasso tecnico 0%, 1%, 2%, 2,5%) una figura maschio 65 anni e una femmina 60 anni, "
                     "rateazione annuale. I coefficienti distinguono per sesso. Costi di erogazione non previsti; "
                     "rendimento minimo garantito 2,50%; rendita rivalutabile. Base demografica non dichiarata "
                     "nelle pagine lette."),
  "nuove_prestazioni_2026": {"rendita_durata_definita": False, "prelievi_liberamente_determinabili": False,
                             "erogazione_frazionata": False},
  "convenzioni": [{"id_convenzione": "107-C1", "compagnia": "Unipol Assicurazioni S.p.A.",
                   "data_scadenza": None, "tacito_rinnovo": None,
                   "note": "Contratto di assicurazione collettiva di rendita immediata a premio unico stipulato dal Fondo.",
                   "set": set_out}],
  "autocontrolli": {"progressione_eta": "non_applicabile", "ordine_tipologie": "ok", "decrescenza_rateazioni": "non_applicabile",
                    "ordine_di_grandezza": "ok", "completezza": "parziale",
                    "dettaglio": "Solo figure esemplificative: il documento non contiene tavole."},
  "warnings": ["Documento probabilmente superato (anteriore al 2012): chiedere al Fondo la convenzione in vigore.",
               "Non e indicato quale delle quattro tariffe si applica oggi: tutti i set sono marcati come correnti.",
               "Valori su premio lordo e per sole due figure: non usabili per un calcolo generale per eta."],
}

QUI = os.path.dirname(os.path.abspath(__file__))
json.dump(doc, open(os.path.join(QUI, "107.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
tab = [t for s in set_out for t in s["tabelle"]]
print(f"107: {len(tab)} tabelle, {sum(len(t['righe']) * len(t['colonne']) for t in tab)} valori")
