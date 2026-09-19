# -*- coding: utf-8 -*-
"""
Correzioni di singole celle, verificate a mano sul PDF di origine.

Uso:  python correzioni_puntuali.py <database.json>

Ogni correzione dichiara il valore atteso prima della modifica: se il database
contiene altro (per esempio perche l'estrazione e stata rifatta) la correzione
non viene applicata e lo script lo segnala, invece di sovrascrivere alla cieca.
"""
import json, sys

# (albo, id_tabella, eta, colonna, valore_errato, valore_corretto, fonte)
CORREZIONI = [
    ("77", "tab_all12_m", 61, "mensile", 296366, 29.6366,
     "Refuso nel PDF (Allegato XII): stampato '296366' senza virgola. Il valore sta fra 30,5761 (60 anni) e 28,7037 (62)."),
    ("99", "tab_certa_5_m_1perc", 50, "mensile", 0.03153, 0.033153,
     "Il PDF stampa 0,033153: nell'estrazione era caduta una cifra."),

    # Fondi scansionati: celle non confermate dall'OCR e diverse dalla stessa tavola
    # pubblicata in forma testuale da un fondo con la stessa convenzione.
    ("148", "tab_vitalizia_immediata_m_1perc", 50, "trimestrale", 0.032657, 0.0332657,
     "Cifra caduta nella lettura della scansione. La stessa tavola, testuale nel PDF di FOPEN (99), riporta 0,0332657."),
    ("127", "tab_opz_c_m", 65, "annuale", 40.48306, 40.48906,
     "Letto a occhio sulla scansione (Opzione C, maschi): 40,48906, come nella stessa tavola testuale di 88."),
    ("127", "tab_opz_c_m", 66, "annuale", 41.93271, 41.95271,
     "Letto a occhio sulla scansione (Opzione C, maschi): 41,95271, come nella stessa tavola testuale di 88."),
    ("127", "tab_opz_c_m", 67, "annuale", 43.46756, 43.50756,
     "Letto a occhio sulla scansione (Opzione C, maschi): 43,50756, come nella stessa tavola testuale di 88."),
    ("100", "OPZ_E_F_2025", 57, "mensile", 25.01137, 25.01131,
     "Non confermato dall'OCR; la stessa tavola (convenzione Unipol 2025) riporta 25,01131 in 88, 89, 103, 116, 124, 127, 170."),
    ("164", "tab_opzA_maschile", 64, "trimestrale", 38.94226, 38.94228,
     "Letto a occhio sulla scansione (Opzione A, pag. 22): 38,94228, come in 139."),
    ("164", "tab_opzA_maschile", 79, "trimestrale", 77.2322, 77.2332,
     "Letto a occhio sulla scansione (Opzione A, pag. 22): 77,23320, come in 139."),
    ("164", "tab_opzE_femminile", 71, "semestrale", 35.95612, 35.96612,
     "Letto a occhio sulla scansione (Opzione E, pag. 30): 35,96612, come in 139."),
    ("122", "TAB_71A0_M_00", 69, "trimestrale", 0.033628, 0.033828,
     "Letto a occhio sulla scansione (Allegato 4B, 10 di 10): 0,033828."),
    ("122", "TAB_71A0_F_00", 64, "trimestrale", 0.027698, 0.027898,
     "0,027698 sarebbe inferiore alla bimestrale (0,027754), impossibile per un coefficiente; la stessa tavola nel fondo 2 riporta 0,027898."),
    ("122", "TAB_71A0_F_00", 65, "bimestrale", 0.028585, 0.028565,
     "Letto a occhio sulla scansione (Allegato 4B, 10 di 10): 0,028565."),
    ("61", "cometa_t0_22_F", 72, "mensile", 0.0437318, 0.0487318,
     "Letto a occhio sull'Appendice (pag. 3 di 5, reversibile 60% tasso 0%): 0,0487318. Il valore errato era piu basso del 10%."),
    ("61", "cometa_t0_21_M", 76, "mensile", 0.0539777, 0.053777,
     "Letto a occhio sull'Appendice (pag. 3 di 5, reversibile 60% tasso 0%): 0,053777."),
    ("61", "cometa_t0_20_F", 76, "trimestrale", 0.0598973, 0.058973,
     "Letto a occhio sull'Appendice (pag. 2 di 5, certa 10 anni tasso 0%): 0,058973."),
    ("26", "TAB_B1_FEMMINE", 52, "trimestrale", 0.02468, 0.02463,
     "Il PDF stampa 0,02463; 0,02468 compare altrove nel documento, per questo il controllo sul testo non l'aveva colto."),
    # FONTE (123): tabelle incollate come immagini piccole; letto a occhio sull'immagine ingrandita
    # e confermato dalla regolarita delle differenze fra colonne vicine.
    ("123", "tab_a_maschi", 51, "mensile", 25.87496, 25.87696,
     "Letto sull'immagine (pag. 11): 25,876960. Differenze bimestrale-mensile 50-53: 0,1766 0,1818 0,1873 0,1931."),
    ("123", "tab_a_maschi", 52, "mensile", 26.54641, 26.54941,
     "Letto sull'immagine (pag. 11): 26,549410."),
    ("123", "tab_a_maschi", 54, "trimestrale", 28.2887, 28.2867,
     "Letto sull'immagine (pag. 11): 28,286700. Differenze semestrale-trimestrale 53-55: 0,1519 0,1588 0,1662."),
    ("123", "tab_a_femmine", 51, "mensile", 23.37803, 23.37603,
     "Letto sull'immagine (pag. 11): 23,376030. Differenze bimestrale-mensile 50-52: 0,1575 0,1617 0,1661."),
    ("157", "tab_opzione_e_m_tt0", 83, "bimestrali", 55.51535, 55.61535,
     "Letto a occhio sulla scansione (Allegato 2, pagina 9 di 11): 55,61535."),
    ("157", "tab_opzione_e_f_tt0", 59, "bimestrali", 26.12925, 26.12926,
     "Letto a occhio sulla scansione (Allegato 2, pagina 10 di 11): 26,12926."),

    # Refusi del documento stesso: il valore e stampato cosi nel PDF, ma rompe una serie
    # altrimenti regolare. Il corretto ripristina il passo costante fra eta vicine.
    ("77", "tab_all5_m", 64, "trimestrale", 25.9917, 24.9917,
     "Refuso nel PDF: parte intera sbagliata di 1. Passo fra eta vicine ~0,90; 25,9917 lo interrompe (63: 25,9045, 65: 24,0879)."),
    ("77", "tab_all5_f", 70, "trimestrale", 23.9205, 22.9205,
     "Refuso nel PDF: parte intera sbagliata di 1. Passo ~0,93 (69: 23,849)."),
    ("77", "tab_all7_f", 59, "annuale", 33.9549, 32.9549,
     "Refuso nel PDF: parte intera sbagliata di 1. Passo ~0,96 (58: 33,9173, 60: 31,9944)."),
    ("77", "tab_all10_m", 61, "mensile", 27.0753, 28.0753,
     "Refuso nel PDF: parte intera sbagliata di 1. Passo ~0,91 (60: 28,9894, 62: 27,1697)."),
    ("17", "tab_vitalizia_ante2012_f", 75, "trimestrale", 0.067136, 0.07136,
     "Refuso nel PDF (0,067136, con una cifra in piu). Il rapporto trimestrale/mensile a 74 anni (1,0057) applicato a 0,07094 da 0,07135."),
    # Fondo 6 (ALMEGLIO): i divisori seguono scarti costanti fra rateazioni (+0,3825 trimestrale,
    # +0,0425 bimestrale, +0,0425 mensile) in 105 righe su 108; le quattro celle sotto li rompono.
    ("6", "tab_set1_maschi_2.5", 53, "trimestrale", 21.13526, 21.16526,
     "Refuso nel PDF: annuale 20,78276 + 0,3825 = 21,16526; con questo valore la bimestrale torna a +0,0425."),
    ("6", "tab_set1_maschi_2.5", 55, "mensile", 20.31164, 20.34164,
     "Refuso nel PDF: bimestrale 20,29914 + 0,0425 = 20,34164."),
    ("6", "tab_set1_femmine_2.5", 63, "annuale", 18.58036, 18.57036,
     "Refuso nel PDF: il passo per eta delle colonne bimestrale e mensile (0,5074 fra 62 e 63) indica 18,57036."),
    ("6", "tab_set1_femmine_2.5", 63, "trimestrale", 18.98286, 18.95286,
     "Refuso nel PDF: annuale corretta 18,57036 + 0,3825 = 18,95286; la bimestrale torna a +0,0425."),
    ("63", "tab_a_ter", 53, "annuale", 34.76737, 36.76737,
     "Refuso nel PDF: 34 invece di 36. Il rapporto annuale/semestrale a 52 anni (1,0091) applicato a 36,42816 da 36,760."),
]


