param(
    [Parameter(Mandatory = $true)][string]$Destination,
    [ValidateSet('prod', 'homolog')][string]$Environment = 'prod',
    [string]$HomologFixture
)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Este comando requer Windows para proteger o backup.' }
$root = Split-Path -Parent $PSScriptRoot
$project = 'erp-dents-' + $Environment
$composeFile = Join-Path $root 'docker-compose.yml'
$envFile = Join-Path $root '.env'
if ($Environment -eq 'homolog') {
    $composeFile = Join-Path $root 'docker-compose.homolog.yml'
    $envFile = Join-Path $root '.env.homolog'
}
$fixture = $null
if ($HomologFixture) {
    if ($Environment -ne 'homolog') { throw 'Fixture permitida somente em homologacao.' }
    $fixturePath = (Resolve-Path -LiteralPath $HomologFixture).Path
    $fixtureRoot = [IO.Path]::GetFullPath((Join-Path $root '.data/homolog')) + [IO.Path]::DirectorySeparatorChar
    if (-not $fixturePath.StartsWith($fixtureRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture fora da homologacao local.' }
    $fixture = Get-Content -LiteralPath $fixturePath -Raw | ConvertFrom-Json
    if ($fixture.operation -notmatch '^[a-f0-9]{32}$') { throw 'Identificador de fixture invalido.' }
    $fixturePrefix = 'erp-dents-homolog-full-' + $fixture.operation
    if ($fixture.api -ne ($fixturePrefix + '-api') -or $fixture.edge -ne ($fixturePrefix + '-web') -or
        $fixture.database -ne ('clinical_full_' + $fixture.operation) -or
        $fixture.examVolume -ne ($fixturePrefix + '-exams')) { throw 'Destinos temporarios de fixture invalidos.' }
    $envFile = Join-Path (Split-Path -Parent $fixturePath) 'server.env'
}
function Invoke-BackupDocker {
    param([string[]]$Arguments)
    # Windows PowerShell 5 drops embedded quotes with native splatting.
    # Quote each argument using Windows argv escaping, without a shell.
    $quoted = foreach ($argument in $Arguments) {
        '"' + [regex]::Replace([regex]::Replace($argument, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
    }
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = (Get-Command docker.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $info.Arguments = $quoted -join ' '
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        $null = $process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $result = $stdout.GetAwaiter().GetResult()
        $diagnostic = $stderr.GetAwaiter().GetResult()
        $code = $process.ExitCode
    } finally { $process.Dispose() }
    if ($code -ne 0) {
        $reason = 'erro nao classificado'
        foreach ($known in @('invalid reference format', 'invalid mount config', 'No such image', 'Conflict', 'permission denied', 'no space left on device', 'invalid argument')) {
            if ($diagnostic -match [regex]::Escape($known)) { $reason = $known; break }
        }
        throw ('Operacao Docker falhou (' + $Arguments[0] + '): ' + $reason + '. Backup nao confirmado; confira servicos e espaco disponivel.')
    }
    return ($result -join "`n").Trim()
}
$compose = @('compose', '--project-name', $project, '--env-file', $envFile, '-f', $composeFile)
$target = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Destination)
if (Test-Path -LiteralPath $target) { throw 'Destino existente preservado. Escolha uma pasta nova para cada backup.' }
if (-not (Test-Path -LiteralPath (Split-Path -Parent $target) -PathType Container)) { throw 'A pasta pai do destino deve existir.' }
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) { throw 'Configuracao local ausente.' }
if ($fixture) {
    $db = Invoke-BackupDocker @('inspect', '--format', '{{.Id}}', 'erp-dents-homolog-db-1')
    $api = Invoke-BackupDocker @('inspect', '--format', '{{.Id}}', $fixture.api)
    $edge = Invoke-BackupDocker @('inspect', '--format', '{{.Id}}', $fixture.edge)
    foreach ($id in @($api, $edge)) {
        if ((Invoke-BackupDocker @('inspect', '--format', '{{index .Config.Labels "erp.homolog.fixture"}}', $id)) -ne $fixture.operation) { throw 'Container nao pertence a fixture.' }
    }
    $fixtureApiEnv = (Invoke-BackupDocker @('inspect', '--format', '{{json .Config.Env}}', $api)) | ConvertFrom-Json
    $fixtureUrl = @($fixtureApiEnv | Where-Object { $_.StartsWith('DATABASE_URL=') })
    if ($fixtureUrl.Count -ne 1 -or ([Uri]$fixtureUrl[0].Substring(13)).AbsolutePath -ne ('/' + $fixture.database)) { throw 'Banco da API difere da fixture.' }
} else {
    $db = Invoke-BackupDocker ($compose + @('ps', '-q', 'db'))
    $api = Invoke-BackupDocker ($compose + @('ps', '-q', 'api'))
    $edge = Invoke-BackupDocker ($compose + @('ps', '-q', 'edge'))
}
foreach ($id in @($db, $api, $edge)) {
    if ($id -notmatch '^[a-f0-9]{12,64}$') { throw 'Banco, API e HTTPS devem estar em execucao antes do backup.' }
    $label = Invoke-BackupDocker @('inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', $id)
    if ($label -ne $project) { throw 'Container pertence a outro projeto.' }
}
$mounts = (Invoke-BackupDocker @('inspect', '--format', '{{json .Mounts}}', $api)) | ConvertFrom-Json
$dbMounts = (Invoke-BackupDocker @('inspect', '--format', '{{json .Mounts}}', $db)) | ConvertFrom-Json
$dbVolume = @($dbMounts | Where-Object { $_.Destination -eq '/var/lib/postgresql/data' -and $_.Type -eq 'volume' })
if ($dbVolume.Count -ne 1 -or $dbVolume[0].Name -ne ($project + '_postgres_data')) { throw 'Volume de banco inesperado.' }
if ((Invoke-BackupDocker @('volume', 'inspect', '--format', '{{index .Labels "com.docker.compose.project"}}', $dbVolume[0].Name)) -ne $project) { throw 'Volume de banco pertence a outro projeto.' }
$examMount = @($mounts | Where-Object { $_.Type -eq 'volume' })
$expectedExamVolume = $project + '_exams_data'
if ($fixture) { $expectedExamVolume = $fixture.examVolume }
if ($examMount.Count -ne 1 -or $examMount[0].Name -ne $expectedExamVolume) { throw 'Volume de exames inesperado.' }
if ($fixture -and ($examMount[0].Destination -ne '/data/exams' -or 'EXAMS_BASE_PATH=/data/exams' -notin $fixtureApiEnv)) { throw 'Montagem de exames da fixture difere da instalacao.' }
$examVolume = $examMount[0].Name
$volumeProject = Invoke-BackupDocker @('volume', 'inspect', '--format', '{{index .Labels "com.docker.compose.project"}}', $examVolume)
if ($volumeProject -ne $project) { throw 'Volume de exames pertence a outro projeto.' }
$writers = Invoke-BackupDocker @('ps', '-q', '--no-trunc', '--filter', ('volume=' + $examVolume))
if ($writers -ne $api) { throw 'Outro container usa os exames. Encerre os ensaios/operacoes concorrentes antes do backup.' }
$edgeMounts = (Invoke-BackupDocker @('inspect', '--format', '{{json .Mounts}}', $edge)) | ConvertFrom-Json
$tls = @($edgeMounts | Where-Object { $_.Destination -eq '/etc/erp-tls' -and $_.Type -eq 'bind' })
if ($tls.Count -ne 1) { throw 'Montagem TLS inesperada.' }
$image = Invoke-BackupDocker @('inspect', '--format', '{{.Image}}', $api)
$dbImage = Invoke-BackupDocker @('inspect', '--format', '{{.Image}}', $db)
# A running container can survive removal of its original local image. The
# archive helper only uses Python/tarfile against a read-only mount; it does not
# run the API. Resolve its image before stopping any service and never pull here.
try {
    $archiveImage = Invoke-BackupDocker @('image', 'inspect', '--format', '{{.Id}}', $image)
} catch {
    $archiveImage = Invoke-BackupDocker @('image', 'inspect', '--format', '{{.Id}}', ($project + '-api'))
    Write-Host 'Imagem original da API indisponivel; copia de arquivos usara a imagem local da API do mesmo projeto.'
}
if ($archiveImage -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Imagem auxiliar local nao identificada. Nenhum servico interrompido.' }
$operation = [Guid]::NewGuid().ToString('N')
$helper = $project + '-backup-' + $operation
$dbDump = '/tmp/erp-backup-' + $operation + '.dump'
$maintenance = $false
$helperCreated = $false
try {
    New-Item -ItemType Directory -Path $target | Out-Null
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    }
    Set-Acl -LiteralPath $target -AclObject $acl
    [IO.File]::WriteAllText((Join-Path $target 'INCOMPLETE'), 'Do not restore: backup has not completed.')
    Write-Host 'Iniciando manutencao: gravacoes pela API ficarao indisponiveis durante a copia.'
    $maintenance = $true
    if ($fixture) { $null = Invoke-BackupDocker @('stop', '-t', '60', $api) }
    else { $null = Invoke-BackupDocker ($compose + @('stop', '-t', '60', 'api')) }
    if ((Invoke-BackupDocker @('inspect', '--format', '{{.State.Running}}', $api)) -ne 'false') { throw 'API ainda em execucao.' }
    # Shell receives no secrets as command arguments: credentials are expanded
    # inside the existing database container. Binary dump is transferred by cp.
    if ($fixture) {
        $null = Invoke-BackupDocker @('exec', $db, 'sh', '-c', 'umask 077; pg_dump -U "$POSTGRES_USER" -d "$2" -Fc -f "$1"', 'sh', $dbDump, $fixture.database)
    } else {
        $null = Invoke-BackupDocker @('exec', $db, 'sh', '-c', 'umask 077; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$1"', 'sh', $dbDump)
    }
    $null = Invoke-BackupDocker @('cp', ($db + ':' + $dbDump), (Join-Path $target 'database.dump'))
    $archiveCode = 'import tarfile; t=tarfile.open("/tmp/exams.tar","w"); t.add("/source",arcname="exams"); t.close()'
    $null = Invoke-BackupDocker @('create', '--name', $helper, '--label', ('com.docker.compose.project=' + $project), '--network', 'none', '--user', '0:0', '--mount', ('type=volume,src=' + $examVolume + ',dst=/source,readonly'), $archiveImage, 'python', '-c', $archiveCode)
    $helperCreated = $true
    $null = Invoke-BackupDocker @('start', '-a', $helper)
    if ((Invoke-BackupDocker @('inspect', '--format', '{{.State.ExitCode}}', $helper)) -ne '0') { throw 'Falha ao copiar exames.' }
    $null = Invoke-BackupDocker @('cp', ($helper + ':/tmp/exams.tar'), (Join-Path $target 'exams.tar'))
    Copy-Item -LiteralPath $envFile -Destination (Join-Path $target 'server.env')
    New-Item -ItemType Directory -Path (Join-Path $target 'tls') | Out-Null
    # Copy from the actual mounted directory, avoiding assumptions about custom TLS_DIRECTORY.
    foreach ($name in @('server.crt', 'server.key')) {
        $null = Invoke-BackupDocker @('cp', ($edge + ':/etc/erp-tls/' + $name), (Join-Path $target ('tls/' + $name)))
    }
    try {
        $null = Invoke-BackupDocker @('exec', $edge, 'test', '-f', '/etc/erp-tls/ca.crt')
        $hasCa = $true
    } catch { $hasCa = $false }
    if ($hasCa) { $null = Invoke-BackupDocker @('cp', ($edge + ':/etc/erp-tls/ca.crt'), (Join-Path $target 'tls/ca.crt')) }
    $revision = & git -C $root rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $revision -notmatch '^[a-f0-9]{40}$') { throw 'Nao foi possivel identificar a versao do codigo.' }
    $hashes = [ordered]@{}
    foreach ($relative in @('database.dump', 'exams.tar', 'server.env', 'tls/server.crt', 'tls/server.key', 'tls/ca.crt')) {
        $path = Join-Path $target $relative
        if (Test-Path -LiteralPath $path -PathType Leaf) { $hashes[$relative] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
    }
    $manifest = [ordered]@{ format = 1; project = $project; createdUtc = [DateTime]::UtcNow.ToString('o'); revision = $revision; apiImage = $image; archiveImage = $archiveImage; dbImage = $dbImage; files = $hashes }
    [IO.File]::WriteAllText((Join-Path $target 'manifest.json'), ($manifest | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))
    Remove-Item -LiteralPath (Join-Path $target 'INCOMPLETE')
    Write-Host 'Copia concluida. Guarde em destino separado e valide a restauracao antes de considerar o backup recuperavel.'
} finally {
    # Always attempt to reopen the service, including after failed copying.
    if ($maintenance) {
        try {
            if ($fixture) { $null = Invoke-BackupDocker @('start', $api) }
            else { $null = Invoke-BackupDocker ($compose + @('start', 'api')) }
            Write-Host 'API reiniciada; confira /health e login antes de reabrir o atendimento.'
        } catch { Write-Warning 'API nao reiniciou. Mantenha a manutencao e contate o suporte.'; throw }
    }
    if ($helperCreated) { $null = Invoke-BackupDocker @('rm', $helper) }
    $null = Invoke-BackupDocker @('exec', $db, 'rm', '-f', $dbDump)
}
