@echo off
setlocal
cd /d "%~dp0"
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
if not exist logs mkdir logs
call :build > logs\build.log 2>&1
set "RESULT=%ERRORLEVEL%"
type logs\build.log
echo Log: %CD%\logs\build.log
if not "%RESULT%"=="0" echo BUILD BLOCKED/FAIL. See log above.
if "%RESULT%"=="0" echo BUILD OK. Runtime/UAT still required.
if /i not "%~1"=="--no-pause" pause
exit /b %RESULT%

:build
echo [1/6] Check Windows toolchain
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-environment.ps1
if not "%ERRORLEVEL%"=="0" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-build-locks.ps1
if not "%ERRORLEVEL%"=="0" exit /b 1
echo [2/6] Install locked dependencies
call npm ci
if not "%ERRORLEVEL%"=="0" exit /b 1
call npm run prepare:reference
if not "%ERRORLEVEL%"=="0" exit /b 1
echo [3/6] Lint, types, current phase tests only (full regression is deferred to P7)
call npm run check:p5
if not "%ERRORLEVEL%"=="0" exit /b 1
echo [4/6] Build shared Web + Tauri NSIS
call npm run desktop:build
if not "%ERRORLEVEL%"=="0" exit /b 1
rem Rebuild the Web target with its configured Pages base, not the Desktop / base.
call npm run build:web
if not "%ERRORLEVEL%"=="0" exit /b 1
echo [5/6] Copy artifacts (no ZIP, no deploy)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\collect-build.ps1
if not "%ERRORLEVEL%"=="0" exit /b 1
echo [6/6] Output File\Desktop_Light and File\Web
exit /b 0
