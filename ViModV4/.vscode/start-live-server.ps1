$ErrorActionPreference = 'Stop'
$port = 5500
$workspaceDirectory = Split-Path $PSScriptRoot -Parent

$listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($listeners) {
    foreach ($listener in $listeners) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if ($process -and $process.CommandLine -like '*start-live-server.js*ViModV4*') {
            Write-Output "VI[LiveServer] READY http://localhost:$port (servidor existente reutilizado)"
            exit 0
        }
        $name = if ($process) { $process.Name } else { 'proceso desconocido' }
        throw "El puerto $port está ocupado por $name (PID $($listener.OwningProcess)). No se cerrará ni se iniciará otro servidor; verifica ese proceso y libera el puerto para Live Server."
    }
}

$entryPoint = Join-Path $PSScriptRoot 'start-live-server.js'
if (-not (Test-Path $entryPoint)) { throw "No se encontró $entryPoint" }
Write-Output "VI[LiveServer] STARTING root $workspaceDirectory"
& node.exe $entryPoint $workspaceDirectory
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }