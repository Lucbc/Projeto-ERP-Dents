param(
    [Parameter(Mandatory = $true)][string]$PublicOrigin,
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.data/tls/prod'),
    [string]$OpenSslPath = 'C:\Program Files\Git\usr\bin\openssl.exe'
)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Este preparador requer Windows.' }
if ($PublicOrigin -cnotmatch '^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?$') { throw 'Use uma origem HTTPS DNS/IPv4 sem barra final.' }
$uri = $null
if (-not [Uri]::TryCreate($PublicOrigin, [UriKind]::Absolute, [ref]$uri)) { throw 'Origem invalida.' }
if ($uri.Port -lt 1 -or $uri.Port -gt 65535 -or $uri.Host.Length -gt 253) { throw 'Origem invalida.' }
foreach ($label in $uri.Host.Split('.')) {
    if ($label -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$') { throw 'Nome invalido.' }
}
if (-not (Test-Path -LiteralPath $OpenSslPath -PathType Leaf)) { throw 'OpenSSL nao encontrado. Use o incluido no Git para Windows ou informe -OpenSslPath.' }
$target = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
if (Test-Path -LiteralPath $target) { throw 'Destino existente preservado, mesmo se vazio/incompleto. Use outra pasta para preparar renovacao.' }
$parent = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$staging = Join-Path $parent ('.tls-preparation-' + [Guid]::NewGuid().ToString('N'))
$files = @('ca.key', 'ca.crt', 'server.key', 'server.csr', 'extensions.cnf', 'server.crt')
function Invoke-TlsOpenSsl {
    param([string[]]$Arguments)
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $OpenSslPath @Arguments 2>$null
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw 'Falha no preparo/validacao TLS. Nenhum certificado existente foi substituido.' }
    return ($output -join "`n")
}
try {
    New-Item -ItemType Directory -Path $staging | Out-Null
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    }
    Set-Acl -LiteralPath $staging -AclObject $acl
    $caKey = Join-Path $staging 'ca.key'
    $caCert = Join-Path $staging 'ca.crt'
    $serverKey = Join-Path $staging 'server.key'
    $csr = Join-Path $staging 'server.csr'
    $cert = Join-Path $staging 'server.crt'
    $extensions = Join-Path $staging 'extensions.cnf'
    $san = 'DNS:' + $uri.Host
    $nameOption = '-verify_hostname'
    if ($uri.HostNameType -eq [UriHostNameType]::IPv4) { $san = 'IP:' + $uri.Host; $nameOption = '-verify_ip' }
    $caName = '/CN=ERP Dents Local ' + [Guid]::NewGuid().ToString('N')
    $null = Invoke-TlsOpenSsl @('req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '730', '-subj', $caName, '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', $caKey, '-out', $caCert)
    $null = Invoke-TlsOpenSsl @('req', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-subj', '/CN=ERP Dents Server', '-keyout', $serverKey, '-out', $csr)
    [IO.File]::WriteAllText($extensions, "basicConstraints=critical,CA:FALSE`nkeyUsage=critical,digitalSignature,keyEncipherment`nextendedKeyUsage=serverAuth`nsubjectAltName=$san`n", [Text.Encoding]::ASCII)
    $serial = '0x' + [Guid]::NewGuid().ToString('N')
    $null = Invoke-TlsOpenSsl @('x509', '-req', '-in', $csr, '-CA', $caCert, '-CAkey', $caKey, '-set_serial', $serial, '-days', '365', '-sha256', '-extfile', $extensions, '-out', $cert)
    $null = Invoke-TlsOpenSsl @('verify', '-CAfile', $caCert, '-purpose', 'sslserver', $nameOption, $uri.Host, $cert)
    $null = Invoke-TlsOpenSsl @('x509', '-in', $cert, '-checkend', '2592000', '-noout')
    $certPublic = Invoke-TlsOpenSsl @('x509', '-in', $cert, '-pubkey', '-noout')
    $keyPublic = Invoke-TlsOpenSsl @('pkey', '-in', $serverKey, '-pubout')
    if ($certPublic -ne $keyPublic) { throw 'Certificado e chave nao correspondem.' }
    # This dedicated authority cannot issue further certificates: its key is not
    # retained or mounted in nginx. Renewal requires a new bundle and trust rollout.
    foreach ($name in @('ca.key', 'server.csr', 'extensions.cnf')) { Remove-Item -LiteralPath (Join-Path $staging $name) }
    [IO.Directory]::Move($staging, $target)
} finally {
    if (Test-Path -LiteralPath $staging) {
        foreach ($name in $files) {
            $path = Join-Path $staging $name
            if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path }
        }
        # No recursive deletion: unexpected files stop cleanup for inspection.
        Remove-Item -LiteralPath $staging
    }
}
Write-Host 'TLS criado e validado para a origem informada (365 dias). Nenhum servico ou repositorio de confianca foi alterado.'
Write-Host 'Distribua somente ca.crt. Nunca distribua server.key. Planeje nova emissao e troca da confianca antes do vencimento.'
