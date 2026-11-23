param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Crear', 'Verificar')]
  [string]$Accion
)

$ErrorActionPreference = 'Stop'
$secretNames = @(
  'VIMOD_ROOT_PWD',
  'VIMOD_APP_PWD',
  'VIMOD_ANALISTA_PWD',
  'VIMOD_CATALOGO_PWD',
  'VIMOD_TEST_PWD'
)
$secureValues = @()
$exitCode = 0

try {
  foreach ($name in $secretNames) {
    $secureValue = Read-Host "Ingrese $name" -AsSecureString
    if ($secureValue.Length -eq 0) {
      $secureValue.Dispose()
      throw "La variable $name no puede estar vacía."
    }

    $secureValues += $secureValue
    $credential = New-Object -TypeName System.Management.Automation.PSCredential -ArgumentList 'temporary', $secureValue
    $plainPassword = $credential.GetNetworkCredential().Password
    [Environment]::SetEnvironmentVariable($name, $plainPassword, 'Process')
    $plainPassword = $null
    $credential = $null
  }

  $scriptName = if ($Accion -eq 'Crear') { 'mongodb-roles.js' } else { 'mongodb-roles-verify.js' }
  $scriptPath = Join-Path $PSScriptRoot $scriptName
  if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "No se encontró el script MongoDB: $scriptPath"
  }

  $mongosh = Get-Command mongosh -ErrorAction Stop
  & $mongosh.Source 'mongodb://127.0.0.1:27021/admin' --quiet --file $scriptPath
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "mongosh terminó con código $exitCode."
  }
} catch {
  Write-Error $_ -ErrorAction Continue
  if ($exitCode -eq 0) {
    $exitCode = 1
  }
} finally {
  foreach ($name in $secretNames) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  foreach ($secureValue in $secureValues) {
    $secureValue.Dispose()
  }
  $plainPassword = $null
  $credential = $null
}

if ($exitCode -ne 0) {
  exit $exitCode
}
