$ErrorActionPreference = 'Stop'
$backendDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'Backend'
$healthUrl = 'http://localhost:3000/api/health'

$listeners = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
if ($listeners) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
        if ($health.status -eq 'ok' -and $health.database -eq 'connected') {
            Write-Output 'VI[Backend] READY http://localhost:3000 (backend existente reutilizado; MongoDB conectado)'
            exit 0
        }
    } catch {
        throw "El puerto 3000 está ocupado, pero el backend ViMod no respondió health correctamente. No se iniciará otro backend. $($_.Exception.Message)"
    }
    throw 'El puerto 3000 está ocupado por un servicio que no reporta MongoDB conectado. No se iniciará otro backend.'
}

if (-not (Test-Path (Join-Path $backendDirectory 'package.json'))) {
    throw "No se encontró package.json en $backendDirectory"
}

$arguments = '/d /c npm.cmd start'
$backendProcess = Start-Process -FilePath $env:ComSpec -ArgumentList $arguments -WorkingDirectory $backendDirectory -NoNewWindow -PassThru
Write-Output "VI[Backend] STARTING PID $($backendProcess.Id) (npm start)"

while (-not $backendProcess.HasExited) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        if ($health.status -eq 'ok' -and $health.database -eq 'connected') {
            Write-Output 'VI[Backend] READY http://localhost:3000 (MongoDB conectado)'
            $backendProcess.WaitForExit()
            exit $backendProcess.ExitCode
        }
    } catch {
    }

    if ($backendProcess.WaitForExit(500)) { break }
}

throw "npm start terminó antes de que health confirmara MongoDB (código $($backendProcess.ExitCode))."