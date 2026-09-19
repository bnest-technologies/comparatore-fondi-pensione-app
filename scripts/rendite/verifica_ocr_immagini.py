# -*- coding: utf-8 -*-
"""
Verifica OCR ad alta definizione: legge le immagini originali incorporate nel PDF,
ingrandite, invece della pagina renderizzata. Serve per le tabelle incollate come
immagini piccole (FONTE, 123: circa 800x400 pixel per una tabella intera), che a
risoluzione di pagina l'OCR legge male.

Uso:  python verifica_ocr_immagini.py <database.json> <cartella_pdf> <albo> [fattore=3]

Scrive verifica_ocr/<albo>_hd.json con le celle non confermate.
"""
import io, json, os, re, sys
import pymupdf
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

NUM = re.compile(r"\d+,\d+")


def main():
    db, cartella, albo = sys.argv[1], sys.argv[2], sys.argv[3]
    fattore = int(sys.argv[4]) if len(sys.argv) > 4 else 3
    fondo = json.load(open(db, encoding="utf-8"))["fondi"][albo]
    nome = next(f for f in os.listdir(cartella) if re.match(rf"^0*{albo}[-_ ]", f))
    src = os.path.abspath(os.path.join(cartella, nome))
    doc = pymupdf.open("\\\\?\\" + src if os.name == "nt" else src)
    ocr = RapidOCR()
    visti = set()
    for pagina in doc:
        if len(NUM.findall(pagina.get_text())) >= 30:
            continue
        for img in pagina.get_images():
            pix = pymupdf.Pixmap(doc, img[0])
            if pix.width < 300 or pix.height < 150:
                continue                                   # loghi e firme
            if pix.n > 3 or pix.alpha:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            if im.width < 1500:
                im = im.resize((im.width * fattore, im.height * fattore), Image.LANCZOS)
            buf = io.BytesIO(); im.save(buf, "PNG")
            risultato, _ = ocr(buf.getvalue())
            for _, testo, _ in (risultato or []):
                for s in NUM.findall(testo.replace(" ", "")):
                    visti.add(round(float(s.replace(",", ".")), 6))
    assenti = [(t["id_tabella"], r[0], col, v)
               for c in fondo["convenzioni"] for s in c["set"] for t in s["tabelle"]
               for r in t["righe"] for col, v in zip(t["colonne"], r[1:]) if round(v, 6) not in visti]
    tot = sum(len(t["righe"]) * len(t["colonne"]) for c in fondo["convenzioni"] for s in c["set"] for t in s["tabelle"])
    print(f"{albo}: valori {tot}, non confermati {len(assenti)} ({100 * (tot - len(assenti)) / tot:.1f}% confermato)")
    out = os.path.join(os.path.dirname(os.path.abspath(db)), "verifica_ocr", f"{albo}_hd.json")
    json.dump({"valori": tot, "assenti": assenti}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
