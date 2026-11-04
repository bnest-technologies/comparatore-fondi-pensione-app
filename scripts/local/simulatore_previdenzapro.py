"""
Simulatore di PrevidenzaPro per collaudare il comparatore incorporato.

Fa le tre cose che fara la piattaforma vera:
  - pubblica le chiavi pubbliche su /.well-known/jwks.json
  - firma token JWT RS256 di breve durata
  - mostra una pagina che carica il comparatore in un iframe e gli passa il
    token con postMessage

Serve anche a provare cosa succede quando qualcosa va storto: token scaduto,
emesso per un altro software, firmato da chi non conosciamo, gia usato,
con l'autorizzazione scaduta o con una scadenza illeggibile.

Uso:

  1. Backend con l'SSO acceso, puntato a questo simulatore:

     APP_SSO_ENABLED=true \\
     APP_SSO_ISSUER=http://localhost:8012 \\
     APP_SSO_AUDIENCE=comparatore-fondi-pensione \\
     APP_SSO_JWKS_URL=http://localhost:8012/.well-known/jwks.json \\
     APP_SSO_PARENT_ORIGINS=http://localhost:8012 \\
     APP_SSO_JWKS_MIN_REFETCH=0 \\
     ANTEPRIMA_PORTA=8011 \\
     APP_CORS_ORIGINS="http://localhost:5174,http://localhost:8012" \\
     app/backend/.venv/Scripts/python.exe scripts/local/anteprima_backend.py

  2. Frontend di anteprima:

     VITE_API_BASE=http://localhost:8011 npx vite --port 5174 --strictPort

  3. Questo simulatore:

     app/backend/.venv/Scripts/python.exe scripts/local/simulatore_previdenzapro.py

  4. Apri http://localhost:8012

Le chiavi si rigenerano a ogni avvio: nessun segreto finisce su disco.
"""
from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

KID = "simulatore-locale-1"
# distingue "campo assente" da un valore che vogliamo mandare cosi com'e
_ASSENTE = object()
DESTINATARIO_PREDEFINITO = "comparatore-fondi-pensione"

_privata = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_estranea = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwks() -> dict:
    jwk = json.loads(RSAAlgorithm.to_jwk(_privata.public_key()))
    jwk.update({"kid": KID, "alg": "RS256", "use": "sig"})
    return {"keys": [jwk]}


def firma(
    emittente: str,
    *,
    destinatario: str = DESTINATARIO_PREDEFINITO,
    email: str = "consulente@previdenzapro.it",
    nome: str = "Consulente di prova",
    sub: str = "7f3a1c20-1111-4000-8000-00000000abcd",
    durata: int = 60,
    eta: int = 0,
    chiave_estranea: bool = False,
    autorizzazione: Any = _ASSENTE,
) -> str:
    adesso = int(time.time()) - eta
    claims = {
        "iss": emittente,
        "aud": destinatario,
        "sub": sub,
        "jti": str(uuid.uuid4()),
        "iat": adesso,
        "exp": adesso + durata,
        "email": email,
        "email_verified": True,
        "name": nome,
    }
    if autorizzazione is not _ASSENTE:
        claims["authorization_valid_until"] = autorizzazione
    chiave = _estranea if chiave_estranea else _privata
    return jwt.encode(claims, chiave, algorithm="RS256", headers={"kid": KID})


