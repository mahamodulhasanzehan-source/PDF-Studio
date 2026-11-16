@echo off
if "%~1"=="--no-relaunch" goto :main_script

:: Re-launch with cmd /k when double-clicked from Explorer so the window stays open
echo %cmdcmdline% | findstr /i /c:"/c" >nul
if %errorlevel% equ 0 (
    cmd /k ""%~f0" --no-relaunch %*"
    exit /b
)

:main_script
setlocal enabledelayedexpansion

echo ================================================================
echo       PDF STUDIO - WINDOWS 11 TAURI (.EXE) BUILD AUTOMATION
echo ================================================================
echo.

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "OUTPUT_DIR=%ROOT_DIR%\dist_win11"
set "SETUP_OUT=%OUTPUT_DIR%\PDF-Studio-Setup.exe"
set "NSIS_DIR=%ROOT_DIR%\src-tauri\target\release\bundle\nsis"

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

:: Prepend standard tool install paths for the active session
if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%USERPROFILE%\.cargo\bin" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

:: ----------------------------------------------------------------
:: [Step 1] Check / Auto-Install Node.js and npm
:: ----------------------------------------------------------------
echo [1/6] Checking Node.js and npm...
where node >nul 2>nul
if %errorlevel% equ 0 goto :check_npm

echo [*] Node.js not found. Attempting automatic installation...
where winget >nul 2>nul
if %errorlevel% equ 0 (
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

where node >nul 2>nul
if %errorlevel% equ 0 goto :check_npm

echo [*] Downloading Node.js LTS installer...
set "NODE_MSI=%TEMP%\nodejs-lts-x64.msi"
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $v = (Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts } | Select-Object -First 1).version; $url = 'https://nodejs.org/dist/' + $v + '/node-' + $v + '-x64.msi'; Invoke-WebRequest -Uri $url -OutFile '%NODE_MSI%'"
if not exist "%NODE_MSI%" (
    echo [ERROR] Failed to download Node.js installer.
    goto :end_error
)
echo [*] Installing Node.js LTS silently...
msiexec /i "%NODE_MSI%" /qn /norestart
del /f /q "%NODE_MSI%" >nul 2>nul
if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;%PATH%"

:check_npm
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js could not be initialized in PATH. Please restart this script.
    goto :end_error
)
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm was not found in PATH.
    goto :end_error
)
echo [OK] Node.js and npm are ready.
echo.

:: ----------------------------------------------------------------
:: [Step 2] Check / Auto-Install Microsoft C++ Build Tools (MSVC)
:: ----------------------------------------------------------------
echo [2/6] Checking Microsoft C++ Build Tools and Windows SDK...
where cl >nul 2>nul
if %errorlevel% equ 0 (
    where link >nul 2>nul
    if !errorlevel! equ 0 goto :msvc_ready
)

call :find_msvc
if defined VS_VCVARS goto :init_msvc_env

echo [*] C++ Build Tools not detected. Downloading Visual Studio Build Tools...
set "VS_BOOT=%TEMP%\vs_buildtools.exe"
where curl >nul 2>nul
if %errorlevel% equ 0 (
    curl -f -L -s -o "%VS_BOOT%" "https://aka.ms/vs/17/release/vs_buildtools.exe"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_buildtools.exe' -OutFile '%VS_BOOT%'"
)

if not exist "%VS_BOOT%" (
    echo [ERROR] Failed to download Visual Studio Build Tools.
    goto :end_error
)

echo [*] Installing Desktop Development with C++ workload (this may take several minutes)...
"%VS_BOOT%" --quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended
set "VS_EXIT=%errorlevel%"
del /f /q "%VS_BOOT%" >nul 2>nul
if %VS_EXIT% neq 0 if %VS_EXIT% neq 3010 (
    echo [ERROR] Visual Studio Build Tools installation failed with exit code %VS_EXIT%.
    goto :end_error
)

call :find_msvc
if not defined VS_VCVARS (
    echo [ERROR] MSVC vcvars64.bat could not be located after installation.
    goto :end_error
)

:init_msvc_env
echo [*] Initializing MSVC x64 build environment...
call "%VS_VCVARS%" >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to initialize MSVC environment via vcvars64.bat.
    goto :end_error
)

:msvc_ready
echo [OK] MSVC compiler and Windows SDK are ready.
echo.

:: ----------------------------------------------------------------
:: [Step 3] Check / Auto-Install Rust Toolchain (cargo / rustc)
:: ----------------------------------------------------------------
echo [3/6] Checking Rust toolchain...
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo >nul 2>nul
if %errorlevel% equ 0 goto :rust_ready

