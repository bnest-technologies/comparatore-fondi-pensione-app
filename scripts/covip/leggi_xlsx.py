# -*- coding: utf-8 -*-
"""
Lettore minimo di file .xlsx che ignora gli stili.

Serve perche alcuni file COVIP (per esempio ISC FPN 2026) hanno un foglio di stile
che fa fallire openpyxl, mentre i dati sono integri. Qui si legge solo il contenuto:
stringhe condivise e celle del foglio.

    from leggi_xlsx import leggi_fogli
    fogli = leggi_fogli("file.xlsx")        # {nome_foglio: [[cella, ...], ...]}
"""
import re, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def _colonna(rif):
    """'AB12' -> indice di colonna 27 (base 0)."""
    lettere = re.match(r"[A-Z]+", rif).group(0)
    n = 0
    for ch in lettere:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def leggi_fogli(percorso):
    z = zipfile.ZipFile(percorso)
    condivise = []
    if "xl/sharedStrings.xml" in z.namelist():
        radice = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in radice.findall("m:si", NS):
            condivise.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))

    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rel = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    dest = {r.get("Id"): r.get("Target") for r in rel}
    fogli = {}
    for s in wb.find("m:sheets", NS):
        nome = s.get("name")
        target = dest[s.get("{%s}id" % NS["r"])]
        target = target.lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        foglio = ET.fromstring(z.read(target))
        righe = []
        for riga in foglio.iter("{%s}row" % NS["m"]):
            cur = []
            for c in riga.findall("m:c", NS):
                i = _colonna(c.get("r"))
                cur.extend([None] * (i - len(cur)))
                tipo = c.get("t")
                v = c.find("m:v", NS)
                if tipo == "s" and v is not None:
                    val = condivise[int(v.text)]
                elif tipo == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter("{%s}t" % NS["m"]))
                elif v is not None and v.text is not None:
                    try:
                        val = float(v.text)
                    except ValueError:
                        val = v.text
                else:
                    val = None
                cur.append(val)
            righe.append(cur)
        fogli[nome] = righe
    return fogli


if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        print("=" * 90)
        print(p)
        for nome, righe in leggi_fogli(p).items():
            print(f"  foglio '{nome}': {len(righe)} righe")
            for i, r in enumerate(righe[:5], 1):
                print(f"    r{i}: {[str(c)[:20] for c in r if c is not None][:14]}")
