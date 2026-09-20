# -*- coding: utf-8 -*-
"""
Aggiorna rendimenti e indicatore sintetico dei costi (ISC) del dataset dei comparti
a partire dai file Excel pubblicati dalla COVIP.

Uso (dalla radice della repo):

  python scripts/covip/aggiorna_da_covip.py --cartella "<cartella Dati Covip>" --solo-rapporto
  python scripts/covip/aggiorna_da_covip.py --cartella "<cartella Dati Covip>" --scrivi \
         --out data/database_comparti_AAAA-MM-GG.csv --rapporto docs/AGGIORNAMENTO_COVIP.md

Input:
  data/database_comparti_*.csv        dataset canonico, da cui si genera app/frontend/data/funds.ts
  6 file Excel COVIP                  ISC (FPN, FPA, PIP) e rendimenti (FPN, FPA, PIP)

Cosa fa: per ogni comparto del dataset cerca lo stesso comparto nei file COVIP e sostituisce
le nove colonne  Performance 1Y/3Y/5Y/10Y/20Y  e  ISC 2/5/10/35 Anni. Non tocca nient'altro.
Il rating dell'app non si aggiorna a mano: lo calcola utils/fundRating.ts da ISC e rendimenti.

ISC e rendimenti si abbinano separatamente: per alcuni fondi (SOLIDARIETA VENETO, FONDEMAIN,
FONDAEREO) il dataset tiene righe distinte, con costi su alcune e rendimenti su altre.

Livelli di abbinamento, dal piu al meno sicuro:
  1. nome identico (tipo, albo, nome normalizzato)
  2. nome identico dopo aver tolto i qualificatori ("ESG", "75%", "2020", "(GREEN)")
  3. per eliminazione: in quel fondo resta un solo comparto da abbinare per parte, con costi
     identici o rendimenti a lungo termine coerenti
Ogni abbinamento passa un controllo di continuita: rendimento a 20/10 anni e ISC a 35 anni non
cambiano di colpo in un anno. Cio che non passa non si aggiorna e finisce nel rapporto.
"""
import argparse, csv, html, os, re, sys, unicodedata
from collections import Counter, defaultdict
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leggi_xlsx import leggi_fogli

COL_RENDIMENTI = ["Performance 1Y", "Performance 3Y", "Performance 5Y", "Performance 10Y", "Performance 20Y"]
COL_ISC = ["ISC 2 Anni", "ISC 5 Anni", "ISC 10 Anni", "ISC 35 Anni"]

# posizione delle colonne nei file dei rendimenti (verificata sui file COVIP fine 2025)
RENDIMENTI = {
    "FPN": dict(albo=1, comparto=3, valori=6),
    "FPA": dict(albo=4, comparto=5, valori=8),
    "PIP": dict(albo=4, comparto=5, valori=9),
}
FILE = {
    ("isc", "FPN"): "COVIP  Interactive ISC FPN 2026.xlsx",
    ("isc", "FPA"): "COVIP  Interactive ISC FPA 2026.xlsx",
    ("isc", "PIP"): "COVIP  Interactive ISC PIP 2026.xlsx",
    ("rend", "FPN"): "FPN_Rendimenti_fine2025.xlsx",
    ("rend", "FPA"): "FPA_Rendimenti_fine2025.xlsx",
    ("rend", "PIP"): "PIP_Rendimenti_fine2025_0.xlsx",
}

# soglie del controllo di continuita, in punti percentuali
SOGLIA_REND_20Y, SOGLIA_REND_10Y = 0.6, 1.3
SOGLIA_ISC_35, SOGLIA_ISC_2 = 0.35, 0.60


def numero(v):
    """Numero a due decimali (come li pubblica la COVIP); None se assente o non numerico."""
    if v is None or v == "":
        return None
    if isinstance(v, str):
        v = v.strip().replace(",", ".")
        if not re.fullmatch(r"-?\d+(\.\d+)?", v):
            return None
    return round(float(v), 2)


def testo_numero(v):
    """Come il dataset scrive i numeri: '1.4', '5', '-0.2', '' se assente."""
    if v is None:
        return ""
    s = ("%.2f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def dal_dataset(s):
    s = (s or "").strip()
    if s == "":
        return None
    try:
        return round(float(s.replace(",", ".")), 2)
    except ValueError:
        return None


def albo(v):
    if v is None or v == "":
        return None
    try:
        return str(int(float(str(v).replace(",", "."))))
    except ValueError:
        return None


def norm(nome):
    """Nome confrontabile: senza codici HTML, accenti, apostrofi, punteggiatura; maiuscolo."""
    s = html.unescape(str(nome or ""))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).upper().strip()
    return re.sub(r"\s+", " ", s)


