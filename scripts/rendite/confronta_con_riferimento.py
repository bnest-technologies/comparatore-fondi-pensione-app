"""
Confronta l'estrazione automatica con il riferimento trascritto a mano.

Uso:  python confronta_con_riferimento.py <riferimento.json> <estrazione.json>

Le tabelle vengono appaiate per contenuto (tipologia, durata, percentuale di
reversibilita, sesso, tasso tecnico), non per id: gli identificativi generati
dal modello non devono coincidere con i nostri.
Il confronto e fatto sul coefficiente normalizzato per mille, cosi una scala
dichiarata diversamente ma coerente non viene segnalata come errore.
"""
import sys, json, collections


def per_mille(v, scala):
    if v is None or not scala:
        return None
    return round(v * 1000.0 / scala, 6)


def raccogli_set(doc):
    """I set possono stare dentro le convenzioni oppure, in alcuni output, a livello di fondo."""
    sets = []
    for conv in doc.get("convenzioni", []):
        sets += conv.get("set") or conv.get("set_coefficienti") or []
    sets += doc.get("set") or doc.get("set_coefficienti") or []
    return sets


def indicizza(doc):
    """(chiave tabella) -> {(eta, colonna): valore_per_mille}"""
    out = {}
    meta = {}
    if True:
        sets = raccogli_set(doc)
        for s in sets:
            for t in s.get("tabelle", []):
                k = (
                    t.get("tipologia"),
                    t.get("durata_certa_anni"),
                    t.get("perc_reversibilita"),
                    t.get("sesso"),
                    t.get("tasso_tecnico"),
                )
                scala = t.get("scala_originale")
                celle = {}

                # formato a matrice: colonne + righe come liste [eta, v1, v2, ...]
                cols = t.get("colonne")
                if cols:
                    for r in t.get("righe") or []:
                        if not isinstance(r, list) or len(r) != len(cols) + 1:
                            continue
                        for i, c in enumerate(cols):
                            if isinstance(r[i + 1], (int, float)):
                                celle[(r[0], str(c))] = per_mille(r[i + 1], scala)

                # formato a righe-oggetto: [{eta, valori|coefficienti: {freq: v}}]
                for r in t.get("righe") or []:
                    if not isinstance(r, dict):
                        continue
                    eta = r.get("eta")
                    valori = r.get("valori") or r.get("coefficienti") or {}
                    if isinstance(valori, dict):
                        for freq, v in valori.items():
                            if isinstance(v, (int, float)):
                                celle[(eta, str(freq))] = per_mille(v, scala)
                # formato alternativo: [{eta, valori:{freq: v}}] oppure [{eta, coefficienti:{freq: v}}]
                for c in t.get("coefficienti") or []:
                    if not isinstance(c, dict):
                        continue
                    eta = c.get("eta")
                    valori = c.get("valori") or c.get("coefficienti") or {}
                    if isinstance(valori, dict):
                        for freq, v in valori.items():
                            if isinstance(v, (int, float)):
                                celle[(eta, str(freq))] = per_mille(v, scala)

                if k in out:
                    out[k].update(celle)
                else:
                    out[k] = celle
                    meta[k] = {"scala": scala, "id": t.get("id_tabella")}
    return out, meta


def descrivi(k):
    tip, dur, rev, sex, tt = k
    s = str(tip)
    if dur: s += f" {dur} anni"
    if rev: s += f" rev {rev}%"
    return f"{s} | sesso {sex} | tt {tt}"


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    rif = json.load(open(sys.argv[1], encoding="utf-8"))
    est = json.load(open(sys.argv[2], encoding="utf-8"))

    # l'estrazione puo essere un file per fondo o un database con piu fondi
    if "fondi" in est:
        fid = str(rif.get("id_fondo"))
        if fid not in est["fondi"]:
            print(f"ESITO: il fondo {fid} non e presente nell'estrazione"); sys.exit(1)
        est = est["fondi"][fid]

    A, metaA = indicizza(rif)
    B, metaB = indicizza(est)

    print(f"riferimento : {len(A)} tabelle, {sum(len(v) for v in A.values())} valori")
    print(f"estrazione  : {len(B)} tabelle, {sum(len(v) for v in B.values())} valori")
    print()

    mancanti = [k for k in A if k not in B]
    in_piu = [k for k in B if k not in A]

    if mancanti:
        print(f"--- TABELLE NON ESTRATTE ({len(mancanti)}) ---")
        for k in mancanti:
            print(f"   {descrivi(k)}")
        print()
    if in_piu:
        print(f"--- TABELLE NON PREVISTE DAL RIFERIMENTO ({len(in_piu)}) ---")
        for k in in_piu:
            print(f"   {descrivi(k)}")
        print()

    tot = uguali = diversi = assenti = 0
    peggiori = []
    per_tabella = collections.Counter()

    for k, celle in A.items():
        if k not in B:
            tot += len(celle); assenti += len(celle); per_tabella[k] += len(celle)
            continue
        for cella, atteso in celle.items():
            tot += 1
            ott = B[k].get(cella)
            if ott is None:
                assenti += 1; per_tabella[k] += 1
            elif abs(ott - atteso) <= max(1e-6, abs(atteso) * 1e-6):
                uguali += 1
            else:
                diversi += 1; per_tabella[k] += 1
                scarto = abs(ott - atteso) / atteso * 100 if atteso else 999
                peggiori.append((scarto, k, cella, atteso, ott))

    print("=== ESITO DEL CONFRONTO ===")
    print(f"   valori attesi      : {tot}")
    print(f"   corretti           : {uguali}  ({uguali/tot*100:.1f}%)" if tot else "")
    print(f"   errati             : {diversi}")
    print(f"   mancanti           : {assenti}")
    print()

    if peggiori:
        peggiori.sort(reverse=True)
        print("--- SCOSTAMENTI MAGGIORI ---")
        for sc, k, cella, a, o in peggiori[:15]:
            print(f"   {descrivi(k)} | eta {cella[0]} {cella[1]}: atteso {a}, ottenuto {o}  ({sc:.1f}%)")
        print()
        # un rapporto costante segnala un errore sistematico, non refusi sparsi
        rapporti = [round(o / a, 4) for _, _, _, a, o in peggiori if a]
        comuni = collections.Counter(rapporti).most_common(3)
        if comuni and comuni[0][1] > 3:
            print("--- POSSIBILE ERRORE SISTEMATICO ---")
            for rap, n in comuni:
                if n > 3:
                    ipotesi = ""
                    if abs(rap - 1/12) < 0.01: ipotesi = " (sembra una rata mensile letta come annua)"
                    elif abs(rap - 12) < 0.5: ipotesi = " (sembra una rendita annua letta come rata)"
                    elif abs(rap - 10) < 0.2 or abs(rap - 0.1) < 0.02: ipotesi = " (sembra una scala sbagliata di un fattore 10)"
                    elif rap > 100 or rap < 0.01: ipotesi = " (sembra il premio unico invece del coefficiente)"
                    print(f"   {n} valori con rapporto ottenuto/atteso = {rap}{ipotesi}")
            print()

    if per_tabella:
        print("--- TABELLE CON PIU PROBLEMI ---")
        for k, n in per_tabella.most_common(8):
            print(f"   {n:4} valori errati o mancanti  ->  {descrivi(k)}")
        print()

    esito = "SUPERATO" if (tot and uguali / tot >= 0.999 and not mancanti) else "NON SUPERATO"
    print(f"ESITO: {esito}")
    if esito == "NON SUPERATO":
        print("Non lanciare l'estrazione sugli altri documenti: prima va corretto il prompt.")


if __name__ == "__main__":
    main()
