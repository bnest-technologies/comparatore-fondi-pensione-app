#!/usr/bin/env bash
# Crea i file di configurazione del deploy COPIANDOLI dal servizio Cloud Run che gira oggi,
# invece di ricostruirli a mano: stesse variabili, stessi segreti, stesso service account.
#
#   scripts/deploy/clona_config.sh --project P --service S --region R --env prod --firebase-project F
#   scripts/deploy/clona_config.sh --project P --service S --region R --env test --firebase-project F
#
# Scrive (file esclusi da git, vedi .gitignore):
#   infra/deploy/environments/<env>.env     parametri per scripts/deploy/deploy_*.sh
#   app/backend/env_<env>.json              variabili d'ambiente in chiaro del backend
#   infra/deploy/secrets/<env>.secrets      riferimenti ai segreti in Secret Manager (nomi, non valori)
#
# Con --env test il servizio di destinazione e "<S>-test" e il sito va su un canale di anteprima
# Firebase ("test"): la produzione non viene toccata. Le variabili che contengono l'indirizzo del
# backend di produzione vengono elencate, perche per il test vanno riviste dopo il primo deploy.
set -euo pipefail

PROJECT=""; SERVICE=""; REGION="europe-west1"; ENV_NAME=""; FIREBASE_PROJECT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --service) SERVICE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --env) ENV_NAME="$2"; shift 2 ;;
    --firebase-project) FIREBASE_PROJECT="$2"; shift 2 ;;
    *) echo "Argomento sconosciuto: $1" >&2; exit 1 ;;
  esac
done
if [[ -z "$PROJECT" || -z "$SERVICE" || -z "$ENV_NAME" ]]; then
  echo "Uso: $0 --project P --service S [--region R] --env test|prod [--firebase-project F]" >&2
  exit 1
fi
FIREBASE_PROJECT="${FIREBASE_PROJECT:-$PROJECT}"

# lavora sempre dalla radice della repo, come gli altri script di deploy
[[ -d app/backend ]] || cd "$(dirname "$0")/../.."

if command -v py >/dev/null 2>&1; then PY=(py -3); else PY=(python); fi

mkdir -p infra/deploy/environments infra/deploy/secrets
DESCRIZIONE="$(mktemp)"
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json > "$DESCRIZIONE"

"${PY[@]}" - "$DESCRIZIONE" "$PROJECT" "$SERVICE" "$REGION" "$ENV_NAME" "$FIREBASE_PROJECT" <<'PYEOF'
import json, sys
desc, project, service, region, env, fb = sys.argv[1:7]
d = json.load(open(desc, encoding="utf-8"))
spec = d["spec"]["template"]["spec"]
cont = spec["containers"][0]
ann = d["spec"]["template"]["metadata"].get("annotations", {})
url = d["status"]["url"]

in_chiaro, segreti = {}, []
for e in cont.get("env", []):
    if "value" in e:
        in_chiaro[e["name"]] = e["value"]
    elif "valueFrom" in e and "secretKeyRef" in e["valueFrom"]:
        ref = e["valueFrom"]["secretKeyRef"]
        segreti.append(f'{e["name"]}={ref["name"]}:{ref.get("key", "latest")}')

immagine = cont["image"].split("@")[0]
base = immagine.rsplit(":", 1)[0] if ":" in immagine.split("/")[-1] else immagine
servizio_dest = service if env == "prod" else f"{service}-test"

json.dump(in_chiaro, open(f"app/backend/env_{env}.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
open(f"infra/deploy/secrets/{env}.secrets", "w", encoding="utf-8").write(
    "# Copiato da Cloud Run: " + service + " (" + project + ")\n" + "\n".join(segreti) + "\n")

righe = {
    "GCP_PROJECT_ID": project,
    "GCP_REGION": region,
    "CLOUD_RUN_SERVICE": servizio_dest,
    "BACKEND_IMAGE": f"{base}:{'latest' if env == 'prod' else 'test'}",
    "BACKEND_ENV_VARS_FILE": f"app/backend/env_{env}.json",
    "BACKEND_SECRETS_MAPPING_FILE": f"infra/deploy/secrets/{env}.secrets",
    "CLOUD_RUN_SERVICE_ACCOUNT": spec.get("serviceAccountName", ""),
    "CLOUD_RUN_MIN_INSTANCES": ann.get("autoscaling.knative.dev/minScale", "0"),
    "CLOUD_RUN_MAX_INSTANCES": ann.get("autoscaling.knative.dev/maxScale", "5"),
    "CLOUD_RUN_ALLOW_UNAUTHENTICATED": "true",
    "FIREBASE_PROJECT_ID": fb,
    "FIREBASE_HOSTING_TARGET": "app",
    "FIREBASE_DEPLOY_MODE": "live" if env == "prod" else "channel",
    "FIREBASE_CHANNEL_ID": "" if env == "prod" else "test",
    # per il test l'indirizzo vero si conosce dopo il primo deploy del backend di test
    "FRONTEND_VITE_API_BASE": url if env == "prod" else "DA_AGGIORNARE_DOPO_IL_DEPLOY_DEL_BACKEND_TEST",
}
with open(f"infra/deploy/environments/{env}.env", "w", encoding="utf-8") as f:
    f.write(f"# Copiato da Cloud Run {service} ({project}) - ambiente {env}\n")
    for k, v in righe.items():
        f.write(f'{k}="{v}"\n')

print(f"Scritti: infra/deploy/environments/{env}.env, app/backend/env_{env}.json, infra/deploy/secrets/{env}.secrets")
print(f"  servizio di origine : {service} ({url})")
print(f"  servizio di destinazione: {servizio_dest}")
print(f"  variabili in chiaro : {len(in_chiaro)}   segreti: {len(segreti)}")
if env != "prod":
    host = url.split("//", 1)[-1]
    da_rivedere = [k for k, v in in_chiaro.items() if host in v or "run.app" in v]
    if da_rivedere:
        print("  ATTENZIONE, variabili con l'indirizzo del backend di produzione, da rivedere per il test:")
        for k in da_rivedere:
            print(f"    {k} = {in_chiaro[k]}")
PYEOF
rm -f "$DESCRIZIONE"
