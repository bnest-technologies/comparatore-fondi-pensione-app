# -*- coding: utf-8 -*-
"""
Verifica con OCR i fondi le cui tabelle sono immagini (scansioni o allegati incollati).

Uso:  python verifica_ocr.py <database.json> <cartella_pdf> <albo> [albo...]

Per ogni pagina senza testo, o con poco testo, legge i numeri con OCR (rapidocr) e
controlla che ogni coefficiente del fondo compaia. L'OCR sbaglia qualche cifra,
quindi un valore assente non e per forza un errore: e un candidato da guardare a
occhio. Un valore trovato, invece, e una conferma forte (servirebbe lo stesso
errore di lettura di Gemini e dell'OCR sulla stessa cella).

Richiede:  pip install rapidocr_onnxruntime pymupdf
"""
import json, os, re, sys
import pymupdf
from rapidocr_onnxruntime import RapidOCR

NUM = re.compile(r"\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+|\d+\.\d+")


def numeri(testo):
    visti = set()
    for s in NUM.findall(testo):
        v = s.replace(".", "").replace(",", ".") if "," in s else s
        try:
            visti.add(round(float(v), 6))
        except ValueError:
            pass
    return visti


def leggi_pdf(percorso, ocr, dpi=110):
    src = os.path.abspath(percorso)
    if os.name == "nt":
        src = "\\\\?\\" + src
    doc = pymupdf.open(src)
    visti = set()
    for pagina in doc:
        testo = pagina.get_text()
        visti |= numeri(testo)
        # serve l'OCR se la pagina contiene immagini e pochi numeri come testo
        # (scansioni, ma anche tabelle incollate come immagine in un documento testuale)
        if pagina.get_images() and len(NUM.findall(testo)) < 30:
            pix = pagina.get_pixmap(dpi=dpi)
            risultato, _ = ocr(pix.tobytes("png"))
            for _, parola, _ in (risultato or []):
                visti |= numeri(parola.replace(" ", ""))
    return visti


def main():
    db, cartella, albi = sys.argv[1], sys.argv[2], sys.argv[3:]
    fondi = json.load(open(db, encoding="utf-8"))["fondi"]
    pdf = {}
    for f in os.listdir(cartella):
        m = re.match(r"^0*(\d+)[-_ ]", f)
        if m and f.lower().endswith(".pdf"):
            pdf.setdefault(m.group(1), os.path.join(cartella, f))
    ocr = RapidOCR()
    report = {}
    for albo in albi:
        valori = [(t.get("id_tabella"), r[0], col, v)
                  for c in fondi[albo].get("convenzioni", []) for s in c.get("set", [])
                  for t in s.get("tabelle", [])
                  for r in (t.get("righe") or []) if isinstance(r, list)
                  for col, v in zip(t.get("colonne") or [], r[1:]) if isinstance(v, (int, float))]
        visti = leggi_pdf(pdf[albo], ocr)
        assenti = [x for x in valori if round(x[3], 6) not in visti]
        print(f"{albo:>6}  valori {len(valori):>5}  confermati {len(valori) - len(assenti):>5}  "
              f"da guardare {len(assenti):>4}  ({100 * (len(valori) - len(assenti)) / max(len(valori), 1):.1f}% confermato)",
              flush=True)
        report[albo] = {"valori": len(valori), "assenti": assenti}
        # un file per fondo: si possono lanciare piu processi in parallelo
        cartella_out = os.path.join(os.path.dirname(os.path.abspath(db)), "verifica_ocr")
        os.makedirs(cartella_out, exist_ok=True)
        json.dump(report[albo], open(os.path.join(cartella_out, f"{albo}.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
