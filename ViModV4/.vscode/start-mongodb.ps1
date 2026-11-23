$ErrorActionPreference = 'Stop'

$mongoExe = 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe'
$dataDirectory = 'C:\ViModMongo\data'
$logDirectory = 'C:\ViModMongo\logs'
$logFile = Join-Path $logDirectory 'mongod.log'
$port = 27021

function Get-PortListeners {
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
}

$listeners = Get-PortListeners
if ($listeners) {
    foreach ($listener in $listeners) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if (-not $process -or $process.ProcessName -ne 'mongod') {
            throw "El puerto $port ya está ocupado por PID $($listener.OwningProcess) ($($process.ProcessName)). No se iniciará otra instancia."
        }
    }
    Write-Output "VI[MongoDB] READY 127.0.0.1:$port (mongod existente reutilizado)"
    exit 0
}

if (-not (Test-Path $mongoExe)) { throw "No se encontró mongod: $mongoExe" }
if (-not (Test-Path $dataDirectory)) { throw "No existe el directorio de datos: $dataDirectory" }
if (-not (Test-Path $logDirectory)) { throw "No existe el directorio de logs: $logDirectory" }

$arguments = "--dbpath `"$dataDirectory`" --bind_ip 127.0.0.1 --port $port --logpath `"$logFile`" --logappend"
$mongoProcess = Start-Process -FilePath $mongoExe -ArgumentList $arguments -WorkingDirectory (Split-Path $mongoExe) -NoNewWindow -PassThru
Write-Output "VI[MongoDB] STARTING PID $($mongoProcess.Id)"

while (-not $mongoProcess.HasExited) {
    if (Get-PortListeners) {
        Write-Output "VI[MongoDB] READY 127.0.0.1:$port"
        $mongoProcess.WaitForExit()
        if ($mongoProcess.ExitCode -ne 0) {
            Get-Content $logFile -Tail 30 -ErrorAction SilentlyContinue
            exit $mongoProcess.ExitCode
        }
        exit 0
    }

    if ($mongoProcess.WaitForExit(500)) { break }
}

Get-Content $logFile -Tail 30 -ErrorAction SilentlyContinue
throw "mongod terminó antes de escuchar en 127.0.0.1:$port (código $($mongoProcess.ExitCode))."