# -*- coding: utf-8 -*-
"""
Trova le celle che rompono la regolarita della tavola.

Uso:  python anomalie_regolarita.py <database.json> <albo> [albo...] [--soglia 0.0004]

Un coefficiente varia in modo regolare sia con l'eta sia con la rateazione. Per ogni
cella si misurano due scarti:
  - fra colonne: il rapporto con la colonna precedente, confrontato con la media dello
    stesso rapporto alle eta vicine;
  - fra eta: il logaritmo del valore, confrontato con la media delle eta vicine
    (seconda differenza).
Un errore di lettura di una cifra produce un picco isolato; un refuso del documento pure.
Le celle segnalate vanno guardate sul PDF: questo script non corregge nulla.
"""
import json, math, sys


def tabelle(fondo):
    for c in fondo.get("convenzioni", []):
        for s in c.get("set", []):
            for t in s.get("tabelle", []):
                yield t


def anomalie(t, soglia):
    righe = [r for r in t.get("righe") or [] if all(isinstance(x, (int, float)) and x > 0 for x in r[1:])]
    righe.sort(key=lambda r: r[0])
    out = {}
    n = len(t.get("colonne") or [])
    # fra colonne
    for j in range(2, n + 1):
        rap = [r[j] / r[j - 1] for r in righe]
        for i in range(1, len(righe) - 1):
            atteso = (rap[i - 1] + rap[i + 1]) / 2
            s = abs(rap[i] - atteso)
            if s > soglia:
                # il picco puo essere nella colonna j o nella j-1: si segnala la cella che rompe anche la serie per eta
                out[(righe[i][0], j)] = max(out.get((righe[i][0], j), 0), s)
    # fra eta (seconda differenza del logaritmo)
    for j in range(1, n + 1):
        lv = [math.log(r[j]) for r in righe]
        for i in range(1, len(righe) - 1):
            s = abs(lv[i] - (lv[i - 1] + lv[i + 1]) / 2)
            if s > soglia * 10:
                out[(righe[i][0], j)] = max(out.get((righe[i][0], j), 0), s / 10)
    return out


def main():
    args = sys.argv[1:]
    soglia = 0.0004
    if "--soglia" in args:
        k = args.index("--soglia"); soglia = float(args[k + 1]); del args[k:k + 2]
    db, albi = args[0], args[1:]
    F = json.load(open(db, encoding="utf-8"))["fondi"]
    for albo in albi:
        tot = 0
        for t in tabelle(F[albo]):
            if t.get("tipo_colonne") != "frequenza" or len(t.get("righe") or []) < 5:
                continue
            # le controassicurate sono irregolari per natura (capitale caso morte decrescente):
            # lo sono anche nei fondi testuali verificati, quindi qui darebbero solo rumore
            if t.get("tipologia") == "controassicurata" and "--tutte" not in sys.argv:
                continue
            a = anomalie(t, soglia)
            for (eta, j), s in sorted(a.items()):
                tot += 1
                print(f"{albo:>5} {t['id_tabella']:<28} eta {eta:>3} {t['colonne'][j - 1]:<15} scarto {s:.5f}")
        print(f"{albo}: {tot} celle irregolari")


if __name__ == "__main__":
    main()
