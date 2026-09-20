# -*- coding: utf-8 -*-
"""
Mostra, per uno o piu fondi, cosa c'e nel dataset e nei file COVIP.
Serve a capire perche un comparto non si abbina (nome diverso, comparto sparito, comparto nuovo).

  python scripts/covip/confronta_fondo.py --cartella "<Dati Covip>" FPN:87 FPA:150 PIP:5072
"""
import argparse, csv, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aggiorna_da_covip as A


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cartella", required=True)
    ap.add_argument("fondi", nargs="+", help="TIPO:ALBO, per esempio FPN:87")
    a = ap.parse_args()

    radice = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    d = os.path.join(radice, "data")
    csv_in = os.path.join(d, next(f for f in sorted(os.listdir(d)) if f.startswith("database_comparti_")))
    with open(csv_in, encoding="utf-8-sig", newline="") as f:
        righe = list(csv.DictReader(f))

    isc, rend = [], []
    for tipo in ("FPN", "FPA", "PIP"):
        isc += A.leggi_isc(os.path.join(a.cartella, A.FILE[("isc", tipo)]), tipo)
        rend += A.leggi_rendimenti(os.path.join(a.cartella, A.FILE[("rend", tipo)]), tipo)

    for spec in a.fondi:
        tipo, num = spec.split(":")
        print("=" * 100)
        print(f"{tipo} {num}")
        print("  DATASET:")
        for r in righe:
            if r["tipo"] == tipo and A.albo(r["N. Albo"]) == num:
                v = [r[c] for c in A.COL_RENDIMENTI]; i = [r[c] for c in A.COL_ISC]
                print(f"    {r['Linea/Comparto'][:46]:<46} rend={v} isc={i}")
        print("  ISC 2026:")
        for v in isc:
            if v["tipo"] == tipo and v["albo"] == num:
                print(f"    {v['nome'][:46]:<46} isc={v['valori']}")
        print("  RENDIMENTI 2025:")
        for v in rend:
            if v["tipo"] == tipo and v["albo"] == num:
                print(f"    {v['nome'][:46]:<46} rend={v['valori']}")


if __name__ == "__main__":
    main()
