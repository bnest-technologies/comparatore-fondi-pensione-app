# Aggiornamento rendimenti e costi da file COVIP

Dataset di partenza: `database_comparti_2026-06-10 (1).csv` (489 comparti). Fonti: ISC 2026 (487 comparti) e rendimenti 2025 (464 comparti).

## Costi (ISC)

- aggiornati: **465** comparti
- lasciati com'erano, da confermare: **12**
- presenti nei file COVIP ma non nel dataset: **19**

### Da confermare (non toccati)

| Fondo | Comparto | Motivo | Dato COVIP |
|---|---|---|---|
| FPA 150 FONDO PENSIONE APERTO IL MELOG | PRUDENTE | nessun comparto con questo nome nel file COVIP | - |
| FPA 150 FONDO PENSIONE APERTO IL MELOG | EQUILIBRATA | nessun comparto con questo nome nel file COVIP | - |
| FPA 150 FONDO PENSIONE APERTO IL MELOG | DINAMICA | nessun comparto con questo nome nel file COVIP | - |
| FPA 150 FONDO PENSIONE APERTO IL MELOG | GARANTITA | nessun comparto con questo nome nel file COVIP | - |
| FPN 61 FONDO PENSIONE COMETA | TFR SILENTE | nessun comparto con questo nome nel file COVIP | - |
| FPN 103 FONDO PENSIONE TELEMACO | BILANCIATO (YELLOW) | unico comparto rimasto ma i costi sono cambiati | DINAMICO [0.97, 0.64, 0.5, 0.39] |
| FPN 167 FONDAEREO | EQUILIBRIO - Assistenti di volo | nessun comparto con questo nome nel file COVIP | - |
| FPN 167 FONDAEREO | EQUILIBRIO - Piloti | nessun comparto con questo nome nel file COVIP | - |
| FPN 167 FONDAEREO | CRESCITA - Assistenti di volo | nessun comparto con questo nome nel file COVIP | - |
| FPN 167 FONDAEREO | CRESCITA - Piloti | nessun comparto con questo nome nel file COVIP | - |
| FPN 103 FONDO PENSIONE TELEMACO | GARANTITO (WHITE) | possibile scambio di nomi in questo fondo: i costi 2026 di 'PRUDENTE (GREEN)' sono identici ai costi 2025 di 'BILANCIATO (YELLOW)', non ai suoi | GARANTITO [0.97, 0.64, 0.5, 0.39] |
| FPN 103 FONDO PENSIONE TELEMACO | PRUDENTE (GREEN) | possibile scambio di nomi in questo fondo: i costi 2026 di 'PRUDENTE (GREEN)' sono identici ai costi 2025 di 'BILANCIATO (YELLOW)', non ai suoi | PRUDENTE [0.92, 0.59, 0.45, 0.34] |

### Comparti COVIP non presenti nel dataset

| Tipo | Albo | Comparto | Valori COVIP |
|---|---|---|---|
| FPA | 63 | COMPARTO SVILUPPO 15+ | [2.58, 1.81, 1.63, 1.53] |
| FPN | 167 | AZIONARIO - Assistenti di volo | [1.3, 0.68, 0.42, 0.2] |
| FPN | 167 | AZIONARIO - Piloti | [2.19, 1.12, 0.65, 0.26] |
| FPN | 167 | OBBLIGAZIONARIO - Assistenti di volo | [1.32, 0.7, 0.44, 0.22] |
| FPN | 167 | OBBLIGAZIONARIO - Piloti | [2.21, 1.15, 0.67, 0.28] |
| PIP | 5091 | PREVIDENZA ASSOLUTO | [4.47, 2.72, 1.94, 1.52] |
| PIP | 5107 | ZURICH PENSION ESG AZIONARIO | [4.57, 3.55, 3.08, 2.69] |
| PIP | 5107 | ZURICH PENSION ESG FLEX 4 | [3.9, 2.87, 2.4, 2.0] |
| PIP | 5107 | ZURICH PENSION ESG FLEX 8 | [4.19, 3.17, 2.7, 2.31] |
| PIP | 5107 | ZURICH PENSION GARANTITA | [3.38, 2.32, 1.85, 1.45] |
| PIP | 5108 | PREVIDENZA REALE | [4.06, 2.38, 1.91, 1.61] |
| PIP | 5108 | REALE LINEA EQUILIBRIO | [4.25, 2.57, 2.1, 1.8] |
| PIP | 5108 | REALE LINEA FUTURO | [4.74, 3.07, 2.6, 2.3] |
| PIP | 5109 | PREVIDENZA REALE | [5.41, 3.4, 2.52, 1.8] |
| PIP | 5109 | REALE LINEA EQUILIBRIO | [5.59, 3.59, 2.71, 1.99] |
| PIP | 5109 | REALE LINEA FUTURO | [6.08, 4.09, 3.21, 2.49] |
| PIP | 5110 | ITALIANA LINEA EQUILIBRIO | [4.48, 3.03, 2.41, 1.9] |
| PIP | 5110 | ITALIANA LINEA FUTURO | [4.98, 3.54, 2.92, 2.42] |
| PIP | 5110 | PREFIN FUTURO | [4.29, 2.84, 2.22, 1.71] |

### Abbinati senza nome identico (da controllare a campione)

