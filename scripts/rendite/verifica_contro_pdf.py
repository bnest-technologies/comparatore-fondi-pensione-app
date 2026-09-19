# -*- coding: utf-8 -*-
"""
Verifica ogni valore del database contro il testo del PDF di origine.

Uso:  python verifica_contro_pdf.py <database.json> <cartella_pdf> [uscita.json]

Per ogni fondo estrae il testo del PDF (pdftotext -table) e controlla che ogni
coefficiente compaia davvero, come numero stampato. Un valore assente e un
candidato errore di trascrizione. I PDF senza testo (scansioni) vengono
segnalati a parte: per loro il controllo non e possibile.
"""
import json, os, re, subprocess, sys, tempfile, shutil
from collections import defaultdict

NUM = re.compile(r"(?<![\d.,])\d{1,3}(?:\.\d{3})*,\d+|(?<![\d.,])\d+,\d+|(?<![\d.,])\d+\.\d+")


def numeri_nel_testo(testo):
    visti = set()
    for s in NUM.findall(testo):
        if "," in s:
            v = s.replace(".", "").replace(",", ".")
        else:
            v = s
        try:
            f = float(v)
        except ValueError:
            continue
        visti.add(round(f, 6))
        # "1.019" puo essere mille e diciannove o uno virgola zero diciannove
        if "," not in s:
            visti.add(round(float(s.replace(".", "")), 6))
    return visti


def testo_pdf(percorso):
    # copia con nome semplice: pdftotext non gradisce apostrofi e accenti nel nome
    tmp = tempfile.mkdtemp()
    try:
        dst = os.path.join(tmp, "doc.pdf")
        # prefisso per i percorsi oltre i 260 caratteri di Windows
        src = os.path.abspath(percorso)
        if os.name == "nt" and not src.startswith("\\\\?\\"):
            src = "\\\\?\\" + src
        shutil.copyfile(src, dst)
        r = subprocess.run(["pdftotext", "-table", dst, "-"], capture_output=True)
        return r.stdout.decode("latin-1", "replace")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def tabelle(fondo):
    for c in fondo.get("convenzioni", []):
        for s in c.get("set", []):
            for t in s.get("tabelle", []):
                yield t


def main():
    db, cartella = sys.argv[1], sys.argv[2]
    uscita = sys.argv[3] if len(sys.argv) > 3 else None
    fondi = json.load(open(db, encoding="utf-8"))["fondi"]
    pdf = {}
    for f in os.listdir(cartella):
        m = re.match(r"^0*(\d+)[-_ ]", f)
        if m and f.lower().endswith(".pdf"):
            pdf.setdefault(m.group(1), os.path.join(cartella, f))

    report, righe_tot = {}, [0, 0]
    print(f"{'albo':>6} {'valori':>7} {'assenti':>7}  esito")
    for albo in sorted(fondi, key=lambda a: int(a) if a.isdigit() else 0):
        valori = [(t.get("id_tabella"), r[0], col, v)
                  for t in tabelle(fondi[albo])
                  for r in (t.get("righe") or []) if isinstance(r, list)
                  for col, v in zip(t.get("colonne") or [], r[1:]) if isinstance(v, (int, float))]
        if not valori:
            continue
        if albo not in pdf:
            print(f"{albo:>6} {len(valori):>7} {'-':>7}  PDF non trovato")
            report[albo] = {"esito": "pdf_non_trovato"}
            continue
        testo = testo_pdf(pdf[albo])
        visti = numeri_nel_testo(testo)
        if len(visti) < 50:
            print(f"{albo:>6} {len(valori):>7} {'-':>7}  PDF senza testo (scansione): non verificabile")
            report[albo] = {"esito": "scansione", "valori": len(valori)}
            continue
        assenti = [x for x in valori if round(x[3], 6) not in visti]
        righe_tot[0] += len(valori); righe_tot[1] += len(assenti)
        esito = "ok" if not assenti else ("DA CONTROLLARE" if len(assenti) / len(valori) > 0.02 else "poche celle")
        print(f"{albo:>6} {len(valori):>7} {len(assenti):>7}  {esito}")
        report[albo] = {"esito": esito, "valori": len(valori), "assenti": assenti}
    print(f"\nverificati {righe_tot[0]} valori, assenti dal PDF {righe_tot[1]} "
          f"({100 * righe_tot[1] / max(righe_tot[0], 1):.2f}%)")
    if uscita:
        json.dump(report, open(uscita, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
