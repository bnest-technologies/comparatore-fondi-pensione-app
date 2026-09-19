"""
Normalizza le estrazioni nello schema canonico.

Uso:  python normalizza_estrazione.py <estrazione.json> [uscita.json]

L'estrazione automatica non mantiene nomi di campo stabili: la stessa cosa
compare come "righe", "valori", "dati" o "coefficienti", la durata della rendita
certa come "durata_certa_anni", "anni_garanzia" o "garanzia_anni", e i set di
coefficienti ora dentro la convenzione ora a livello di fondo.
Questo modulo riconosce le varianti e restituisce sempre la stessa forma, così
il resto della catena (validazione, calcolo, caricamento) non deve saperne nulla.
"""
import sys, json, collections, re

FREQ = ["annuale", "semestrale", "quadrimestrale", "trimestrale", "bimestrale", "mensile"]

ALIAS_SET = ["set", "set_coefficienti", "sets_coefficienti", "sets"]
ALIAS_RIGHE = ["righe", "valori", "dati", "coefficienti", "rows"]
ALIAS_DURATA = ["durata_certa_anni", "anni_garanzia", "garanzia_anni", "anni_certi"]
ALIAS_REV = ["perc_reversibilita", "percentuale_reversibilita", "reversibilita"]
ALIAS_TITOLO = ["titolo_stampato", "titolo", "titolo_originale", "nome", "descrizione"]
ALIAS_PAGINA = ["pagina_origine", "pagina", "pag", "pagina_pdf"]
ALIAS_NP2026 = ["nuove_prestazioni_2026", "nuove_prestazioni_legge_bilancio_2026",
                "dati_nuove_prestazioni", "prestazioni_l_bilancio_2026",
                "dati_normativi_2026", "legge_bilancio_2026", "nuove_prestazioni_l2026"]


def primo(d, chiavi, default=None):
    for k in chiavi:
        if isinstance(d, dict) and d.get(k) is not None:
            return d[k]
    return default


def lista_piu_ricca(d, chiavi):
    """
    Alcuni output riportano piu alias contemporaneamente, con uno vuoto e uno pieno
    (es. "set": [] accanto a "sets_coefficienti": [...]). Va presa quella con dati.
    """
    migliore = []
    for k in chiavi:
        v = d.get(k) if isinstance(d, dict) else None
        if isinstance(v, list) and len(v) > len(migliore):
            migliore = v
    return migliore


def estrai_celle(tab):
    """Restituisce (colonne, righe) qualunque forma abbia la tabella."""
    grezze = lista_piu_ricca(tab, ALIAS_RIGHE)
    if not isinstance(grezze, list) or not grezze:
        return [], []

    # forma a matrice: colonne dichiarate + righe come liste
    cols = tab.get("colonne")
    if cols and isinstance(grezze[0], list):
        righe = [r for r in grezze if isinstance(r, list) and len(r) == len(cols) + 1]
        return [str(c) for c in cols], righe

    # forme a oggetto: {eta, valori:{freq: v}} oppure {eta, freq: v, ...}
    colonne, righe = [], []
    for r in grezze:
        if not isinstance(r, dict):
            continue
        eta = r.get("eta") if r.get("eta") is not None else r.get("età")
        if eta is None:
            continue
        valori = r.get("valori") or r.get("coefficienti")
        if not isinstance(valori, dict):
            valori = {k: v for k, v in r.items()
                      if k not in ("eta", "età") and isinstance(v, (int, float))}
        if not valori:
            continue
        for k in valori:
            if k not in colonne:
                colonne.append(str(k))
        righe.append((eta, valori))

    # ordina le colonne: prima le rateazioni note, poi il resto (es. delta reversionario)
    note = [c for c in FREQ if c in colonne]
    altre = [c for c in colonne if c not in note]
    try:
        altre.sort(key=lambda x: int(float(x)))
    except (ValueError, TypeError):
        altre.sort()
    colonne = note + altre

    out = []
    for eta, valori in righe:
        riga = [eta] + [valori.get(c) for c in colonne]
        if all(isinstance(v, (int, float)) for v in riga[1:]):
            out.append(riga)
    return colonne, out


