param([switch]$CheckCompose)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $root ('.data/server-config-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$target = Join-Path $testRoot 'fixture.env'
$prepare = Join-Path $PSScriptRoot 'configure-server.ps1'
try {
    foreach ($invalid in @('http://erp.example.test', 'https://erp.example.test/', 'https://user:password@erp.example.test', 'https://erp.example.test/path', 'https://erp.example.test?x=y', 'https://erp.example.test#x', "https://erp.example.test`nEVIL=1", 'https://erp.example.test:0', 'https://erp.example.test:99999', 'https://-invalid.test', 'https://erp..test')) {
        $rejected = $false
        try { & $prepare -PublicOrigin $invalid -EnvFile $target } catch { $rejected = $true }
        if (-not $rejected -or (Test-Path -LiteralPath $target)) { throw 'Invalid input was not safely rejected.' }
    }
    Write-Host 'PASS: invalid origins rejected without file creation.'
    foreach ($origin in @('https://erp.example.test', 'https://192.0.2.10:8443')) {
        $messages = & $prepare -PublicOrigin $origin -EnvFile $target 6>&1
        $contents = [IO.File]::ReadAllText($target)
        $values = @{}
        foreach ($line in ($contents -split "`n")) {
            if ($line.Contains('=')) { $pair = $line.TrimEnd("`r") -split '=', 2; $values[$pair[0]] = $pair[1] }
        }
        foreach ($key in @('POSTGRES_PASSWORD', 'JWT_SECRET_KEY', 'BOOTSTRAP_TOKEN')) {
            if ($values[$key] -notmatch '^[a-f0-9]{64}$') { throw 'Invalid generated secret.' }
            if (($messages -join "`n").Contains($values[$key])) { throw 'Secret exposed in command output.' }
        }
        if (@($values['POSTGRES_PASSWORD'], $values['JWT_SECRET_KEY'], $values['BOOTSTRAP_TOKEN'] | Select-Object -Unique).Count -ne 3) { throw 'Secrets must be independent.' }
        if ($values['DATABASE_URL'] -ne ('postgresql+psycopg://erp_user:' + $values['POSTGRES_PASSWORD'] + '@db:5432/erp_dents')) { throw 'Database credentials inconsistent.' }
        if ($values['PUBLIC_ORIGIN'] -ne $origin -or $values['CORS_ORIGINS'] -ne $origin -or $values['HTTPS_PORT'] -ne ([Uri]$origin).Port.ToString()) { throw 'Origin/port inconsistent.' }
        if ($CheckCompose) {
            $previousPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                # Configuration validation only: no containers or volumes created.
                & docker compose --project-name erp-dents-homolog --env-file $target -f (Join-Path $root 'docker-compose.yml') config --quiet 1>$null 2>$null
                $composeExit = $LASTEXITCODE
            } finally { $ErrorActionPreference = $previousPreference }
            if ($composeExit -ne 0) { throw 'Generated configuration rejected by Compose.' }
        }
        $acl = Get-Acl -LiteralPath $target
        if (-not $acl.AreAccessRulesProtected) { throw 'ACL inheritance was not removed.' }
        $allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
        foreach ($rule in $acl.Access) {
            if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { throw 'Unexpected file access principal.' }
        }
        $rejected = $false
        try { & $prepare -PublicOrigin 'https://other.example.test' -EnvFile $target } catch { $rejected = $true }
        if (-not $rejected -or [IO.File]::ReadAllText($target) -ne $contents) { throw 'Existing file not preserved.' }
        Remove-Item -LiteralPath $target
    }
    Write-Host 'PASS: DNS/IPv4, default/custom port, coherent secrets, private ACL, no secret output and overwrite refusal.'
    if ($CheckCompose) { Write-Host 'PASS: Compose config validation (no services started).' }
} finally {
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
    # Non-recursive removal refuses unexpected leftover files.
    Remove-Item -LiteralPath $testRoot
}