PAGINA = """<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PrevidenzaPro (simulatore)</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: #eef2f7; color: #13223a; }
  header { background: #13223a; color: #fff; padding: 12px 20px; display: flex; gap: 16px; align-items: center; }
  header b { font-size: 17px; }
  header span { opacity: .7; font-size: 13px; }
  .barra { background: #fff; border-bottom: 1px solid #d6deea; padding: 10px 20px;
           display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  button { font: inherit; padding: 7px 12px; border-radius: 8px; border: 1px solid #b9c6d8;
           background: #fff; cursor: pointer; }
  button.primario { background: #13223a; color: #fff; border-color: #13223a; }
  button.guasto { border-color: #d9a0a0; color: #8a2020; }
  .stato { margin-left: auto; font-size: 13px; padding: 4px 10px; border-radius: 999px; background: #e7edf5; }
  .stato.ok { background: #dff3e4; color: #14532d; }
  .stato.errore { background: #fae2e2; color: #7f1d1d; }
  #registro { font-family: ui-monospace, monospace; font-size: 12px; background: #0f172a; color: #cbd5e1;
              padding: 10px 20px; max-height: 140px; overflow: auto; }
  #registro div { white-space: pre-wrap; }
  iframe { width: 100%; height: calc(100vh - 260px); border: 0; display: block; background: #fff; }
</style>
</head>
<body>
<header>
  <b>PrevidenzaPro</b>
  <span>simulatore locale &mdash; serve solo a collaudare l'integrazione</span>
</header>

<div class="barra">
  <button class="primario" onclick="invia('/token')">Accedi</button>
  <button onclick="invia('/token')">Rinnova</button>
  <button onclick="logout()">Logout</button>
  <button class="guasto" onclick="invia('/token?caso=scaduto')">Token scaduto</button>
  <button class="guasto" onclick="invia('/token?caso=altro-software')">Altro software</button>
  <button class="guasto" onclick="invia('/token?caso=firma-estranea')">Firma estranea</button>
  <button class="guasto" onclick="invia('/token?caso=autorizzazione-scaduta')">Autorizzazione scaduta</button>
  <button class="guasto" onclick="invia('/token?caso=autorizzazione-illeggibile')">Scadenza illeggibile</button>
  <button class="guasto" onclick="riusa()">Riusa l'ultimo token</button>
  <span class="stato" id="stato">in attesa</span>
</div>

<iframe id="comparatore" src="__COMPARATORE__" title="Comparatore fondi pensione"></iframe>

<div id="registro"></div>

<script>
  const COMPARATORE_ORIGIN = new URL("__COMPARATORE__", location.href).origin;
  const iframe = document.getElementById('comparatore');
  const registro = document.getElementById('registro');
  const stato = document.getElementById('stato');
  let ultimoToken = null;

  function scrivi(testo, tipo) {
    const riga = document.createElement('div');
    const ora = new Date().toLocaleTimeString('it-IT');
    riga.textContent = `${ora}  ${testo}`;
    if (tipo === 'errore') riga.style.color = '#fca5a5';
    if (tipo === 'ok') riga.style.color = '#86efac';
    registro.appendChild(riga);
    registro.scrollTop = registro.scrollHeight;
  }

  function segnala(testo, classe) {
    stato.textContent = testo;
    stato.className = 'stato' + (classe ? ' ' + classe : '');
  }

  function consegna(token) {
    ultimoToken = token;
    iframe.contentWindow.postMessage(
      { source: 'previdenzapro', type: 'token', token },
      COMPARATORE_ORIGIN
    );
    scrivi('token consegnato al comparatore');
  }

  async function invia(percorso) {
    try {
      const risposta = await fetch(percorso);
      const dati = await risposta.json();
      segnala('token inviato');
      consegna(dati.token);
    } catch (err) {
      segnala('errore', 'errore');
      scrivi('non sono riuscito a firmare il token: ' + err, 'errore');
    }
  }

  function riusa() {
    if (!ultimoToken) { scrivi('nessun token da riusare', 'errore'); return; }
    scrivi('riuso dello stesso token: il comparatore deve rifiutarlo');
    consegna(ultimoToken);
  }

  function logout() {
    iframe.contentWindow.postMessage({ source: 'previdenzapro', type: 'logout' }, COMPARATORE_ORIGIN);
    segnala('uscito');
    scrivi('logout inviato');
  }

  window.addEventListener('message', (evento) => {
    if (evento.origin !== COMPARATORE_ORIGIN) return;
    const dati = evento.data;
    if (!dati || dati.source !== 'comparatore-fondi-pensione') return;

    if (dati.type === 'ready') {
      scrivi('il comparatore e pronto');
      invia('/token');
      return;
    }
    if (dati.type === 'token-request') {
      scrivi('il comparatore chiede un token');
      invia('/token');
    }
  });

  scrivi('simulatore avviato; il comparatore e su ' + COMPARATORE_ORIGIN);
</script>
</body>
</html>
"""


class Gestore(BaseHTTPRequestHandler):
    comparatore = "http://localhost:5174/?embed=1"
    emittente = "http://localhost:8012"

    def _rispondi(self, corpo: bytes, tipo: str, codice: int = 200) -> None:
        self.send_response(codice)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        # il backend legge il JWKS da un'altra origine
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self) -> None:  # noqa: N802
        percorso = urlparse(self.path)
        parametri = parse_qs(percorso.query)

        if percorso.path == "/.well-known/jwks.json":
            self._rispondi(json.dumps(jwks()).encode(), "application/json")
            return

        if percorso.path == "/token":
            caso = (parametri.get("caso") or ["normale"])[0]
            opzioni: dict = {}
            if caso == "scaduto":
                opzioni = {"durata": 30, "eta": 600}
            elif caso == "altro-software":
                opzioni = {"destinatario": "pianificatore-previdenziale"}
            elif caso == "firma-estranea":
                opzioni = {"chiave_estranea": True}
            elif caso == "autorizzazione-scaduta":
                opzioni = {"autorizzazione": int(time.time()) - 3600}
            elif caso == "autorizzazione-illeggibile":
                opzioni = {"autorizzazione": "quando sara"}
            token = firma(self.emittente, **opzioni)
            self._rispondi(json.dumps({"token": token, "caso": caso}).encode(), "application/json")
            return

        if percorso.path in ("/", "/index.html"):
            pagina = PAGINA.replace("__COMPARATORE__", self.comparatore)
            self._rispondi(pagina.encode("utf-8"), "text/html; charset=utf-8")
            return

        self._rispondi(b"non trovato", "text/plain", 404)

    def log_message(self, formato: str, *args) -> None:  # silenzio sul terminale
        return


def main() -> None:
    analizzatore = argparse.ArgumentParser(description="Simulatore di PrevidenzaPro per i test locali")
    analizzatore.add_argument("--porta", type=int, default=int(os.getenv("SIMULATORE_PORTA", "8012")))
    analizzatore.add_argument("--comparatore", default=os.getenv("COMPARATORE_URL", "http://localhost:5174/?embed=1"))
    argomenti = analizzatore.parse_args()

    Gestore.comparatore = argomenti.comparatore
    Gestore.emittente = f"http://localhost:{argomenti.porta}"

    print(f"Simulatore PrevidenzaPro su http://localhost:{argomenti.porta}")
    print(f"  comparatore:  {argomenti.comparatore}")
    print(f"  emittente:    {Gestore.emittente}")
    print(f"  JWKS:         {Gestore.emittente}/.well-known/jwks.json")
    print(f"  destinatario: {DESTINATARIO_PREDEFINITO}")
    print("\nCtrl+C per fermare.\n")

    HTTPServer(("127.0.0.1", argomenti.porta), Gestore).serve_forever()


if __name__ == "__main__":
    main()
