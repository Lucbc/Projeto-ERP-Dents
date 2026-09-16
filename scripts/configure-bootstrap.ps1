param(
    [string]$EnvFile = '.env',
    [ValidateSet('BOOTSTRAP_TOKEN', 'HOMOLOG_BOOTSTRAP_TOKEN', 'JWT_SECRET_KEY')]
    [string]$VariableName = 'BOOTSTRAP_TOKEN'
)

$ErrorActionPreference = 'Stop'
$resolvedEnv = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($EnvFile)
if (-not (Test-Path -LiteralPath $resolvedEnv -PathType Leaf)) {
    throw 'Arquivo de ambiente inexistente. Prepare-o a partir de .env.example primeiro.'
}
$contents = [System.IO.File]::ReadAllText($resolvedEnv)
$pattern = '(?m)^[ \t]*' + $VariableName + '[ \t]*=[^\r\n]*'
$entries = [regex]::Matches($contents, $pattern)
if ($entries.Count -gt 1) { throw 'Variavel de ativacao duplicada. Corrija o arquivo antes de continuar.' }
if ($entries.Count -eq 1) {
    $existingValue = ($entries[0].Value -split '=', 2)[1].Trim()
    if ($existingValue.Length -gt 0) {
        Write-Host "Codigo existente preservado em $resolvedEnv (variavel $VariableName)."
        return
    }
}
$bytes = New-Object byte[] 32
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
$secret = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
$entry = $VariableName + '=' + $secret
if ($entries.Count -eq 1) {
    $contents = [regex]::Replace($contents, $pattern, $entry)
} else {
    $contents = $contents.TrimEnd("`r", "`n") + "`n" + $entry + "`n"
}
[System.IO.File]::WriteAllText($resolvedEnv, $contents, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Codigo de ativacao gerado em $resolvedEnv (variavel $VariableName)."
if ($VariableName -eq 'JWT_SECRET_KEY') {
    Write-Host 'Mantenha esta chave no servidor. Ela assina as sessoes; nao publique nem remova apos a ativacao.'
} else {
    Write-Host 'Use esse valor somente na primeira configuracao. Nao publique o arquivo de ambiente.'
}
