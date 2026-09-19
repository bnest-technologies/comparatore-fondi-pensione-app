"""
Valida gli output JSON di Gemini e li converte nelle tabelle del database.

Uso:  python valida_rendite.py <cartella_con_i_json> [cartella_output]

Legge tutti i .json della cartella, verifica struttura e coerenza numerica,
e produce i CSV normalizzati in formato long. I valori grezzi vengono
convertiti in "per mille" qui, non dal modello.
"""
import sys, os, json, glob, csv, collections

FREQ_ORDER = ["annuale", "semestrale", "quadrimestrale", "trimestrale", "bimestrale", "mensile"]
RATE_PER_YEAR = {"annuale": 1, "semestrale": 2, "quadrimestrale": 3,
                 "trimestrale": 4, "bimestrale": 6, "mensile": 12}
# fondi che condividono la convenzione: i coefficienti devono coincidere
GRUPPI_ATTESI = [{"88", "103", "116", "124"}, {"4", "118"}, {"65", "169"}]


def per_mille(v, scala):
    if v is None or scala in (None, 0):
        return None
    return round(v * 1000.0 / scala, 6)


def valida_doc(d, problemi):
    fid = str(d.get("id_fondo", "?"))
    tag = f"[{fid}]"

    if not d.get("file_pertinente", True):
        problemi.append((fid, "INFO", f"dichiarato non pertinente: {d.get('note_documento','')[:110]}"))
        return []

    tabelle = []
    for conv in d.get("convenzioni", []):
        for s in conv.get("set", []):
            for t in s.get("tabelle", []):
                t["_fondo"] = fid
                t["_conv"] = conv.get("id_convenzione")
                t["_set"] = s.get("id_set")
                t["_set_corrente"] = s.get("set_corrente")
                tabelle.append(t)

    if not tabelle:
        problemi.append((fid, "ERRORE", "nessuna tabella estratta"))
        return []

    for t in tabelle:
        tid = t.get("id_tabella", "?")
        cols = t.get("colonne") or []
        righe = t.get("righe") or []
        scala = t.get("scala_originale")
        # alcuni fondi pubblicano divisori invece di coefficienti: la rendita si
        # ottiene dividendo. Tutti i controlli di andamento vanno letti al contrario.
        divisore = t.get("verso_conversione") == "divisore"

        if not cols or not righe:
            problemi.append((fid, "ERRORE", f"{tid}: colonne o righe vuote"))
            continue
        if scala not in (1, 100, 1000, 10000):
            problemi.append((fid, "ERRORE", f"{tid}: scala_originale anomala ({scala})"))

        # completezza: ogni riga = eta + un valore per colonna
        bad = [r[0] for r in righe if len(r) != len(cols) + 1]
        if bad:
            problemi.append((fid, "ERRORE", f"{tid}: {len(bad)} righe con numero di valori errato (es. eta {bad[:4]})"))

        # progressione sull'eta (un divisore cala, un coefficiente cresce)
        for ci in range(len(cols)):
            serie = [(r[0], r[ci + 1]) for r in righe
                     if len(r) == len(cols) + 1 and isinstance(r[ci + 1], (int, float))]
            if divisore:
                inv = [serie[i][0] for i in range(1, len(serie)) if serie[i][1] > serie[i - 1][1]]
                verso = "non decrescente"
            else:
                inv = [serie[i][0] for i in range(1, len(serie)) if serie[i][1] < serie[i - 1][1]]
                verso = "non crescente"
            if inv:
                problemi.append((fid, "SOSPETTO",
                                 f"{tid}: colonna '{cols[ci]}' {verso} alle eta {inv[:5]}"))

        # decrescenza sulle rateazioni
        if t.get("tipo_colonne") == "frequenza":
            # alcuni documenti stampano le colonne da bimestrale ad annuale (fondo 26):
            # l'ordine di stampa e legittimo, si confrontano i valori in ordine di frequenza
            ordinate = sorted((c for c in cols if c in FREQ_ORDER), key=FREQ_ORDER.index)
            idx = [cols.index(c) for c in ordinate]
            for r in righe[:5]:
                if len(r) != len(cols) + 1:
                    continue
                vals = [r[i + 1] for i in idx if isinstance(r[i + 1], (int, float))]
                if len(vals) < 2:
                    continue
                # coefficiente: cala al crescere delle rate. divisore: cresce.
                fuori = (any(vals[i] < vals[i - 1] * 0.995 for i in range(1, len(vals))) if divisore
                         else any(vals[i] > vals[i - 1] * 1.005 for i in range(1, len(vals))))
                if fuori:
                    atteso = "non crescenti" if divisore else "non decrescenti"
                    problemi.append((fid, "SOSPETTO",
                                     f"{tid}: eta {r[0]} valori {atteso} fra rateazioni -> possibile "
                                     f"abbinamento colonne errato"))
                    break

        # ordine di grandezza sulla vitalizia a 65 anni
        if t.get("tipologia") == "vitalizia_immediata" and scala:
            for r in righe:
                if r and r[0] == 65 and len(r) > 1 and isinstance(r[1], (int, float)):
                    pm = per_mille(r[1], scala)
                    if pm is None:
                        break
                    if divisore:
                        # il divisore e il reciproco: ~1000/coefficiente per mille
                        equivalente = 1_000_000 / pm if pm else 0
                        if not (20 <= equivalente <= 120):
                            problemi.append((fid, "ERRORE",
                                             f"{tid}: divisore a 65 anni = {round(pm/1000, 4)} per euro, "
                                             f"equivale a {round(equivalente, 1)} per mille (atteso 35-65)"))
                    elif not (20 <= pm <= 120):
                        problemi.append((fid, "ERRORE",
                                         f"{tid}: vitalizia a 65 anni = {pm} per mille (atteso 35-65). "
                                         f"Scala dichiarata {scala} probabilmente errata"))
                    break

        # base_frazionamento coerente con i numeri
        if t.get("tipo_colonne") == "frequenza" and "annuale" in cols and "mensile" in cols:
            ia, im = cols.index("annuale"), cols.index("mensile")
            for r in righe:
                if len(r) == len(cols) + 1 and isinstance(r[ia + 1], (int, float)) and r[ia + 1]:
                    ratio = r[im + 1] / r[ia + 1]
                    atteso = "per_rata" if ratio < 0.3 else "annuo_corretto"
                    if t.get("base_frazionamento") != atteso:
                        problemi.append((fid, "ERRORE",
                                         f"{tid}: base_frazionamento='{t.get('base_frazionamento')}' ma il rapporto "
                                         f"mensile/annuale e' {ratio:.3f} -> atteso '{atteso}'"))
                    break

    # ordine fra tipologie, a parita di set/sesso/tasso
    gruppi = collections.defaultdict(dict)
    for t in tabelle:
        k = (t["_set"], t.get("sesso"), t.get("tasso_tecnico"))
        tp = t.get("tipologia")
        if tp == "vitalizia_immediata":
            gruppi[k]["vit"] = t
        elif tp == "certa_poi_vitalizia":
            gruppi[k][f"certa{t.get('durata_certa_anni')}"] = t
    for k, g in gruppi.items():
        def val65(t):
            if not t:
                return None
            for r in t.get("righe", []):
                if r and r[0] == 65 and len(r) > 1 and isinstance(r[1], (int, float)):
                    return per_mille(r[1], t.get("scala_originale"))
            return None
        v, c5, c10 = val65(g.get("vit")), val65(g.get("certa5")), val65(g.get("certa10"))
        seq = [x for x in (v, c5, c10) if x is not None]
        if len(seq) < 2:
            continue
        # con i divisori il verso si ribalta: la vitalizia richiede MENO capitale
        # per un euro di rendita, quindi ha il divisore piu basso
        div = any((t or {}).get("verso_conversione") == "divisore"
                  for t in (g.get("vit"), g.get("certa5"), g.get("certa10")))
        fuori = (any(seq[i] < seq[i - 1] - 1e-9 for i in range(1, len(seq))) if div
                 else any(seq[i] > seq[i - 1] + 1e-9 for i in range(1, len(seq))))
        if fuori:
            atteso = ("vitalizia<=certa5<=certa10 (divisori)" if div
                      else "vitalizia>=certa5>=certa10")
            problemi.append((tabelle[0]["_fondo"], "SOSPETTO",
                             f"set {k[0]} sesso {k[1]} tt {k[2]}: atteso {atteso}, "
                             f"trovato {v} / {c5} / {c10}"))
    return tabelle


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(src, "csv")
    os.makedirs(out, exist_ok=True)

    problemi = []
    tutte = []
    docs = []
    for p in sorted(glob.glob(os.path.join(src, "*.json"))):
        try:
            d = json.load(open(p, encoding="utf-8"))
        except Exception as e:
            problemi.append((os.path.basename(p), "ERRORE", f"JSON non valido: {e}"))
            continue
        docs.append(d)
        tutte.extend(valida_doc(d, problemi))

    # controllo incrociato fra fondi che condividono la convenzione
    impronte = {}
    for t in tutte:
        if t.get("tipologia") == "vitalizia_immediata" and t.get("righe"):
            f = t["_fondo"]
            impronte.setdefault(f, tuple(
                per_mille(r[1], t.get("scala_originale"))
                for r in t["righe"][:10] if len(r) > 1 and isinstance(r[1], (int, float))))
    for g in GRUPPI_ATTESI:
        pres = {f: impronte[f] for f in g if f in impronte}
        if len(pres) > 1 and len(set(pres.values())) > 1:
            problemi.append(("/".join(sorted(g)), "ERRORE",
                             "fondi con la stessa convenzione hanno coefficienti diversi: "
                             "almeno uno e' stato letto male"))

    # scrittura CSV normalizzati
    w = lambda name, cols, rows: (
        lambda f: (csv.writer(f, delimiter=";").writerow(cols),
                   csv.writer(f, delimiter=";").writerows(rows)))(
        open(os.path.join(out, name), "w", newline="", encoding="utf-8"))

    conv_rows, set_rows, tab_rows, coef_rows, corr_rows, costi_rows, fondo_rows = [], [], [], [], [], [], []
    for d in docs:
        fid = str(d.get("id_fondo", "?"))
        np26 = d.get("nuove_prestazioni_2026") or {}
        fondo_rows.append([fid, d.get("nome_fondo"), d.get("file_pertinente", True),
                           np26.get("rendita_durata_definita"), np26.get("prelievi_liberamente_determinabili"),
                           np26.get("erogazione_frazionata"), (d.get("note_documento") or "")[:300]])
        for conv in d.get("convenzioni", []):
            conv_rows.append([conv.get("id_convenzione"), fid, conv.get("compagnia"),
                              conv.get("data_scadenza"), conv.get("tacito_rinnovo"), (conv.get("note") or "")[:300]])
            for s in conv.get("set", []):
                set_rows.append([s.get("id_set"), conv.get("id_convenzione"), fid, s.get("base_demografica"),
                                 s.get("valido_da"), s.get("valido_a"), s.get("set_corrente"),
                                 (s.get("condizioni_applicabilita") or "")[:400]])
                for c in s.get("correzione_eta", []) or []:
                    corr_rows.append([s.get("id_set"), fid, c.get("sesso"), c.get("anno_nascita_da"),
                                      c.get("anno_nascita_a"), c.get("delta_anni")])
                for c in s.get("costi", []) or []:
                    costi_rows.append([s.get("id_set"), fid, c.get("tipo_costo"), c.get("valore_perc"),
                                       c.get("frequenza"), (c.get("note") or "")[:200]])
                for t in s.get("tabelle", []):
                    tab_rows.append([t.get("id_tabella"), s.get("id_set"), conv.get("id_convenzione"), fid,
                                     t.get("tipologia"), t.get("durata_certa_anni"), t.get("perc_reversibilita"),
                                     t.get("eta_reversionario_ipotesi"), t.get("sesso"), t.get("base_demografica"),
                                     t.get("tasso_tecnico"), t.get("variabile_riga"), t.get("scala_originale"),
                                     t.get("base_frazionamento"), t.get("pagina_origine"), t.get("qualita"),
                                     (t.get("note") or "")[:300]])
                    cols, scala = t.get("colonne") or [], t.get("scala_originale")
                    tipo_col = t.get("tipo_colonne")
                    for r in t.get("righe") or []:
                        if len(r) != len(cols) + 1:
                            continue
                        for i, c in enumerate(cols):
                            v = r[i + 1]
                            if not isinstance(v, (int, float)):
                                continue
                            freq = c if tipo_col == "frequenza" else "annuale"
                            delta = c if tipo_col == "delta_eta_reversionario" else None
                            coef_rows.append([t.get("id_tabella"), fid, r[0], freq, delta,
                                              v, per_mille(v, scala)])

    w("rendite_fondo.csv", ["id_fondo", "nome_fondo", "file_pertinente", "np_durata_definita",
                            "np_prelievi_liberi", "np_erogazione_frazionata", "note"], fondo_rows)
    w("rendite_convenzioni.csv", ["id_convenzione", "id_fondo", "compagnia", "data_scadenza",
                                  "tacito_rinnovo", "note"], conv_rows)
    w("rendite_set.csv", ["id_set", "id_convenzione", "id_fondo", "base_demografica", "valido_da",
                          "valido_a", "set_corrente", "condizioni_applicabilita"], set_rows)
    w("rendite_tabelle.csv", ["id_tabella", "id_set", "id_convenzione", "id_fondo", "tipologia",
                              "durata_certa_anni", "perc_reversibilita", "eta_reversionario_ipotesi", "sesso",
                              "base_demografica", "tasso_tecnico", "variabile_riga", "scala_originale",
                              "base_frazionamento", "pagina_origine", "qualita", "note"], tab_rows)
    w("rendite_coefficienti.csv", ["id_tabella", "id_fondo", "eta", "frequenza", "delta_eta_reversionario",
                                   "coefficiente_originale", "coefficiente_per_mille"], coef_rows)
    w("rendite_correzione_eta.csv", ["id_set", "id_fondo", "sesso", "anno_nascita_da",
                                     "anno_nascita_a", "delta_anni"], corr_rows)
    w("rendite_costi.csv", ["id_set", "id_fondo", "tipo_costo", "valore_perc", "frequenza", "note"], costi_rows)

    print(f"documenti letti      : {len(docs)}")
    print(f"tabelle              : {len(tab_rows)}")
    print(f"coefficienti (long)  : {len(coef_rows)}")
    print(f"CSV scritti in       : {out}")
    print()
    sev = collections.Counter(p[1] for p in problemi)
    print("ESITO:", dict(sev) if sev else "nessun problema rilevato")
    for liv in ("ERRORE", "SOSPETTO", "INFO"):
        righe = [p for p in problemi if p[1] == liv]
        if righe:
            print(f"\n--- {liv} ({len(righe)}) ---")
            for fid, _, msg in righe[:40]:
                print(f"  {fid:>8}  {msg}")
            if len(righe) > 40:
                print(f"  ... e altri {len(righe)-40}")


if __name__ == "__main__":
    main()
