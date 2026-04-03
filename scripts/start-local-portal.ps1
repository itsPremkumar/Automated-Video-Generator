$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$port = if ($env:PORT) { $env:PORT } else { '3001' }
$baseUrl = "http://localhost:$port"
$healthUrl = "$baseUrl/health"

function Write-Step($message) {
    Write-Host ""
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Write-WarnMessage($message) {
    Write-Host ""
    Write-Host "[WARN] $message" -ForegroundColor Yellow
}

function Write-SuccessMessage($message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Green
}

function Write-InfoMessage($message) {
    Write-Host "   $message" -ForegroundColor DarkGray
}

function Write-StatusLine($label, $value, $color = 'Gray') {
    Write-Host ("   {0,-22} {1}" -f "${label}:", $value) -ForegroundColor $color
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

function Test-CommandExists($commandName) {
    return $null -ne (Get-Command $commandName -ErrorAction SilentlyContinue)
}

function Assert-RequiredFile($path, $label) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "$label was not found at: $path"
    }
}

function Format-CommandForDisplay($command, $arguments) {
    $parts = @($command)
    foreach ($argument in ($arguments | Where-Object { $_ -ne $null })) {
        if ($argument -match '\s') {
            $parts += '"' + ($argument -replace '"', '\"') + '"'
        } else {
            $parts += $argument
        }
    }

    return $parts -join ' '
}

function Get-CommandLocation($commandName) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) {
        return $null
    }

    if ($command.Source) {
        return $command.Source
    }

    if ($command.Path) {
        return $command.Path
    }

    return $command.Definition
}

function Invoke-QuietCommand($command, $arguments) {
    try {
        $output = & $command @arguments 2>$null
        if ($LASTEXITCODE -eq 0) {
            return ($output | Out-String).Trim()
        }
    } catch {
        return $null
    }

    return $null
}

function Invoke-ExternalCommand($command, $arguments, $failureMessage) {
    Write-InfoMessage "Running: $(Format-CommandForDisplay $command $arguments)"
    & $command @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$failureMessage (exit code $LASTEXITCODE)."
    }
}