# Tabelle da marcare "da_verificare": valori plausibili ma non riscontrabili in nessun
# documento in nostro possesso. (albo, prefisso id_tabella, motivo)
DA_VERIFICARE = [
    ("61", "cometa_t0_",
     "Colonne trimestrale e mensile per le eta 50-70 non presenti ne nel PDF del fondo ne nel documento "
     "COMETA 2023 (che riporta solo la colonna annuale, confermata). Gemini le attribuisce al 'Fascicolo "
     "Informativo Rendite Cometa, Allegato VI', che non abbiamo. Le eta 71-80 sono confermate (Appendice, pag. 4)."),
]


# Note senza declassare la qualita: il controllo di regolarita esclude scarti oltre lo 0,1%,
# ma alcune celle restano non confermate dall'OCR per la qualita delle immagini.
NOTE = [
    ("123", "tab_",
     "Tabelle incollate nel PDF come immagini a bassa risoluzione: 71 celle su 882 non confermate dall'OCR. "
     "Nessuna cella si discosta piu dello 0,1% dalla regolarita della tavola; eventuali differenze residue "
     "sono sull'ultima cifra (effetto sulla rendita inferiore allo 0,01%)."),
    ("2", "unipol_vit_imm_1_",
     "Scansione di bassa qualita e nessuna tavola gemella in altri fondi: circa 57 celle non confermate "
     "dall'OCR. Nessuna cella si discosta piu dello 0,1% dalla regolarita della tavola."),
]