def norm_forte(nome):
    """Come norm, senza qualificatori che le fonti scrivono in modo diverso."""
    s = html.unescape(str(nome or ""))
    s = re.sub(r"\([^)]*\)", " ", s)              # (GREEN), (YELLOW)
    s = re.sub(r"\b\d+(?:[.,]\d+)?\s*%", " ", s)   # 75%
    s = re.sub(r"\b(19|20)\d\d\b", " ", s)         # 2020
    s = re.sub(r"\bESG\b", " ", s, flags=re.I)
    return norm(s)


def leggi_isc(percorso, tipo):
    righe = list(leggi_fogli(percorso).values())[0]
    intest = [str(c or "").strip() for c in righe[0]]
    ix = {n: intest.index(n) for n in ("N. Albo", "Comparto", "ISC a 2 anni", "ISC a 5 anni", "ISC a 10 anni", "ISC a 35 anni")}
    icat = intest.index("Categ. comparto") if "Categ. comparto" in intest else None
    out = []
    for r in righe[1:]:
        r = r + [None] * (len(intest) - len(r))
        a = albo(r[ix["N. Albo"]])
        if not a or not r[ix["Comparto"]]:
            continue
        out.append(dict(tipo=tipo, albo=a, nome=str(r[ix["Comparto"]]).strip(),
                        cat=str(r[icat]).strip() if icat is not None and r[icat] else "",
                        valori=[numero(r[ix[k]]) for k in ("ISC a 2 anni", "ISC a 5 anni", "ISC a 10 anni", "ISC a 35 anni")]))
    return out


def leggi_rendimenti(percorso, tipo):
    m = RENDIMENTI[tipo]
    righe = list(leggi_fogli(percorso).values())[0]
    out, albo_corrente = [], None
    for r in righe[5:]:
        r = r + [None] * 16
        if albo(r[m["albo"]]):
            albo_corrente = albo(r[m["albo"]])              # celle unite: l'albo compare solo sulla prima riga del fondo
        comparto = r[m["comparto"]]
        valori = [numero(r[m["valori"] + k]) for k in range(5)]
        if not albo_corrente or not comparto or all(v is None for v in valori):
            continue
        out.append(dict(tipo=tipo, albo=albo_corrente, nome=str(comparto).strip(), cat="", valori=valori))
    return out


def continuita(fonte, vecchi, nuovi):
    """
    None se i valori sono coerenti, altrimenti il motivo.

    Il rendimento medio a N anni cambia di circa (rendimento del nuovo anno - rendimento
    dell'anno uscito) / N: un 2025 eccezionale (+17%) sposta il decennale di oltre un punto
    senza che nulla sia sbagliato. Per questo la soglia cresce col rendimento dell'ultimo anno.
    """
    if fonte == "rend":
        ultimo = abs(nuovi[0]) if nuovi[0] is not None else 0.0
        for k, base, n, nome in ((4, SOGLIA_REND_20Y, 20, "20 anni"), (3, SOGLIA_REND_10Y, 10, "10 anni")):
            soglia = max(base, ultimo / n + 0.5)
            if vecchi[k] is not None and nuovi[k] is not None and abs(vecchi[k] - nuovi[k]) > soglia:
                return f"rendimento a {nome}: {vecchi[k]} -> {nuovi[k]}"
    else:
        for k, soglia, nome in ((3, SOGLIA_ISC_35, "35 anni"), (0, SOGLIA_ISC_2, "2 anni")):
            if vecchi[k] is not None and nuovi[k] is not None and abs(vecchi[k] - nuovi[k]) > soglia:
                return f"ISC a {nome}: {vecchi[k]} -> {nuovi[k]}"
    return None


