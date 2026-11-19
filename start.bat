@echo off
rem ============================================================
rem  AI Trading Petrunko — one-click launcher (Windows)
rem  Runs: build analysis core -> backend :8787 -> frontend :3000
rem ============================================================
cd /d "%~dp0"

echo [1/4] Checking Node.js ...
where node >nul 2>nul || ( echo ERROR: Node.js not found. Install Node 20+ https://nodejs.org & pause & exit /b 1 )

if not exist node_modules (
  echo [2/4] Installing dependencies (first run)...
  call npm.cmd install --no-audit --no-fund || ( echo npm install failed & pause & exit /b 1 )
) else (
  echo [2/4] Dependencies OK
)

echo [3/4] Building analysis core (lib/analyze.mjs)...
call node tools\build-core.mjs || ( echo core build failed & pause & exit /b 1 )

echo [4/4] Starting backend :8787 and frontend :3000 ...
start "AI-Trading BACKEND :8787" /MIN cmd /k "node server\index.mjs"
timeout /t 2 /nobreak >nul
start "AI-Trading FRONTEND :3000" /MIN cmd /k "node node_modules\next\dist\bin\next dev -p 3000"

timeout /t 5 /nobreak >nul
start "" http://localhost:3000
echo Done. Frontend: http://localhost:3000  -  API: http://localhost:8787/api/status
timeout /t 3 >nul