def gemelle():
    """Correzioni proposte da incrocia_verifiche.py: cella di un fondo scansionato non confermata
    dall'OCR e diversa, di una cifra, dalla stessa tavola confermata nel testo di un altro fondo."""
    import os
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "verifica_ocr", "correzioni_gemelle.json")
    if not os.path.exists(f):
        return []
    return [(d["albo"], d["id_tabella"], d["eta"], d["colonna"], d["errato"], d["corretto"],
             f"Lettura errata della scansione: valore non confermato dall'OCR; la stessa tavola, "
             f"confermata nel testo del PDF del fondo {d['gemella']}, riporta {d['corretto']}.")
            for d in json.load(open(f, encoding="utf-8"))]


def main():
    path = sys.argv[1]
    db = json.load(open(path, encoding="utf-8"))
    for albo, prefisso, motivo in DA_VERIFICARE:
        for c in db["fondi"].get(albo, {}).get("convenzioni", []):
            for s in c.get("set", []):
                for t in s.get("tabelle", []):
                    if t.get("id_tabella", "").startswith(prefisso) and t.get("qualita") != "da_verificare":
                        t["qualita"] = "da_verificare"
                        t["note"] = ((t.get("note") or "") + " " + motivo).strip()
                        print(f"  marcata da verificare: {albo} {t['id_tabella']}")
    for albo, prefisso, nota in NOTE:
        for c in db["fondi"].get(albo, {}).get("convenzioni", []):
            for s in c.get("set", []):
                for t in s.get("tabelle", []):
                    if t.get("id_tabella", "").startswith(prefisso) and nota not in (t.get("note") or ""):
                        t["note"] = ((t.get("note") or "") + " " + nota).strip()
    applicate = 0
    tutte = CORREZIONI + gemelle()
    for albo, tid, eta, col, errato, corretto, fonte in tutte:
        fondo = db["fondi"].get(albo)
        tab = next((t for c in (fondo or {}).get("convenzioni", []) for s in c.get("set", [])
                    for t in s.get("tabelle", []) if t.get("id_tabella") == tid), None)
        if tab is None:
            print(f"  SALTATA {albo} {tid}: tabella non trovata"); continue
        norm = lambda c: c[:-1] + "e" if c.endswith("li") else c     # 'bimestrali' = 'bimestrale'
        nomi = [norm(c) for c in tab["colonne"]]
        if norm(col) not in nomi:
            print(f"  SALTATA {albo} {tid}: colonna {col} assente"); continue
        j = nomi.index(norm(col)) + 1
        riga = next((r for r in tab["righe"] if r[0] == eta), None)
        if riga is None or riga[j] != errato:
            print(f"  SALTATA {albo} {tid} eta {eta} {col}: trovato {riga[j] if riga else None}, atteso {errato}"); continue
        riga[j] = corretto
        tab["note"] = ((tab.get("note") or "") + f" Corretto a mano: eta {eta} {col} {errato} -> {corretto}. {fonte}").strip()
        applicate += 1
        print(f"  ok {albo} {tid} eta {eta} {col}: {errato} -> {corretto}")
    # nomi delle rateazioni uniformi: il motore cerca la colonna per nome
    rinominate = 0
    for f in db["fondi"].values():
        for c in f.get("convenzioni", []):
            for s in c.get("set", []):
                for t in s.get("tabelle", []):
                    if t.get("tipo_colonne") == "frequenza" and "bimestrali" in t["colonne"]:
                        t["colonne"] = ["bimestrale" if x == "bimestrali" else x for x in t["colonne"]]
                        rinominate += 1
    json.dump(db, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{applicate} correzioni applicate su {len(tutte)}; colonne 'bimestrali' uniformate in {rinominate} tabelle")


if __name__ == "__main__":
    main()