def abbina(righe, voci, fonte, alias=None):
    """
    Abbina le righe del dataset alle voci di una fonte COVIP.
    Ritorna (abbinati, da_confermare, senza_dati) dove
      abbinati       {indice_riga: (voce, livello, nota)}   da applicare
      da_confermare  [(indice_riga, voce | None, motivo)]   da non applicare
    """
    colonne = COL_RENDIMENTI if fonte == "rend" else COL_ISC
    per_albo = defaultdict(list)
    for v in voci:
        per_albo[(v["tipo"], v["albo"])].append(v)

    abbinati, da_confermare = {}, []
    usate = set()
    righe_per_albo = defaultdict(list)
    for i, r in enumerate(righe):
        righe_per_albo[(r["tipo"], albo(r["N. Albo"]))].append(i)

    for chiave_albo, indici in righe_per_albo.items():
        candidate = per_albo.get(chiave_albo, [])
        libere_voci = list(range(len(candidate)))
        libere_righe = list(indici)

        def ha_dati(i):
            return any(righe[i][c] != "" for c in colonne)

        def prova(livello, f, chiave_riga=None, nota=""):
            """Abbina le righe libere alle voci libere con la stessa chiave, se unica da entrambe le parti."""
            nonlocal libere_voci, libere_righe
            chiave_riga = chiave_riga or (lambda i: f(righe[i]["Linea/Comparto"]))
            per_nome = defaultdict(list)
            for j in libere_voci:
                per_nome[f(candidate[j]["nome"])].append(j)
            per_chiave = defaultdict(list)
            for i in libere_righe:
                per_chiave[chiave_riga(i)].append(i)
            for k, gruppo in per_chiave.items():
                if not k or len(per_nome.get(k, [])) != 1:
                    continue
                # piu righe con lo stesso nome (una coi rendimenti, una coi costi): vale quella che ha dati per questa fonte
                scelte = gruppo if len(gruppo) == 1 else [i for i in gruppo if ha_dati(i)]
                if len(scelte) != 1:
                    continue
                i, j = scelte[0], per_nome[k][0]
                abbinati[i] = (candidate[j], livello, nota)
                libere_voci.remove(j); libere_righe.remove(i)

        prova(1, norm)
        if alias:
            prova(3, norm, chiave_riga=lambda i: alias.get(i), nota="stesso comparto abbinato nell'altra fonte")
        prova(2, norm_forte)

        # livello 3: per eliminazione, solo righe che oggi hanno dati per questa fonte
        residue = [i for i in libere_righe if any(righe[i][c] != "" for c in colonne)]
        if residue and libere_voci:
            if len(residue) == 1 and len(libere_voci) == 1:
                i, j = residue[0], libere_voci[0]
                vecchi = [dal_dataset(righe[i][c]) for c in colonne]
                nuovi = candidate[j]["valori"]
                uguali = fonte == "isc" and vecchi == nuovi
                motivo = continuita(fonte, vecchi, nuovi)
                if motivo:
                    da_confermare.append((i, candidate[j], f"unico comparto rimasto ma i dati non sono continui ({motivo})"))
                elif fonte == "isc" and not uguali:
                    da_confermare.append((i, candidate[j], "unico comparto rimasto ma i costi sono cambiati"))
                else:
                    abbinati[i] = (candidate[j], 3, "per eliminazione" + (", costi identici" if uguali else ""))
                libere_voci.remove(j); libere_righe.remove(i)
            else:
                # piu candidati: si abbinano solo le coppie con costi identici su tutti gli orizzonti, uniche da entrambe le parti
                if fonte == "isc":
                    for i in list(residue):
                        vecchi = [dal_dataset(righe[i][c]) for c in colonne]
                        u = [j for j in libere_voci if candidate[j]["valori"] == vecchi]
                        r_u = [k for k in residue if [dal_dataset(righe[k][c]) for c in colonne] == vecchi]
                        if len(u) == 1 and len(r_u) == 1:
                            abbinati[i] = (candidate[u[0]], 3, "costi identici a quelli dell'anno scorso")
                            libere_voci.remove(u[0]); libere_righe.remove(i)
                for i in libere_righe:
                    if any(righe[i][c] != "" for c in colonne):
                        da_confermare.append((i, None, "nessun comparto con questo nome nel file COVIP"))
        else:
            for i in libere_righe:
                if any(righe[i][c] != "" for c in colonne):
                    da_confermare.append((i, None, "nessun comparto con questo nome nel file COVIP"))

    # controllo di continuita anche sugli abbinamenti per nome
    finali = {}
    for i, (voce, livello, nota) in abbinati.items():
        vecchi = [dal_dataset(righe[i][c]) for c in colonne]
        motivo = continuita(fonte, vecchi, voce["valori"])
        if motivo and livello <= 2:
            da_confermare.append((i, voce, f"il nome coincide ma i dati non sono continui ({motivo})"))
        elif motivo:
            da_confermare.append((i, voce, f"dati non continui ({motivo})"))
        else:
            finali[i] = (voce, livello, nota)
    usate_voci = {id(v) for v, _, _ in finali.values()} | {id(v) for _, v, _ in da_confermare if v}
    nuovi_comparti = [v for v in voci if id(v) not in usate_voci]
    return finali, da_confermare, nuovi_comparti


