# -*- coding: utf-8 -*-
"""
Incrocia la verifica testuale e quella OCR, e conferma per confronto le celle rimaste.

Uso:  python incrocia_verifiche.py <database.json> <albo> [albo...] [--salva]

Con --salva le correzioni candidate vengono scritte in verifica_ocr/correzioni_gemelle.json,
che correzioni_puntuali.py applica.

Una cella non confermata dall'OCR e comunque confermata se la stessa tabella (stessa
tipologia, sesso, tasso, colonne ed eta) compare in un altro fondo che l'ha superata
nella verifica testuale: e la stessa convenzione assicurativa pubblicata altrove.
Per le celle che restano, si mostra il valore di quella tabella gemella, se differisce
solo in quella cella: e il candidato alla correzione.
"""
import json, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))


def norm_col(c):
    """'bimestrali' e 'bimestrale' sono la stessa colonna."""
    c = str(c).strip().lower()
    return c[:-1] + "e" if c.endswith("li") else c


def tabelle(fondo):
    for c in fondo.get("convenzioni", []):
        for s in c.get("set", []):
            for t in s.get("tabelle", []):
                yield t


def main():
    salva = "--salva" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--salva"]
    db, albi = args[0], args[1:]
    tutte = []
    F = json.load(open(db, encoding="utf-8"))["fondi"]
    testo = json.load(open(os.path.join(BASE, "verifica_contro_pdf.json"), encoding="utf-8"))

    # celle confermate, fondo per fondo: dal testo del PDF, oppure dall'OCR per le scansioni
    ocr_dir = os.path.join(BASE, "verifica_ocr")
    non_confermate = {}
    for a in F:
        f_ocr = os.path.join(ocr_dir, f"{a}.json")
        r = testo.get(a, {})
        if r.get("esito") == "scansione" or r.get("esito") == "DA CONTROLLARE":
            if os.path.exists(f_ocr):
                non_confermate[a] = {tuple(x[:3]) for x in json.load(open(f_ocr, encoding="utf-8"))["assenti"]}
            else:
                non_confermate[a] = None          # nessuna verifica: il fondo non fa da gemello
        else:
            non_confermate[a] = {tuple(x[:3]) for x in r.get("assenti", [])}
    certe = []
    for a, t_list in ((a, list(tabelle(F[a]))) for a in F):
        if non_confermate.get(a) is None:
            continue
        for t in t_list:
            certe.append((a, t))

    for albo in albi:
        f_ocr = os.path.join(BASE, "verifica_ocr", f"{albo}.json")
        if not os.path.exists(f_ocr):
            print(f"{albo}: verifica OCR non ancora disponibile"); continue
        assenti = json.load(open(f_ocr, encoding="utf-8"))["assenti"]
        per_tab = {}
        for tid, eta, col, v in assenti:
            per_tab.setdefault(tid, []).append((eta, col, v))
        restano, candidati = [], []
        for t in tabelle(F[albo]):
            celle = per_tab.get(t["id_tabella"])
            if not celle:
                continue
            # gemella: stesse colonne e tutte le eta di questa tabella presenti anche li
            # (una gemella puo arrivare a eta piu alte: 148 si ferma a 70, FOPEN a 80)
            eta_t = {r[0] for r in t["righe"]}
            migliore = None
            for a, g in certe:
                if a == albo or [norm_col(c) for c in g["colonne"]] != [norm_col(c) for c in t["colonne"]]:
                    continue
                rg = {r[0]: r for r in g["righe"]}
                if not eta_t <= set(rg):
                    continue
                diverse = sum(1 for r in t["righe"] for x, y in zip(r[1:], rg[r[0]][1:]) if x != y)
                if migliore is None or diverse < migliore[0]:
                    migliore = (diverse, a, rg, g)
            for eta, col, v in celle:
                n_celle = len(t["righe"]) * len(t["colonne"])
                if migliore and migliore[0] <= max(3, 0.10 * n_celle):
                    j = t["colonne"].index(col) + 1
                    g_val = migliore[2][eta][j]
                    g_tid = migliore[3]["id_tabella"]
                    if (g_tid, eta, migliore[3]["colonne"][j - 1]) in (non_confermate.get(migliore[1]) or set()):
                        restano.append((t["id_tabella"], eta, col, v))
                        continue                      # la cella gemella non e confermata: non fa testo
                    if g_val == v:
                        continue                      # confermata dalla tabella gemella
                    candidati.append((t["id_tabella"], eta, col, v, migliore[1], "", g_val))
                else:
                    restano.append((t["id_tabella"], eta, col, v))
        print(f"{albo}: non confermate dall'OCR {len(assenti)}, confermate da una tabella gemella "
              f"{len(assenti) - len(restano) - len(candidati)}, correzioni candidate {len(candidati)}, "
              f"da guardare a occhio {len(restano)}")
        tutte += [dict(albo=albo, id_tabella=c[0], eta=c[1], colonna=c[2], errato=c[3], corretto=c[6], gemella=c[4])
                  for c in candidati]
        for c in candidati:
            print(f"   CANDIDATA {c[0]} eta {c[1]} {c[2]}: {c[3]} -> {c[6]} (come {c[4]} {c[5]})")
        tabs = {}
        for tid, eta, col, v in restano:
            tabs.setdefault(tid, []).append((eta, col, v))
        for tid, xs in tabs.items():
            print(f"   A OCCHIO {tid}: {len(xs)} celle, es. {xs[:3]}")
    if salva:
        out = os.path.join(BASE, "verifica_ocr", "correzioni_gemelle.json")
        prec = json.load(open(out, encoding="utf-8")) if os.path.exists(out) else []
        chiave = lambda d: (d["albo"], d["id_tabella"], d["eta"], d["colonna"])
        unite = {chiave(d): d for d in prec + tutte}
        json.dump(list(unite.values()), open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"salvate {len(tutte)} correzioni candidate in {out}")


if __name__ == "__main__":
    main()
