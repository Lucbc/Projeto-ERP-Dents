# Integration failure injection: fictional homolog data only. Leaves failed copy
# for inspection; API must be restarted and no complete manifest may be advertised.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $root ('.data/backup-failure-test-' + [Guid]::NewGuid().ToString('N'))
function git { $global:LASTEXITCODE = 1 }
$rejected = $false
try {
    & (Join-Path $PSScriptRoot 'backup-server.ps1') -Environment homolog -Destination $destination
} catch {
    if ($_.Exception.Message -notmatch 'versao do codigo') { throw }
    $rejected = $true
}
if (-not $rejected) { throw 'Expected late-stage backup failure.' }
if (-not (Test-Path -LiteralPath (Join-Path $destination 'INCOMPLETE'))) { throw 'Incomplete copy not marked.' }
if (Test-Path -LiteralPath (Join-Path $destination 'manifest.json')) { throw 'Failed copy advertised as complete.' }
$running = & docker inspect --format '{{.State.Running}}' erp-dents-homolog-api-1
if ($LASTEXITCODE -ne 0 -or $running -ne 'true') { throw 'API was not restarted.' }
$acl = Get-Acl -LiteralPath (Join-Path $destination 'server.env')
$allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
foreach ($rule in $acl.Access) {
    if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { throw 'Unexpected backup access.' }
}
Write-Host 'PASS: injected failure, incomplete marker, no completed manifest, restricted config and API restarted. Failed copy retained locally.'