def albi_con_nomi_scambiati(righe, finali):
    """
    Costi che corrispondono a quelli VECCHI di un altro comparto dello stesso fondo, e non ai propri:
    segno che i nomi si sono scambiati tra un anno e l'altro (caso TELEMACO). In quei fondi non si
    aggiorna nulla, ne costi ne rendimenti, finche qualcuno non conferma l'abbinamento.
    """
    per_albo = defaultdict(list)
    for i, r in enumerate(righe):
        per_albo[(r["tipo"], albo(r["N. Albo"]))].append(i)
    sospetti = {}
    for i, (voce, livello, nota) in finali.items():
        vecchi = [dal_dataset(righe[i][c]) for c in COL_ISC]
        if None in vecchi or voce["valori"] == vecchi:
            continue
        # spostamenti di un centesimo o due sono normali (FONCHIM: CRESCITA e STABILITA differiscono di 0.01)
        if max(abs(a - b) for a, b in zip(voce["valori"], vecchi) if a is not None) <= 0.05:
            continue
        for j in per_albo[(righe[i]["tipo"], albo(righe[i]["N. Albo"]))]:
            if j != i and [dal_dataset(righe[j][c]) for c in COL_ISC] == voce["valori"]:
                sospetti[(righe[i]["tipo"], albo(righe[i]["N. Albo"]))] = (
                    f"i costi 2026 di '{righe[i]['Linea/Comparto']}' sono identici ai costi 2025 di '{righe[j]['Linea/Comparto']}', non ai suoi")
    return sospetti


def cambiamenti(righe, finali, fonte):
    colonne = COL_RENDIMENTI if fonte == "rend" else COL_ISC
    out = []
    for i, (voce, livello, nota) in finali.items():
        for c, nuovo in zip(colonne, voce["valori"]):
            out.append((i, c, righe[i][c], testo_numero(nuovo)))
    return out


