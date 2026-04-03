$ErrorActionPreference = 'Stop'

$portalScript = Join-Path $PSScriptRoot 'scripts\start-local-portal.ps1'

if (-not (Test-Path -LiteralPath $portalScript)) {
    Write-Host ''
    Write-Host '[ERROR] The setup script was not found:' -ForegroundColor Red
    Write-Host "  $portalScript" -ForegroundColor Red
    exit 1
}

& $portalScript
exit $LASTEXITCODE
