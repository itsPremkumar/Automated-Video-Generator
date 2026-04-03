@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PORTAL_SCRIPT=%SCRIPT_DIR%scripts\start-local-portal.ps1"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%PORTAL_SCRIPT%" (
    echo.
    echo [ERROR] The setup script was not found:
    echo   "%PORTAL_SCRIPT%"
    echo.
    echo Make sure you are running this from the project folder.
    pause
    exit /b 1
)

if not exist "%POWERSHELL_EXE%" (
    echo.
    echo [ERROR] Windows PowerShell was not found on this PC.
    echo Try opening PowerShell manually and run:
    echo   powershell -ExecutionPolicy Bypass -File "%PORTAL_SCRIPT%"
    echo.
    pause
    exit /b 1
)

"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%PORTAL_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] Setup did not finish successfully. Exit code: %EXIT_CODE%
    echo If you started this from PowerShell, you can also run:
    echo   .\Start-Automated-Video-Generator.bat
    echo.
    pause
)

endlocal & exit /b %EXIT_CODE%
