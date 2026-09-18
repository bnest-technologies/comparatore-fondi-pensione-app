"""
Unisce le estrazioni in un unico database cumulativo, senza perdere i fondi
gia acquisiti.

Uso:  python unisci_database.py <cumulativo.json> <nuova_estrazione.json> [altre...]

Il primo file e il database cumulativo: viene aggiornato con i fondi contenuti
negli altri. Se un fondo e presente in piu file vince l'ultimo, ma la versione
precedente viene salvata in una cartella "storico" prima di essere sostituita,
cosi nulla va perso davvero.
"""
import sys, os, json, shutil, datetime


def carica(path):
    if not os.path.exists(path):
        return {"manifest": {}, "fondi": {}}
    d = json.load(open(path, encoding="utf-8"))
    if "fondi" not in d:
        # file con un solo fondo, senza involucro
        albo = str(d.get("id_fondo", "?"))
        return {"manifest": {}, "fondi": {albo: d}}
    return d


def conta(fondo):
    n = 0
    for c in fondo.get("convenzioni", []):
        for s in (c.get("set") or c.get("set_coefficienti") or []):
            for t in s.get("tabelle", []):
                righe = t.get("righe") or t.get("coefficienti") or []
                cols = len(t.get("colonne") or []) or 1
                n += len(righe) * cols
    return n


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    dest, nuovi = sys.argv[1], sys.argv[2:]

    cum = carica(dest)
    fondi = cum.setdefault("fondi", {})
    storico = os.path.join(os.path.dirname(dest) or ".", "storico")

    aggiunti, sostituiti, invariati = [], [], []

    for path in nuovi:
        d = carica(path)
        for albo, fondo in d.get("fondi", {}).items():
            n_nuovo = conta(fondo)
            if albo not in fondi:
                fondi[albo] = fondo
                aggiunti.append((albo, n_nuovo))
                continue

            n_vecchio = conta(fondi[albo])
            if json.dumps(fondi[albo], sort_keys=True) == json.dumps(fondo, sort_keys=True):
                invariati.append(albo)
                continue

            # prima di sostituire, conserva la versione precedente
            os.makedirs(storico, exist_ok=True)
            stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            with open(os.path.join(storico, f"{albo}_{stamp}.json"), "w", encoding="utf-8") as f:
                json.dump(fondi[albo], f, ensure_ascii=False, indent=1)
            fondi[albo] = fondo
            sostituiti.append((albo, n_vecchio, n_nuovo))

    cum["manifest"] = {
        "fondi_presenti": len(fondi),
        "valori_totali": sum(conta(f) for f in fondi.values()),
        "ultimo_aggiornamento": datetime.datetime.now().isoformat(timespec="seconds"),
    }

    if os.path.exists(dest):
        shutil.copy2(dest, dest + ".bak")
    json.dump(cum, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"database cumulativo: {dest}")
    print(f"   fondi presenti : {len(fondi)}")
    print(f"   valori totali  : {cum['manifest']['valori_totali']}")
    print()
    if aggiunti:
        print(f"AGGIUNTI ({len(aggiunti)}):")
        for a, n in sorted(aggiunti, key=lambda x: int(x[0]) if x[0].isdigit() else 0):
            print(f"   albo {a:>5}  {n} valori")
    if sostituiti:
        print(f"SOSTITUITI ({len(sostituiti)}) - la versione precedente e in 'storico/':")
        for a, v, n in sostituiti:
            segno = "+" if n >= v else ""
            print(f"   albo {a:>5}  {v} -> {n} valori ({segno}{n-v})")
    if invariati:
        print(f"INVARIATI ({len(invariati)}): {', '.join(invariati)}")

    if sostituiti:
        cali = [x for x in sostituiti if x[2] < x[1] * 0.9]
        if cali:
            print()
            print("ATTENZIONE: per questi fondi la nuova estrazione contiene meno dati della precedente.")
            for a, v, n in cali:
                print(f"   albo {a}: da {v} a {n} valori. Verificare prima di tenere la nuova versione.")


if __name__ == "__main__":
    main()