function Test-LauncherCommand($command, $arguments) {
    try {
        & $command @arguments *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Get-InstalledPythonDirs {
    $roots = @()
    if ($env:LOCALAPPDATA) {
        $roots += (Join-Path $env:LOCALAPPDATA 'Programs\Python')
    }
    if ($env:USERPROFILE) {
        $roots += (Join-Path $env:USERPROFILE 'AppData\Local\Programs\Python')
    }

    $dirs = @()
    foreach ($root in $roots | Select-Object -Unique) {
        if (-not (Test-Path $root)) {
            continue
        }

        $dirs += Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^Python\d+' } |
            Sort-Object Name -Descending |
            Select-Object -ExpandProperty FullName
    }

    return $dirs | Select-Object -Unique
}

function Ensure-WingetPackage($label, $commandName, $commandArguments, $packageId) {
    if ((Test-CommandExists $commandName) -and (Test-LauncherCommand $commandName $commandArguments)) {
        $commandLocation = Get-CommandLocation $commandName
        $version = Invoke-QuietCommand $commandName $commandArguments
        if ($version) {
            Write-StatusLine $label "$version ($commandLocation)" 'Green'
        } else {
            Write-StatusLine $label "Already installed ($commandLocation)" 'Green'
        }
        return
    }

    if (-not (Test-CommandExists 'winget')) {
        throw "$label is required, but winget is not available on this PC. Install $label manually and run the launcher again."
    }

    Write-Step "Installing $label with winget"
    Invoke-ExternalCommand 'winget' @(
        'install',
        '--id', $packageId,
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--silent'
    ) "$label installation failed"
    Refresh-Path

    if (-not ((Test-CommandExists $commandName) -and (Test-LauncherCommand $commandName $commandArguments))) {
        throw "$label installation finished, but $commandName is still not ready. Please reopen the launcher once installation completes."
    }

    $commandLocation = Get-CommandLocation $commandName
    $version = Invoke-QuietCommand $commandName $commandArguments
    if ($version) {
        Write-StatusLine $label "$version ($commandLocation)" 'Green'
    } else {
        Write-StatusLine $label "Installed ($commandLocation)" 'Green'
    }
}

function Get-PythonLauncher {
    if ((Test-CommandExists 'py') -and (Test-LauncherCommand 'py' @('-m', 'pip', '--version'))) {
        return @('py', '-m', 'pip')
    }

    if ((Test-CommandExists 'python') -and (Test-LauncherCommand 'python' @('-m', 'pip', '--version'))) {
        return @('python', '-m', 'pip')
    }

    foreach ($pythonDir in Get-InstalledPythonDirs) {
        $pythonExe = Join-Path $pythonDir 'python.exe'
        if ((Test-Path $pythonExe) -and (Test-LauncherCommand $pythonExe @('-m', 'pip', '--version'))) {
            return @($pythonExe, '-m', 'pip')
        }
    }

    return $null
}

function Test-EdgeTtsInstalled {
    if (Test-CommandExists 'edge-tts') {
        return $true
    }

    foreach ($pythonDir in Get-InstalledPythonDirs) {
        $edgeExe = Join-Path $pythonDir 'Scripts\edge-tts.exe'
        if ((Test-Path $edgeExe) -and (Test-LauncherCommand $edgeExe @('--help'))) {
            return $true
        }

        $pythonExe = Join-Path $pythonDir 'python.exe'
        if ((Test-Path $pythonExe) -and (Test-LauncherCommand $pythonExe @('-m', 'edge_tts', '--help'))) {
            return $true
        }
    }

    if ((Test-CommandExists 'py') -and (Test-LauncherCommand 'py' @('-m', 'edge_tts', '--help'))) {
        return $true
    }

    if ((Test-CommandExists 'python') -and (Test-LauncherCommand 'python' @('-m', 'edge_tts', '--help'))) {
        return $true
    }

    return $false
}

function Get-EdgeTtsRuntimeLabel {
    if ((Test-CommandExists 'edge-tts') -and (Test-LauncherCommand 'edge-tts' @('--help'))) {
        return (Get-CommandLocation 'edge-tts')
    }

    foreach ($pythonDir in Get-InstalledPythonDirs) {
        $edgeExe = Join-Path $pythonDir 'Scripts\edge-tts.exe'
        if ((Test-Path $edgeExe) -and (Test-LauncherCommand $edgeExe @('--help'))) {
            return $edgeExe
        }

        $pythonExe = Join-Path $pythonDir 'python.exe'
        if ((Test-Path $pythonExe) -and (Test-LauncherCommand $pythonExe @('-m', 'edge_tts', '--help'))) {
            return "$pythonExe -m edge_tts"
        }
    }

    if ((Test-CommandExists 'py') -and (Test-LauncherCommand 'py' @('-m', 'edge_tts', '--help'))) {
        return 'py -m edge_tts'
    }

    if ((Test-CommandExists 'python') -and (Test-LauncherCommand 'python' @('-m', 'edge_tts', '--help'))) {
        return 'python -m edge_tts'
    }

    return $null
}

function Get-DotEnvValue($path, $key) {
    if (-not (Test-Path -LiteralPath $path)) {
        return $null
    }

    $match = Select-String -Path $path -Pattern "^\s*$([regex]::Escape($key))=(.*)$" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $match) {
        return $null
    }

    return $match.Matches[0].Groups[1].Value.Trim()
}

function Test-PlaceholderValue($value) {
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $true
    }

    return $value -match '^your_.*_here$' -or $value -eq 'https://your-domain.example'
}

function Get-PortalHealth($url) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        $data = $response.Content | ConvertFrom-Json -ErrorAction Stop
        if ($data.status -eq 'ok') {
            return $data
        }
    } catch {
        return $null
    }

    return $null
}

function Get-ListeningProcessInfo($localPort) {
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
        return $null
    }

    try {
        $connection = Get-NetTCPConnection -LocalPort $localPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if (-not $connection) {
            return $null
        }

        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        return [PSCustomObject]@{
            ProcessId = $connection.OwningProcess
            ProcessName = if ($process) { $process.ProcessName } else { 'Unknown' }
        }
    } catch {
        return $null
    }
}

function Wait-ForServer($url, $timeoutSeconds = 90) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        if (Get-PortalHealth $url) {
            return $true
        }

        Start-Sleep -Seconds 2
    }

    return $false
}

function Show-EnvironmentSummary($envPath) {
    Write-Step 'Current setup summary'
    Write-StatusLine 'Project folder' $repoRoot 'Gray'
    Write-StatusLine 'Portal URL' $baseUrl 'Gray'
    Write-StatusLine 'Health URL' $healthUrl 'Gray'

    $envState = if (Test-Path -LiteralPath $envPath) { 'Present' } else { 'Missing' }
    $envStateColor = if ($envState -eq 'Present') { 'Green' } else { 'Yellow' }
    Write-StatusLine '.env file' $envState $envStateColor

    $pexelsValue = Get-DotEnvValue $envPath 'PEXELS_API_KEY'
    if (Test-PlaceholderValue $pexelsValue) {
        Write-StatusLine 'PEXELS_API_KEY' 'Not configured yet' 'Yellow'
        Write-InfoMessage 'You can save the Pexels key later from the browser setup form.'
    } else {
        Write-StatusLine 'PEXELS_API_KEY' 'Configured' 'Green'
    }

    $publicBaseUrl = Get-DotEnvValue $envPath 'PUBLIC_BASE_URL'
    if (Test-PlaceholderValue $publicBaseUrl) {
        Write-StatusLine 'PUBLIC_BASE_URL' 'Local-only mode' 'Gray'
    } else {
        Write-StatusLine 'PUBLIC_BASE_URL' $publicBaseUrl 'Green'
    }
}