| Fondo | Comparto nel dataset | Comparto COVIP | Regola |
|---|---|---|---|
| PIP 5039 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 per eliminazione, costi identici |
| PIP 5040 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 per eliminazione, costi identici |
| PIP 5044 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 per eliminazione, costi identici |
| PIP 5046 | PREVI | PREVIATTIVA UNIPOL | livello 3 per eliminazione, costi identici |
| PIP 5066 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 per eliminazione, costi identici |
| PIP 5082 | FUTURIV | PREVIATTIVA UNIPOL | livello 3 per eliminazione, costi identici |
| PIP 5096 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 costi identici a quelli dell'anno scorso |
| PIP 5096 | EUROVITA AZIONE PIU' | AZIONE PIU' | livello 3 costi identici a quelli dell'anno scorso |
| FPA 18 | OBBLIGAZIONARIO GARANTITO | PRUDENTE GARANTITO | livello 3 costi identici a quelli dell'anno scorso |
| FPA 18 | FLESSIBILE | MODERATO | livello 3 costi identici a quelli dell'anno scorso |
| FPA 18 | AZIONARIO | EVOLUTO | livello 3 costi identici a quelli dell'anno scorso |
| FPN 61 | SICUREZZA 2020 | SICUREZZA | livello 2  |
| FPN 143 | AZIONARIO | CRESCITA | livello 3 per eliminazione, costi identici |

## Rendimenti

- aggiornati: **457** comparti
- lasciati com'erano, da confermare: **6**
- presenti nei file COVIP ma non nel dataset: **3**

### Da confermare (non toccati)

| Fondo | Comparto | Motivo | Dato COVIP |
|---|---|---|---|
| FPN 167 FONDAEREO | EQUILIBRIO | nessun comparto con questo nome nel file COVIP | - |
| FPN 167 FONDAEREO | CRESCITA | nessun comparto con questo nome nel file COVIP | - |
| FPA 34 FONDO PENSIONE APERTO PREVIGES | BILANCIATO | il nome coincide ma i dati non sono continui (rendimento a 20 anni: 3.78 -> 5.53) | BILANCIATO [5.68, 7.0, 2.92, 2.28, 5.53] |
| FPN 103 FONDO PENSIONE TELEMACO | GARANTITO (WHITE) | possibile scambio di nomi in questo fondo: i costi 2026 di 'PRUDENTE (GREEN)' sono identici ai costi 2025 di 'BILANCIATO (YELLOW)', non ai suoi | GARANTITO [2.43, 4.05, 0.74, 1.02, None] |
| FPN 103 FONDO PENSIONE TELEMACO | PRUDENTE (GREEN) | possibile scambio di nomi in questo fondo: i costi 2026 di 'PRUDENTE (GREEN)' sono identici ai costi 2025 di 'BILANCIATO (YELLOW)', non ai suoi | PRUDENTE [8.21, 6.5, 2.75, 2.96, 3.27] |
| FPN 103 FONDO PENSIONE TELEMACO | BILANCIATO (YELLOW) | possibile scambio di nomi in questo fondo: i costi 2026 di 'PRUDENTE (GREEN)' sono identici ai costi 2025 di 'BILANCIATO (YELLOW)', non ai suoi | BILANCIATO DINAMICO [13.73, 9.41, 4.98, 4.63, 4.09] |

### Comparti COVIP non presenti nel dataset

| Tipo | Albo | Comparto | Valori COVIP |
|---|---|---|---|
| PIP | 5107 | ZURICH PENSION ESG FLEX 4 | [1.15, 3.17, 0.57, -0.3, None] |
| PIP | 5107 | ZURICH PENSION ESG FLEX 8 | [0.74, 5.02, 0.86, 1.39, None] |
| PIP | 5107 | ZURICH PENSION ESG AZIONARIO | [3.33, 10.1, 7.43, 6.11, None] |

### Abbinati senza nome identico (da controllare a campione)

| Fondo | Comparto nel dataset | Comparto COVIP | Regola |
|---|---|---|---|
| PIP 5085 | CNP PREVIDENZA EQUITY | PREVIDENZA EQUITY | livello 3 per eliminazione |
| PIP 5039 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 stesso comparto abbinato nell'altra fonte |
| PIP 5040 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 stesso comparto abbinato nell'altra fonte |
| PIP 5044 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 stesso comparto abbinato nell'altra fonte |
| PIP 5046 | PREVI | PREVIATTIVA UNIPOL | livello 3 stesso comparto abbinato nell'altra fonte |
| PIP 5066 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 stesso comparto abbinato nell'altra fonte |
| PIP 5082 | FUTURIV | PREVIATTIVA UNIPOL | livello 3 stesso comparto abbinato nell'altra fonte |
| PIP 5096 | NUOVO PPB | PREVIATTIVA UNIPOL | livello 3 stesso comparto abbinato nell'altra fonte |
| PIP 5096 | EUROVITA AZIONE PIU' | AZIONE PIU' | livello 3 stesso comparto abbinato nell'altra fonte |
| FPA 169 | OBBLIGAZIONARIO MISTO 25% ESG | OBBLIGAZIONARIO MISTO | livello 2  |
| FPA 169 | BILANCIATO 50% ESG | BILANCIATO | livello 2  |
| FPA 169 | AZIONARIO 75% ESG | AZIONARIO | livello 2  |
| FPA 169 | AZIONARIO PLUS 90% ESG | AZIONARIO PLUS | livello 2  |
| FPA 169 | GARANTITO ESG | GARANTITO | livello 2  |
| FPA 18 | OBBLIGAZIONARIO GARANTITO | PRUDENTE GARANTITO | livello 3 stesso comparto abbinato nell'altra fonte |
| FPA 18 | FLESSIBILE | MODERATO | livello 3 stesso comparto abbinato nell'altra fonte |
| FPA 18 | AZIONARIO | EVOLUTO | livello 3 stesso comparto abbinato nell'altra fonte |