echo [*] Rust not found. Downloading rustup-init.exe...
set "RUSTUP_EXE=%TEMP%\rustup-init.exe"
where curl >nul 2>nul
if %errorlevel% equ 0 (
    curl -f -L -s -o "%RUSTUP_EXE%" "https://win.rustup.rs/x86_64"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile '%RUSTUP_EXE%'"
)

if not exist "%RUSTUP_EXE%" (
    echo [ERROR] Failed to download rustup-init.exe.
    goto :end_error
)

echo [*] Installing Rust stable (x86_64-pc-windows-msvc)...
"%RUSTUP_EXE%" -y --default-toolchain stable --default-host x86_64-pc-windows-msvc
set "RUST_EXIT=%errorlevel%"
del /f /q "%RUSTUP_EXE%" >nul 2>nul
if %RUST_EXIT% neq 0 (
    echo [ERROR] Rust installation failed with exit code %RUST_EXIT%.
    goto :end_error
)

if exist "%USERPROFILE%\.cargo\bin" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

:rust_ready
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] cargo was not found in PATH after installation.
    goto :end_error
)
rustup target add x86_64-pc-windows-msvc >nul 2>nul
for /f "tokens=*" %%v in ('rustc --version') do echo [OK] %%v
echo.

:: ----------------------------------------------------------------
:: [Step 4] Install Node and Tauri CLI dependencies
:: ----------------------------------------------------------------
echo [4/6] Checking npm and Tauri CLI dependencies...
cd /d "%ROOT_DIR%"
if not exist "%ROOT_DIR%\node_modules\@tauri-apps\cli\" goto :do_npm_install
if not exist "%ROOT_DIR%\node_modules\pdfjs-dist\" goto :do_npm_install
echo [OK] Node and Tauri dependencies already installed.
goto :deps_ready

:do_npm_install
echo [*] Running npm install...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    goto :end_error
)
echo [OK] Project dependencies installed.

:deps_ready
echo.

:: ----------------------------------------------------------------
:: [Step 5] TypeScript validation
:: ----------------------------------------------------------------
echo [5/6] Validating TypeScript codebase...
call npm run lint
if %errorlevel% neq 0 (
    echo [ERROR] TypeScript lint check failed.
    goto :end_error
)
echo [OK] TypeScript check passed cleanly.
echo.

:: ----------------------------------------------------------------
:: [Step 6] Compile Tauri Windows 11 .exe Installer
:: ----------------------------------------------------------------
echo [6/6] Compiling PDF Studio into a Windows 11 .exe installer via Tauri...
call npx tauri build --bundles nsis
if %errorlevel% neq 0 (
    echo [ERROR] Tauri build failed.
    goto :end_error
)

set "FOUND_SETUP="
if exist "%NSIS_DIR%\*-setup.exe" (
    for /f "delims=" %%f in ('dir /b /a-d /o-d "%NSIS_DIR%\*-setup.exe"') do (
        if not defined FOUND_SETUP set "FOUND_SETUP=%NSIS_DIR%\%%f"
    )
)

if not defined FOUND_SETUP (
    echo [ERROR] Tauri completed, but NSIS installer .exe was not found in:
    echo         %NSIS_DIR%
    goto :end_error
)

copy /y "%FOUND_SETUP%" "%SETUP_OUT%" >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to copy installer to "%SETUP_OUT%".
    goto :end_error
)

for %%A in ("%SETUP_OUT%") do set "EXE_BYTES=%%~zA"
set /a "EXE_MB=%EXE_BYTES% / 1048576"

echo.
echo ================================================================
echo [SUCCESS] PDF Studio Windows 11 installer built successfully!
echo.
echo Installable Windows 11 .exe:
echo   "%SETUP_OUT%"
echo Size: ~%EXE_MB% MB (%EXE_BYTES% bytes)
echo.
echo Lightweight native Tauri runtime (uses Windows 11 WebView2).
echo ================================================================
echo.

set "RUN_SETUP="
set /p RUN_SETUP="Launch the Windows 11 installer now? (Y/N): "
if /i "%RUN_SETUP%"=="Y" (
    start "" "%SETUP_OUT%"
)

echo.
echo Build finished. Press any key to exit this window...
pause
exit /b 0

:: ----------------------------------------------------------------
:: Helper: Locate MSVC vcvars64.bat via vswhere.exe
:: ----------------------------------------------------------------
:find_msvc
set "VS_VCVARS="
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto :eof
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
    if exist "%%i\VC\Auxiliary\Build\vcvars64.bat" set "VS_VCVARS=%%i\VC\Auxiliary\Build\vcvars64.bat"
)
goto :eof

:: ----------------------------------------------------------------
:: Error exit
:: ----------------------------------------------------------------
:end_error
echo.
echo ================================================================
echo [BUILD FAILED] An error occurred during the build process.
echo Please review the diagnostic messages above.
echo ================================================================
echo.
echo Press any key to exit this window...
pause
exit /b 1
