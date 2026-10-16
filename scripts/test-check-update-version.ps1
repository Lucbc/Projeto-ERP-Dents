# Real Git repositories with fictional content only; no Docker or existing repository mutation.
$ErrorActionPreference = 'Stop'
$checker = Join-Path $PSScriptRoot 'check-update-version.ps1'
$workspace = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $workspace ('.data/update-version-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixture
function Invoke-FixtureGit {
    param([string[]]$Arguments)
    $result = & git -C $fixture @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Falha na preparacao do repositorio ficticio.' }
    return ($result -join "`n").Trim()
}
function Assert-Check {
    param([string]$Case, [string]$Tag, [bool]$ShouldPass)
    $headBefore = Invoke-FixtureGit @('rev-parse', 'HEAD')
    $statusBefore = Invoke-FixtureGit @('status', '--porcelain=v1', '--untracked-files=all')
    $refsBefore = Invoke-FixtureGit @('show-ref')
    $passed = $true
    try { & $checker -TargetTag $Tag -Repository $fixture } catch { $passed = $false }
    if ($passed -ne $ShouldPass) { throw ('Resultado inesperado: ' + $Case) }
    if ($headBefore -ne (Invoke-FixtureGit @('rev-parse', 'HEAD')) -or
        $statusBefore -ne (Invoke-FixtureGit @('status', '--porcelain=v1', '--untracked-files=all')) -or
        $refsBefore -ne (Invoke-FixtureGit @('show-ref'))) { throw 'A conferencia alterou o repositorio.' }
    Write-Host ('PASS: ' + $Case + '; HEAD, estado e referencias preservados.')
}
$null = Invoke-FixtureGit @('init', '-q')
$null = Invoke-FixtureGit @('config', 'user.name', 'Fictitious Test')
$null = Invoke-FixtureGit @('config', 'user.email', 'fictitious@example.invalid')
$null = New-Item -ItemType Directory -Path (Join-Path $fixture 'scripts'), (Join-Path $fixture 'docs')
foreach ($path in @('docker-compose.yml', 'scripts/backup-server.ps1', 'docs/INSTALACAO-CLINICA-WINDOWS.md')) {
    Set-Content -LiteralPath (Join-Path $fixture $path) -Value 'Fictitious fixture only'
}
$null = Invoke-FixtureGit @('add', '.')
$null = Invoke-FixtureGit @('commit', '-qm', 'fixture base')
$null = Invoke-FixtureGit @('tag', '-a', 'piloto-cadastros-v0.1.0', '-m', 'fixture')
$base = Invoke-FixtureGit @('rev-parse', 'HEAD')
Set-Content -LiteralPath (Join-Path $fixture 'change.txt') -Value 'Fictitious change'
$null = Invoke-FixtureGit @('add', '.')
$null = Invoke-FixtureGit @('commit', '-qm', 'fixture update')
$null = Invoke-FixtureGit @('tag', '-a', 'piloto-cadastros-v0.1.1', '-m', 'fixture')
Assert-Check 'same version' 'piloto-cadastros-v0.1.1' $true
Assert-Check 'rollback refused' 'piloto-cadastros-v0.1.0' $false
$null = Invoke-FixtureGit @('checkout', '-q', '--detach', $base)
Assert-Check 'forward from detached tag' 'piloto-cadastros-v0.1.1' $true
Assert-Check 'missing tag' 'piloto-cadastros-v9.9.9' $false
Assert-Check 'invalid reference' '--all' $false
$localFile = Join-Path $fixture 'local.txt'
Set-Content -LiteralPath $localFile -Value 'Fictitious local file to preserve'
Assert-Check 'untracked file refused' 'piloto-cadastros-v0.1.1' $false
$null = Invoke-FixtureGit @('add', 'local.txt')
Assert-Check 'staged change refused' 'piloto-cadastros-v0.1.1' $false
$null = Invoke-FixtureGit @('commit', '-qm', 'fixture divergent')
Assert-Check 'divergent history refused' 'piloto-cadastros-v0.1.1' $false
Add-Content -LiteralPath (Join-Path $fixture 'docker-compose.yml') -Value 'Fictitious local edit'
Assert-Check 'tracked edit refused' 'piloto-cadastros-v0.1.1' $false
Write-Host 'PASS: 9 scenarios. Fictional repository retained in .data; no production resources accessed.'
