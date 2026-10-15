$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $root ('.data/tls-script-test-' + [Guid]::NewGuid().ToString('N'))
$prepare = Join-Path $PSScriptRoot 'configure-server-tls.ps1'
$openssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
New-Item -ItemType Directory -Path $testRoot | Out-Null
$targets = @()
function Assert-Rejected {
    param([scriptblock]$Operation)
    $rejected = $false
    try { & $Operation } catch { $rejected = $true }
    if (-not $rejected) { throw 'Expected rejection.' }
}
try {
    $invalidTarget = Join-Path $testRoot 'invalid'
    foreach ($invalid in @('http://erp.example.test', 'https://erp.example.test/', "https://erp.example.test`nDNS:evil", 'https://erp.example.test:0', 'https://-bad.test')) {
        Assert-Rejected { & $prepare -PublicOrigin $invalid -OutputDirectory $invalidTarget }
    }
    Assert-Rejected { & $prepare -PublicOrigin 'https://erp.example.test' -OutputDirectory $invalidTarget -OpenSslPath (Join-Path $testRoot 'missing.exe') }
    if (Test-Path -LiteralPath $invalidTarget) { throw 'Invalid preparation created destination.' }
    foreach ($origin in @('https://erp.example.test:8443', 'https://192.0.2.10')) {
        $target = Join-Path $testRoot ('bundle-' + $targets.Count)
        $targets += $target
        & $prepare -PublicOrigin $origin -OutputDirectory $target
        $names = @(Get-ChildItem -LiteralPath $target | Select-Object -ExpandProperty Name)
        if (($names | Sort-Object) -join ',' -ne 'ca.crt,server.crt,server.key') { throw 'Unexpected TLS material retained.' }
        $hashes = @{}
        foreach ($name in $names) { $hashes[$name] = (Get-FileHash -LiteralPath (Join-Path $target $name)).Hash }
        $acl = Get-Acl -LiteralPath $target
        if (-not $acl.AreAccessRulesProtected) { throw 'Directory ACL not protected.' }
        $allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
        foreach ($rule in (Get-Acl -LiteralPath (Join-Path $target 'server.key')).Access) {
            if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { throw 'Unexpected key access.' }
        }
        Assert-Rejected { & $prepare -PublicOrigin $origin -OutputDirectory $target }
        foreach ($name in $names) {
            if ((Get-FileHash -LiteralPath (Join-Path $target $name)).Hash -ne $hashes[$name]) { throw 'Existing bundle changed.' }
        }
        $previous = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $openssl verify -CAfile (Join-Path $target 'ca.crt') -verify_hostname wrong.example.test (Join-Path $target 'server.crt') 1>$null 2>$null
            $wrongHostExit = $LASTEXITCODE
            & $openssl x509 -in (Join-Path $target 'server.crt') -checkend 34560000 -noout 1>$null 2>$null
            $expiryExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previous }
        if ($wrongHostExit -eq 0 -or $expiryExit -eq 0) { throw 'Hostname or expiry checks failed.' }
    }
    $partial = Join-Path $testRoot 'partial'
    $targets += $partial
    New-Item -ItemType Directory -Path $partial | Out-Null
    [IO.File]::WriteAllText((Join-Path $partial 'server.crt'), 'fixture')
    Assert-Rejected { & $prepare -PublicOrigin 'https://erp.example.test' -OutputDirectory $partial }
    if ([IO.File]::ReadAllText((Join-Path $partial 'server.crt')) -ne 'fixture') { throw 'Partial bundle overwritten.' }
    Write-Host 'PASS: DNS/IP issuance, chain/name/key/expiry validation, protected key, existing/partial preservation, invalid inputs and missing OpenSSL.'
} finally {
    foreach ($target in $targets) {
        foreach ($name in @('server.crt', 'server.key', 'ca.crt')) {
            $path = Join-Path $target $name
            if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
        }
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
    }
    Remove-Item -LiteralPath $testRoot
}