function Show-ToolSummary($pipLauncher, $nodeModulesPath) {
    $nodeVersion = Invoke-QuietCommand 'node' @('--version')
    $npmVersion = Invoke-QuietCommand 'npm' @('--version')
    $pythonCommand = $pipLauncher[0]
    $pythonVersion = Invoke-QuietCommand $pythonCommand @('--version')
    $edgeTtsRuntime = Get-EdgeTtsRuntimeLabel
    $nodeLocation = Get-CommandLocation 'node'
    $npmLocation = Get-CommandLocation 'npm'
    $nodeLabel = if ($nodeVersion) { "$nodeVersion ($nodeLocation)" } else { "Ready ($nodeLocation)" }
    $npmLabel = if ($npmVersion) { "$npmVersion ($npmLocation)" } else { "Ready ($npmLocation)" }
    $pythonLabel = if ($pythonVersion) { "$pythonVersion ($pythonCommand)" } else { $pythonCommand }
    $edgeTtsLabel = if ($edgeTtsRuntime) { "Ready ($edgeTtsRuntime)" } else { 'Not detected yet' }
    $edgeTtsColor = if ($edgeTtsRuntime) { 'Green' } else { 'Yellow' }
    $nodeModulesInstalled = Test-Path -LiteralPath $nodeModulesPath
    $nodeModulesLabel = if ($nodeModulesInstalled) { 'Installed' } else { 'Missing' }
    $nodeModulesColor = if ($nodeModulesInstalled) { 'Green' } else { 'Yellow' }

    Write-Step 'Detected tools'
    Write-StatusLine 'Node.js' $nodeLabel 'Green'
    Write-StatusLine 'npm' $npmLabel 'Green'
    Write-StatusLine 'Python' $pythonLabel 'Green'
    Write-StatusLine 'Edge-TTS' $edgeTtsLabel $edgeTtsColor
    Write-StatusLine 'Node modules' $nodeModulesLabel $nodeModulesColor
}

function Show-UsageGuide {
    Write-Step 'Ways to use this project'
    Write-Host '  1. Browser portal' -ForegroundColor Cyan
    Write-InfoMessage "Open $baseUrl"
    Write-InfoMessage 'Best for normal users: paste a script, generate, then watch or download the MP4.'
    Write-Host '  2. One-click launchers' -ForegroundColor Cyan
    Write-InfoMessage '.\Start-Automated-Video-Generator.bat'
    Write-InfoMessage '.\Start-Automated-Video-Generator.ps1'
    Write-Host '  3. Batch CLI generation' -ForegroundColor Cyan
    Write-InfoMessage 'Edit input\input-scripts.json and run: npm run generate'
    Write-InfoMessage 'Resume interrupted jobs with: npm run resume'
    Write-Host '  4. Remotion preview' -ForegroundColor Cyan
    Write-InfoMessage 'Run: npm run remotion:studio'
    Write-Host '  5. MCP server for AI tools' -ForegroundColor Cyan
    Write-InfoMessage 'Run: npm run mcp'
}

