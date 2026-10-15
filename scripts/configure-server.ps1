param(
    [Parameter(Mandatory = $true)]
    [string]$PublicOrigin,
    [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) '.env')
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Este preparador requer Windows para proteger as permissoes do arquivo.'
}
# Restrict to a single ASCII DNS name or IPv4 address; no credentials, paths,
# query, fragment, substitutions or newlines can enter the Compose env file.
if ($PublicOrigin -cnotmatch '^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?$') {
    throw 'Informe somente https://nome-ou-ip, com porta opcional, sem barra final.'
}
$originUri = $null
if (-not [Uri]::TryCreate($PublicOrigin, [UriKind]::Absolute, [ref]$originUri)) {
    throw 'Endereco HTTPS invalido.'
}
if ($originUri.Port -lt 1 -or $originUri.Port -gt 65535) { throw 'Porta HTTPS invalida.' }
if ($originUri.Host.Length -gt 253) { throw 'Nome de servidor muito longo.' }
foreach ($label in $originUri.Host.Split('.')) {
    if ($label -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$') {
        throw 'Nome de servidor invalido.'
    }
}
$canonicalOrigin = $originUri.GetLeftPart([UriPartial]::Authority)
$target = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($EnvFile)
if (Test-Path -LiteralPath $target) {
    throw 'Configuracao existente preservada. Este comando serve apenas para instalacao nova; nao apague o arquivo para atualizar.'
}
$parent = Split-Path -Parent $target
if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    throw 'A pasta de destino deve existir antes de preparar a configuracao.'
}

function New-ServerSecret {
    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

$dbSecret = New-ServerSecret
$jwtSecret = New-ServerSecret
$bootstrapSecret = New-ServerSecret
$contents = @"
POSTGRES_DB=erp_dents
POSTGRES_USER=erp_user
POSTGRES_PASSWORD=$dbSecret
DATABASE_URL=postgresql+psycopg://erp_user:${dbSecret}@db:5432/erp_dents
JWT_SECRET_KEY=$jwtSecret
JWT_EXPIRE_MINUTES=480
BOOTSTRAP_TOKEN=$bootstrapSecret
PUBLIC_ORIGIN=$canonicalOrigin
CORS_ORIGINS=$canonicalOrigin
HTTPS_PORT=$($originUri.Port)
TLS_DIRECTORY=./.data/tls/prod
EXAMS_BASE_PATH=/data/exams
EXAM_MAX_BYTES=20971520
EXAM_QUOTA_BYTES=53687091200
TZ=America/Sao_Paulo
"@

# Write secrets only after restricting ACL. Move within the same directory keeps
# that ACL and refuses an existing destination, including a concurrent creation.
$temporary = Join-Path $parent ('.server-config-' + [Guid]::NewGuid().ToString('N') + '.tmp')
try {
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    $stream.Dispose()
    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($sid in @($currentUser, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $temporary -AclObject $acl
    [IO.File]::WriteAllText($temporary, $contents + "`n", (New-Object Text.UTF8Encoding($false)))
    [IO.File]::Move($temporary, $target)
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
}
Write-Host 'Configuracao inicial criada com segredos exclusivos e acesso restrito ao usuario atual, SYSTEM e administradores.'
Write-Host 'Nenhum container iniciado. Prepare o certificado HTTPS antes de subir o servidor. Nao publique o arquivo gerado.'
