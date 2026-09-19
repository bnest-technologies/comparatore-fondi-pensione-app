#!/usr/bin/env bash
# Mostra dove gira oggi il comparatore: servizi Cloud Run e siti Firebase nei progetti noti.
# Serve prima del primo deploy, per scegliere il servizio da cui copiare la configurazione.
#
#   scripts/deploy/rileva_produzione.sh
#
# Richiede: gcloud e firebase gia autenticati (gcloud auth login, firebase login).
set -uo pipefail

PROGETTI=(accademia-previdenza financial-suite gen-lang-client-0685938029)

for p in "${PROGETTI[@]}"; do
  echo "=================================================================="
  echo " Progetto: $p"
  echo "=================================================================="
  echo "-- Servizi Cloud Run"
  gcloud run services list --project "$p" \
    --format="table(metadata.name, region, status.url, metadata.annotations.'serving.knative.dev/lastModifier', status.conditions[0].lastTransitionTime.date('%Y-%m-%d'))" \
    2>&1 | sed 's/^/   /'
  echo "-- Siti Firebase Hosting"
  firebase hosting:sites:list --project "$p" 2>&1 | sed 's/^/   /'
  echo
done

cat <<'NOTA'
Come leggere il risultato:
- il servizio Cloud Run di produzione e quello chiamato dal sito pubblico (di solito
  fund-comparison-api, aggiornato piu di recente);
- il sito Firebase di produzione e quello collegato al dominio del cliente
  (lo si vede in Firebase Console > Hosting > Domini personalizzati).
Poi: scripts/deploy/clona_config.sh --project <progetto> --service <servizio> --region <regione> --env prod
NOTA