try {
    Assert-RequiredFile (Join-Path $repoRoot 'package.json') 'package.json'
    Assert-RequiredFile (Join-Path $repoRoot 'requirements.txt') 'requirements.txt'
    $envPath = Join-Path $repoRoot '.env'
    $envExamplePath = Join-Path $repoRoot '.env.example'
    $nodeModulesPath = Join-Path $repoRoot 'node_modules'

    Write-Step 'Launcher context'
    Write-StatusLine 'Repository root' $repoRoot 'Gray'
    Write-StatusLine 'Requested port' $port 'Gray'
    Write-StatusLine 'Launcher' $PSCommandPath 'Gray'

    $existingPortal = Get-PortalHealth $healthUrl
    if ($existingPortal) {
        Write-Step "A portal is already running at $baseUrl"
        Start-Process $baseUrl
        Write-SuccessMessage 'The browser portal is ready.'
        Write-SuccessMessage 'Paste a script, wait for the job page, then watch or download the MP4.'
        Show-EnvironmentSummary $envPath
        Show-UsageGuide
        return
    }

    Write-Step "Checking required tools"
    Ensure-WingetPackage 'Node.js LTS' 'node' @('--version') 'OpenJS.NodeJS.LTS'
    Ensure-WingetPackage 'npm' 'npm' @('--version') 'OpenJS.NodeJS.LTS'

    if (-not (Test-CommandExists 'py') -and -not (Test-CommandExists 'python') -and -not (Get-PythonLauncher)) {
        if (-not (Test-CommandExists 'winget')) {
            throw 'Python 3 is required, but winget is not available on this PC. Install Python 3 manually and run the launcher again.'
        }

        Write-Step 'Installing Python 3 with winget'
        Invoke-ExternalCommand 'winget' @(
            'install',
            '--id', 'Python.Python.3.12',
            '--exact',
            '--accept-package-agreements',
            '--accept-source-agreements',
            '--silent'
        ) 'Python 3 installation failed'
        Refresh-Path
    }

    $pipLauncher = Get-PythonLauncher
    if (-not $pipLauncher) {
        throw 'Python is installed, but pip could not be started. Reinstall Python 3 or run the manual setup steps from the README.'
    }

    if (-not (Test-Path -LiteralPath $envPath)) {
        Assert-RequiredFile $envExamplePath '.env.example'
        Write-Step 'Creating .env from .env.example'
        Copy-Item $envExamplePath $envPath
        Write-StatusLine '.env file' "Created at $envPath" 'Green'
    } else {
        Write-StatusLine '.env file' "Already present at $envPath" 'Green'
    }

    if (-not (Test-Path -LiteralPath $nodeModulesPath)) {
        Write-Step 'Installing Node.js dependencies'
        Invoke-ExternalCommand 'npm' @('install') 'npm install failed'
        Write-StatusLine 'Node dependencies' 'Installed successfully' 'Green'
    } else {
        Write-StatusLine 'Node dependencies' 'Already installed' 'Green'
    }

    if (-not (Test-EdgeTtsInstalled)) {
        Write-Step 'Installing Python voice dependencies'
        $pipArgs = @()
        if ($pipLauncher.Length -gt 1) {
            $pipArgs += $pipLauncher[1..($pipLauncher.Length - 1)]
        }
        $pipArgs += @('install', '-r', 'requirements.txt')
        Invoke-ExternalCommand $pipLauncher[0] $pipArgs 'Python dependency installation failed'
        Write-StatusLine 'Python voice deps' 'Installed successfully' 'Green'
    } else {
        Write-StatusLine 'Python voice deps' 'Already installed' 'Green'
    }

    Show-ToolSummary $pipLauncher $nodeModulesPath
    Show-EnvironmentSummary $envPath

    $portProcess = Get-ListeningProcessInfo ([int]$port)
    if ($portProcess) {
        throw "Port $port is already in use by $($portProcess.ProcessName) (PID $($portProcess.ProcessId)). Stop that app or set PORT to a different value before launching."
    }

    Write-Step 'Starting the web portal'
    $serverCommand = "Set-Location '$repoRoot'; npm run dev"
    Write-InfoMessage "A new PowerShell window will open and run: npm run dev"
    $portalProcess = Start-Process powershell.exe -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $serverCommand -PassThru

    if (Wait-ForServer $healthUrl 120) {
        Write-Step "Opening $baseUrl"
        Start-Process $baseUrl
        Write-SuccessMessage 'The browser portal is ready.'
        Write-SuccessMessage 'Paste a script, wait for the job page, then watch or download the MP4.'
        Show-UsageGuide
        return
    }

    if ($portalProcess.HasExited) {
        throw "The portal window closed before startup completed. Exit code: $($portalProcess.ExitCode). Check the opened PowerShell window for details."
    }

    Write-WarnMessage "The portal is still starting. If the browser did not open automatically, visit $baseUrl"
    Write-WarnMessage 'If startup keeps failing, check the opened PowerShell window for the exact error message.'
} catch {
    Write-Host ""
    Write-Host "SETUP FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host 'Helpful next steps:' -ForegroundColor Yellow
    Write-Host '  1. Read README.md for the manual installation steps.' -ForegroundColor Yellow
    Write-Host '  2. In PowerShell, run .\Start-Automated-Video-Generator.bat from the repo root.' -ForegroundColor Yellow
    Write-Host '  3. If Python is broken, reinstall Python 3 and rerun the launcher.' -ForegroundColor Yellow
    exit 1
}
