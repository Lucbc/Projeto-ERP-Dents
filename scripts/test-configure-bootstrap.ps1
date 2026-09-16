$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $projectRoot ('.data/bootstrap-script-' + [Guid]::NewGuid().ToString('N'))
$testEnv = Join-Path $testRoot 'sample.env'
$duplicateEnv = Join-Path $testRoot 'duplicate.env'
$generatorScript = Join-Path $PSScriptRoot 'configure-bootstrap.ps1'
$utf8 = New-Object System.Text.UTF8Encoding($false)
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    [IO.File]::WriteAllText($testEnv, "EXISTING_SETTING=preserve`nBOOTSTRAP_TOKEN=`n", $utf8)
    & $generatorScript -EnvFile $testEnv
    $contents = [IO.File]::ReadAllText($testEnv)
    if ($contents -notmatch '(?m)^BOOTSTRAP_TOKEN=[a-f0-9]{64}\r?$') { throw 'Invalid generated code' }
    if (-not $contents.Contains('EXISTING_SETTING=preserve')) { throw 'Existing setting lost' }
    & $generatorScript -EnvFile $testEnv
    if ([IO.File]::ReadAllText($testEnv) -ne $contents) { throw 'Repeated execution changed existing settings' }
    & $generatorScript -EnvFile $testEnv -VariableName HOMOLOG_BOOTSTRAP_TOKEN
    $updated = [IO.File]::ReadAllText($testEnv)
    if ($updated -notmatch '(?m)^HOMOLOG_BOOTSTRAP_TOKEN=[a-f0-9]{64}\r?$') { throw 'Missing homologation code' }
    if (-not $updated.StartsWith($contents.TrimEnd("`r", "`n"))) { throw 'Append changed existing settings' }
    $codes = [regex]::Matches($updated, '(?m)^(?:HOMOLOG_)?BOOTSTRAP_TOKEN=([a-f0-9]{64})')
    if ($codes[0].Groups[1].Value -eq $codes[1].Groups[1].Value) { throw 'Codes unexpectedly identical' }
    [IO.File]::WriteAllText($duplicateEnv, "BOOTSTRAP_TOKEN=`nBOOTSTRAP_TOKEN=`n", $utf8)
    $rejected = $false
    try { & $generatorScript -EnvFile $duplicateEnv } catch { $rejected = $true }
    if (-not $rejected) { throw 'Duplicate variables were accepted' }
    Write-Host 'OK: generation, blank value, preservation, idempotence, separate codes and duplicate rejection.'
} finally {
    # Only the two files created above; no recursive deletion or unrelated paths.
    if (Test-Path -LiteralPath $testEnv) { Remove-Item -LiteralPath $testEnv }
    if (Test-Path -LiteralPath $duplicateEnv) { Remove-Item -LiteralPath $duplicateEnv }
    Remove-Item -LiteralPath $testRoot
}
