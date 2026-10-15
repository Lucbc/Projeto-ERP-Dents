$ErrorActionPreference = 'Stop'
$global:erpServerProbeScenario = 'ok'
function docker {
    $global:LASTEXITCODE = 0
    if ($global:erpServerProbeScenario -eq 'offline') { $global:LASTEXITCODE = 1; return }
    if ($args[0] -eq 'info') {
        if ($global:erpServerProbeScenario -eq 'windows') { return 'windows' }
        return 'linux'
    }
    if ($global:erpServerProbeScenario -eq 'old-compose') { return '1.29.2' }
    if ($global:erpServerProbeScenario -eq 'invalid-compose') { return 'unknown' }
    return '2.39.0'
}
foreach ($case in @('ok', 'offline', 'windows', 'old-compose', 'invalid-compose')) {
    $global:erpServerProbeScenario = $case
    $failed = $false
    try { & (Join-Path $PSScriptRoot 'check-server.ps1') } catch { $failed = $true }
    if ($failed -ne ($case -ne 'ok')) { throw "Resultado inesperado: $case" }
    Write-Host "PASS: $case"
}