def principale():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cartella", required=True)
    ap.add_argument("--csv", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--rapporto", default=None)
    ap.add_argument("--solo-rapporto", action="store_true")
    ap.add_argument("--scrivi", action="store_true")
    a = ap.parse_args()

    radice = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    csv_in = a.csv or next(os.path.join(radice, "data", f) for f in sorted(os.listdir(os.path.join(radice, "data")))
                            if f.startswith("database_comparti_"))
    with open(csv_in, encoding="utf-8-sig", newline="") as f:
        lettore = csv.DictReader(f)
        intestazioni = lettore.fieldnames
        righe = list(lettore)

    voci_isc, voci_rend = [], []
    for tipo in ("FPN", "FPA", "PIP"):
        voci_isc += leggi_isc(os.path.join(a.cartella, FILE[("isc", tipo)]), tipo)
        voci_rend += leggi_rendimenti(os.path.join(a.cartella, FILE[("rend", tipo)]), tipo)

    risultati = {}
    risultati["isc"] = abbina(righe, voci_isc, "isc")
    alias = {i: norm(v["nome"]) for i, (v, livello, _) in risultati["isc"][0].items()}
    risultati["rend"] = abbina(righe, voci_rend, "rend", alias=alias)

    # fondi in cui i nomi sembrano scambiati: si lasciano com'erano, per entrambe le fonti
    scambiati = albi_con_nomi_scambiati(righe, risultati["isc"][0])
    for fonte in ("isc", "rend"):
        finali, dubbi, nuovi = risultati[fonte]
        for i in [i for i in finali if (righe[i]["tipo"], albo(righe[i]["N. Albo"])) in scambiati]:
            voce, livello, nota = finali.pop(i)
            dubbi.append((i, voce, "possibile scambio di nomi in questo fondo: " + scambiati[(righe[i]["tipo"], albo(righe[i]["N. Albo"]))]))

    print(f"Dataset: {os.path.basename(csv_in)}  ({len(righe)} comparti)")
    print(f"COVIP: {len(voci_isc)} comparti con ISC 2026, {len(voci_rend)} con rendimenti 2025")
    for fonte, nome in (("isc", "ISC"), ("rend", "Rendimenti")):
        finali, dubbi, nuovi = risultati[fonte]
        livelli = Counter(l for _, l, _ in finali.values())
        colonne = COL_ISC if fonte == "isc" else COL_RENDIMENTI
        con_dati = sum(1 for r in righe if any(r[c] != "" for c in colonne))
        print(f"\n{nome}: righe del dataset con dati {con_dati}")
        print(f"  aggiornate: {len(finali)}  (per nome {livelli[1]}, per nome senza qualificatori {livelli[2]}, per eliminazione {livelli[3]})")
        print(f"  da confermare (non toccate): {len(dubbi)}")
        print(f"  comparti COVIP non presenti nel dataset: {len(nuovi)}")

    if a.rapporto:
        L = ["# Aggiornamento rendimenti e costi da file COVIP", "",
             f"Dataset di partenza: `{os.path.basename(csv_in)}` ({len(righe)} comparti). "
             f"Fonti: ISC 2026 ({len(voci_isc)} comparti) e rendimenti 2025 ({len(voci_rend)} comparti).", ""]
        for fonte, nome in (("isc", "Costi (ISC)"), ("rend", "Rendimenti")):
            finali, dubbi, nuovi = risultati[fonte]
            L += [f"## {nome}", "", f"- aggiornati: **{len(finali)}** comparti",
                  f"- lasciati com'erano, da confermare: **{len(dubbi)}**",
                  f"- presenti nei file COVIP ma non nel dataset: **{len(nuovi)}**", ""]
            if dubbi:
                L += ["### Da confermare (non toccati)", "", "| Fondo | Comparto | Motivo | Dato COVIP |", "|---|---|---|---|"]
                for i, voce, motivo in dubbi:
                    r = righe[i]
                    L.append(f"| {r['tipo']} {r['N. Albo']} {r['Fondo Pensione'][:30]} | {r['Linea/Comparto']} | {motivo} | "
                             + (f"{voce['nome']} {voce['valori']}" if voce else "-") + " |")
                L.append("")
            if nuovi:
                L += ["### Comparti COVIP non presenti nel dataset", "", "| Tipo | Albo | Comparto | Valori COVIP |", "|---|---|---|---|"]
                for v in sorted(nuovi, key=lambda x: (x["tipo"], int(x["albo"]))):
                    L.append(f"| {v['tipo']} | {v['albo']} | {v['nome']} | {v['valori']} |")
                L.append("")
            regola = [(i, v, l, n) for i, (v, l, n) in sorted(finali.items()) if l > 1]
            if regola:
                L += ["### Abbinati senza nome identico (da controllare a campione)", "", "| Fondo | Comparto nel dataset | Comparto COVIP | Regola |", "|---|---|---|---|"]
                for i, v, l, n in regola:
                    r = righe[i]
                    L.append(f"| {r['tipo']} {r['N. Albo']} | {r['Linea/Comparto']} | {v['nome']} | livello {l} {n} |")
                L.append("")
        with open(a.rapporto, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(L))
        print(f"Rapporto scritto in {a.rapporto}")

    if a.solo_rapporto and not a.scrivi:
        for fonte, nome in (("isc", "ISC"), ("rend", "Rendimenti")):
            finali, dubbi, nuovi = risultati[fonte]
            print(f"\n=== {nome}: DA CONFERMARE ===")
            for i, voce, motivo in dubbi:
                r = righe[i]
                print(f"  {r['tipo']} {r['N. Albo']:>5} {r['Fondo Pensione'][:26]:<26} | {r['Linea/Comparto'][:34]:<34} | {motivo}"
                      + (f" | COVIP: '{voce['nome']}' {voce['valori']}" if voce else ""))
            print(f"\n=== {nome}: COMPARTI COVIP NON NEL DATASET ===")
            for v in sorted(nuovi, key=lambda x: (x["tipo"], int(x["albo"]))):
                print(f"  {v['tipo']} {v['albo']:>5} | {v['nome'][:50]} {v['valori']}")
            print(f"\n=== {nome}: ABBINATI CON REGOLA NON ESATTA ===")
            for i, (voce, livello, nota) in sorted(finali.items()):
                if livello > 1:
                    r = righe[i]
                    print(f"  L{livello} {r['tipo']} {r['N. Albo']:>5} | dataset '{r['Linea/Comparto'][:34]}' <- COVIP '{voce['nome'][:34]}' {nota}")
        return

    if a.scrivi:
        for fonte in ("isc", "rend"):
            finali, _, _ = risultati[fonte]
            for i, c, vecchio, nuovo in cambiamenti(righe, finali, fonte):
                righe[i][c] = nuovo
        out = a.out or csv_in
        with open(out, "w", encoding="utf-8", newline="") as f:
            # stesso stile del file di partenza: intestazione senza virgolette, valori tutti tra virgolette
            f.write(",".join(intestazioni) + "\n")
            w = csv.DictWriter(f, fieldnames=intestazioni, lineterminator="\n", quoting=csv.QUOTE_ALL)
            w.writerows(righe)
        print(f"\nScritto {out}")


if __name__ == "__main__":
    principale()
