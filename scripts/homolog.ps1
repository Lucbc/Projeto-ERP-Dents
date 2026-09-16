param(
    [ValidateSet('up', 'stop', 'status', 'logs')]
    [string]$Action = 'up'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.homolog'
$composePath = Join-Path $projectRoot 'docker-compose.homolog.yml'

function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

if (-not (Test-Path -LiteralPath $envPath)) {
    if ($Action -ne 'up') { throw 'Homologacao ainda nao preparada. Execute com -Action up.' }
    $contents = "HOMOLOG_DB_PASSWORD=$(New-LocalSecret)`nHOMOLOG_JWT_SECRET=$(New-LocalSecret)`n"
    [System.IO.File]::WriteAllText($envPath, $contents, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'Configuracao local de homologacao criada. Segredos preservados em .env.homolog.'
}

if ($Action -eq 'up') {
    & (Join-Path $PSScriptRoot 'configure-bootstrap.ps1') -EnvFile $envPath -VariableName 'HOMOLOG_BOOTSTRAP_TOKEN'
}

# Nome explícito evita que COMPOSE_PROJECT_NAME de outro ambiente redirecione os testes.
$composeArgs = @('compose', '--project-name', 'erp-dents-homolog', '--env-file', $envPath, '-f', $composePath)
# Docker escreve progresso em stderr mesmo quando o comando tem sucesso.
# PowerShell 5 transforma esse progresso em erro terminante quando redirecionado
# com ErrorActionPreference=Stop. O codigo de saida e a fonte de verdade aqui.
$previousErrorPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    switch ($Action) {
        'up'     { & docker @composeArgs up -d --build }
        'stop'   { & docker @composeArgs stop }
        'status' { & docker @composeArgs ps -a }
        'logs'   { & docker @composeArgs logs --tail 100 }
    }
    $dockerExitCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorPreference
}
if ($dockerExitCode -ne 0) { throw "Docker falhou na acao '$Action' (codigo $dockerExitCode)." }
if ($Action -eq 'up') {
    Write-Host 'Homologacao: http://localhost:18080 | API: http://localhost:18000'
    Write-Host 'A inicializacao da API/migracoes ainda deve ser verificada. Use somente dados ficticios.'
}
