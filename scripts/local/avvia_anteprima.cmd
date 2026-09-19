@echo off
rem ------------------------------------------------------------------------
rem  Anteprima locale del comparatore, senza credenziali.
rem  Doppio clic: utente Full Access.  Da terminale: avvia_anteprima.cmd free
rem  Apre due finestre (backend e sito) e poi il browser su localhost:5173.
rem  Per fermare tutto basta chiudere le due finestre.
rem ------------------------------------------------------------------------
setlocal
set "RADICE=%~dp0..\.."
set "OPZIONE="
if /i "%~1"=="free" set "OPZIONE=--free"

if not exist "%RADICE%\app\backend\.venv\Scripts\python.exe" (
  echo Ambiente Python del backend mancante: creo app\backend\.venv ...
  py -3.12 -m venv "%RADICE%\app\backend\.venv" || python -m venv "%RADICE%\app\backend\.venv"
  "%RADICE%\app\backend\.venv\Scripts\python.exe" -m pip install -r "%RADICE%\app\backend\requirements.txt"
)

if not exist "%RADICE%\app\frontend\node_modules" (
  echo Dipendenze del sito mancanti: le installo ...
  pushd "%RADICE%\app\frontend" && call npx --yes pnpm@9 install --frozen-lockfile && popd
)

start "Backend anteprima" cmd /k ""%RADICE%\app\backend\.venv\Scripts\python.exe" "%RADICE%\scripts\local\anteprima_backend.py" %OPZIONE%"
start "Sito anteprima" cmd /k "cd /d "%RADICE%\app\frontend" && set VITE_API_BASE=http://localhost:8000&& npx vite --port 5173 --strictPort"

echo Attendo l'avvio...
timeout /t 12 /nobreak >nul
start "" http://localhost:5173/simulator
endlocal