def verso_conversione(tab, righe, colonne):
    """
    Alcuni fondi pubblicano DIVISORI invece di coefficienti: la rendita si ottiene
    dividendo il montante, non moltiplicandolo. Confonderli ribalta il risultato.
    Decide l'ordine di grandezza: un coefficiente vale 20-100 per mille, un divisore
    (capitale per 1 euro di rendita) vale circa 20.000 per mille. Il testo conta solo
    se mancano i numeri, e solo la parola "divisor": "dividendo per 1.000" e una
    normale istruzione di calcolo e aveva fatto classificare male il fondo 5003.
    """
    if righe and colonne:
        primi = [r[1] for r in righe if len(r) > 1 and isinstance(r[1], (int, float))]
        if primi:
            mediana = sorted(primi)[len(primi) // 2]
            scala = tab.get("scala_originale") or 1
            return "divisore" if mediana * 1000 / scala > 300 else "moltiplicatore"
    testo = " ".join(str(tab.get(k) or "") for k in ("note", "titolo", "nome", "titolo_stampato")).lower()
    return "divisore" if "divisor" in testo else "moltiplicatore"


def tipo_colonne(colonne):
    """
    frequenza               -> "annuale", "mensile", ...
    generazione             -> classi di anno di nascita ("dal 1949 al 1957")
    delta_eta_reversionario -> differenze di eta ("-5", "0", "5")
    eta_reversionario       -> eta assolute del reversionario ("60", "65", "70")
    """
    if any(c in FREQ for c in colonne):
        return "frequenza"
    if any(re.search(r"(18|19|20)\d\d", str(c)) for c in colonne):
        return "generazione"
    numeri = []
    for c in colonne:
        try:
            numeri.append(float(str(c).replace(",", ".")))
        except ValueError:
            pass
    if numeri and min(numeri) >= 20:
        return "eta_reversionario"
    return "delta_eta_reversionario"


def durata_certa(tab):
    """La durata e spesso solo nel titolo ("Rendita certa per 5 anni")."""
    v = primo(tab, ALIAS_DURATA)
    if v is not None:
        return v
    if tab.get("tipologia") != "certa_poi_vitalizia":
        return None
    testo = " ".join(str(tab.get(k) or "") for k in ALIAS_TITOLO + ["note"]).lower()
    for pat in (r"cert[ao][^0-9]{0,25}(\d{1,2})\s*anni",
                r"garantit[ao][^0-9]{0,25}(\d{1,2})\s*anni",
                r"primi\s+(\d{1,2})\s+anni"):
        m = re.search(pat, testo)
        if m:
            break
    return int(m.group(1)) if m else None


def normalizza_tabella(tab, idx, id_set):
    colonne, righe = estrai_celle(tab)
    # il motore cerca la rateazione per nome: 'bimestrali' diventa 'bimestrale'
    colonne = ["bimestrale" if str(c).strip().lower() == "bimestrali" else c for c in colonne]
    return {
        "verso_conversione": verso_conversione(tab, righe, colonne),
        "id_tabella": tab.get("id_tabella") or tab.get("tabella_id") or f"{id_set}-T{idx:02d}",
        "titolo_stampato": primo(tab, ALIAS_TITOLO),
        "tipologia": tab.get("tipologia"),
        "durata_certa_anni": durata_certa(tab),
        "perc_reversibilita": primo(tab, ALIAS_REV),
        "eta_reversionario_ipotesi": tab.get("eta_reversionario_ipotesi"),
        "sesso": tab.get("sesso") or "U",
        "base_demografica": tab.get("base_demografica"),
        "tasso_tecnico": tab.get("tasso_tecnico"),
        "variabile_riga": tab.get("variabile_riga") or "eta_assicurativa",
        "scala_originale": tab.get("scala_originale"),
        "base_frazionamento": tab.get("base_frazionamento") or "annuo_corretto",
        "tipo_colonne": tipo_colonne(colonne),
        "colonne": colonne,
        "righe": righe,
        "pagina_origine": primo(tab, ALIAS_PAGINA),
        "qualita": tab.get("qualita"),
        "note": tab.get("note"),
    }


def normalizza_fondo(albo, f):
    convenzioni = []
    # i set possono stare dentro la convenzione o direttamente sul fondo
    orfani = lista_piu_ricca(f, ALIAS_SET)

    # la convenzione puo essere al singolare, o mancare del tutto
    conv_src = f.get("convenzioni")
    if not conv_src:
        c1 = f.get("convenzione")
        conv_src = [c1] if isinstance(c1, dict) else ([{}] if orfani else [])

    for ci, conv in enumerate(conv_src or [], 1):
        sets = []
        for si, s in enumerate(lista_piu_ricca(conv, ALIAS_SET), 1):
            id_set = s.get("id_set") or s.get("nome_set") or f"{albo}-C{ci}-S{si}"
            sets.append({
                "id_set": id_set,
                "base_demografica": s.get("base_demografica"),
                "valido_da": s.get("valido_da"),
                "valido_a": s.get("valido_a"),
                "condizioni_applicabilita": s.get("condizioni_applicabilita"),
                "set_corrente": s.get("set_corrente"),
                "correzione_eta": s.get("correzione_eta") or [],
                "costi": s.get("costi") if isinstance(s.get("costi"), list) else
                         ([s["costi"]] if isinstance(s.get("costi"), dict) else []),
                "tabelle": [normalizza_tabella(t, i, id_set)
                            for i, t in enumerate(s.get("tabelle") or [], 1)],
            })
        # se la convenzione non ha set ma il fondo ha set orfani, li attribuisce alla prima
        if not sets and orfani and ci == 1:
            for si, s in enumerate(orfani, 1):
                id_set = s.get("id_set") or s.get("nome_set") or f"{albo}-C1-S{si}"
                sets.append({
                    "id_set": id_set,
                    "base_demografica": s.get("base_demografica"),
                    "valido_da": s.get("valido_da"), "valido_a": s.get("valido_a"),
                    "condizioni_applicabilita": s.get("condizioni_applicabilita"),
                    "set_corrente": s.get("set_corrente"),
                    "correzione_eta": s.get("correzione_eta") or [],
                    "costi": s.get("costi") if isinstance(s.get("costi"), list) else [],
                    "tabelle": [normalizza_tabella(t, i, id_set)
                                for i, t in enumerate(s.get("tabelle") or [], 1)],
                })
            orfani = []
        convenzioni.append({
            "id_convenzione": conv.get("id_convenzione") or f"{albo}-C{ci}",
            "compagnia": conv.get("compagnia"),
            "data_scadenza": conv.get("data_scadenza") or conv.get("scadenza"),
            "tacito_rinnovo": conv.get("tacito_rinnovo"),
            "note": conv.get("note"),
            "set": sets,
        })

    np = primo(f, ALIAS_NP2026, {}) or {}
    return {
        "id_fondo": str(albo),
        "nome_fondo": f.get("nome_fondo"),
        "file_origine": f.get("file_origine"),
        "data_documento": f.get("data_documento"),
        "file_pertinente": f.get("file_pertinente", True),
        "note_documento": f.get("note_documento"),
        "nuove_prestazioni_2026": {
            "rendita_durata_definita": primo(np, ["rendita_durata_definita", "rendita_a_durata_definita", "durata_definita"]),
            "prelievi_liberamente_determinabili": primo(np, ["prelievi_liberamente_determinabili", "prelievi_liberi"]),
            "erogazione_frazionata": primo(np, ["erogazione_frazionata", "frazionata"]),
        },
        "convenzioni": convenzioni,
        "autocontrolli": f.get("autocontrolli") or {},
        "warnings": f.get("warnings") or [],
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src.replace(".json", "_normalizzato.json")

    d = json.load(open(src, encoding="utf-8"))
    fondi = d.get("fondi") or {str(d.get("id_fondo")): d}

    out = {}
    report = []
    for albo, f in fondi.items():
        n = normalizza_fondo(albo, f)
        out[str(albo)] = n
        tab = [t for c in n["convenzioni"] for s in c["set"] for t in s["tabelle"]]
        valori = sum(len(t["righe"]) * max(len(t["colonne"]), 1) for t in tab)
        vuote = sum(1 for t in tab if not t["righe"])
        report.append((albo, len(tab), valori, vuote))

    json.dump({"manifest": {"fondi": len(out)}, "fondi": out},
              open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"normalizzato in: {dst}\n")
    print(f"{'albo':>6} {'tabelle':>8} {'valori':>8} {'vuote':>6}")
    tot_v = tot_t = tot_vuote = 0
    for albo, nt, nv, vu in sorted(report, key=lambda x: int(x[0]) if x[0].isdigit() else 0):
        print(f"{albo:>6} {nt:>8} {nv:>8} {vu:>6}" + ("   <-- nessun dato" if nv == 0 else ""))
        tot_t += nt; tot_v += nv; tot_vuote += vu
    print(f"{'TOT':>6} {tot_t:>8} {tot_v:>8} {tot_vuote:>6}")


if __name__ == "__main__":
    main()
