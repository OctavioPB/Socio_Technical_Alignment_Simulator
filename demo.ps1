#Requires -Version 5.1
<#
.SYNOPSIS
    STAS -- one-command demo launcher.

.DESCRIPTION
    1.  Verifies Docker is running.
    2.  Loads .env (copies from .env.example if missing).
    3.  Tears down any existing STAS containers (volumes preserved).
    4.  Starts the full Docker Compose stack.
    5.  Waits for Neo4j, Kafka, Redis, and the API to be healthy.
    6.  Waits for the Next.js frontend to be running.
    7.  Seeds the graph with demo data if the graph is empty.
    8.  Opens the browser at the app URL.
    9.  Prints a URL and credentials summary.

.EXAMPLE
    .\demo.ps1
#>

# ── Bootstrap ─────────────────────────────────────────────────────────────────

# Do NOT set ErrorActionPreference = 'Stop' globally.
# In PowerShell 5.1, redirecting stderr of a native command (docker, netstat)
# wraps each line in an ErrorRecord; 'Stop' would turn Docker's progress output
# into terminating exceptions. Errors are handled explicitly below.
$ErrorActionPreference = 'Continue'
$RepoRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
Set-Location $RepoRoot

# Matches the `name:` field in docker-compose.yml
$ComposeProject = 'socio_technical_alignement_simulator'

# Host ports as remapped in docker-compose.yml
$Ports = @{
    Web       = 3001   # Next.js  (3000 inside container)
    Api       = 8000
    Airflow   = 8080
    Grafana   = 3002
    Prometheus= 9091
    Neo4jHttp = 7476   # Neo4j browser (7474 inside container)
    Neo4jBolt = 7688   # Bolt (7687 inside container)
    Kafka     = 9094
    Redis     = 6379
}

# ── Color helpers ─────────────────────────────────────────────────────────────

function Write-Step { param([string]$Msg)
    Write-Host ""
    Write-Host "  >>  $Msg" -ForegroundColor Cyan
}
function Write-Ok   { param([string]$Msg) Write-Host "  OK  $Msg" -ForegroundColor Green  }
function Write-Warn { param([string]$Msg) Write-Host "  !!  $Msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$Msg) Write-Host "  XX  $Msg" -ForegroundColor Red    }

function Exit-Script {
    param([string]$Reason)
    Write-Fail $Reason
    Read-Host "`n  Press Enter to exit"
    exit 1
}

# ── Banner ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  =========================================================" -ForegroundColor DarkCyan
Write-Host "    Socio-Technical Alignment Simulator  --  Demo Launcher  " -ForegroundColor Cyan
Write-Host "  =========================================================" -ForegroundColor DarkCyan
Write-Host ""

# =============================================================================
# STEP 1 -- Verify Docker daemon
# =============================================================================

Write-Step "Checking Docker daemon"

$dockerReady = $false
for ($attempt = 1; $attempt -le 18; $attempt++) {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
    $elapsed = ($attempt - 1) * 5
    Write-Warn "Docker not yet ready -- ${elapsed}s elapsed (retrying up to 90s) ..."
    Start-Sleep 5
}

if (-not $dockerReady) {
    Exit-Script "Docker did not become ready after 90s. Open Docker Desktop, wait for the whale icon to stop animating, then retry."
}

Write-Ok "Docker is running"

# =============================================================================
# STEP 2 -- Load .env
# =============================================================================

Write-Step "Loading environment variables"

$EnvFile     = Join-Path $RepoRoot '.env'
$EnvExample  = Join-Path $RepoRoot '.env.example'

if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $EnvFile
        Write-Warn ".env not found -- copied from .env.example"
        Write-Warn "Set ANTHROPIC_API_KEY in .env before running candidate extractions."
    } else {
        Exit-Script ".env and .env.example are both missing from $RepoRoot"
    }
}

$envVarsLoaded = 0
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line -match '^\s*#') { return }
    if ($line -match '^([^=]+)=(.*)$') {
        $key   = $matches[1].Trim()
        $value = $matches[2].Trim() -replace '\s+#.*$', '' -replace '^[''"]|[''"]$', ''
        [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
        $envVarsLoaded++
    }
}

Write-Ok "$envVarsLoaded variables loaded from .env"

# =============================================================================
# STEP 3 -- Port conflict check (warn only -- does not abort)
#
# Containers bind to host ports when they start. If another process or another
# Docker project already owns a port, `docker compose up` fails with a bind
# error. This check surfaces the conflict early with a friendly message.
# =============================================================================

Write-Step "Checking for port conflicts"

$conflictFound = $false
foreach ($name in $Ports.Keys) {
    $port = $Ports[$name]
    $inUse = netstat -ano 2>$null |
             Where-Object { $_ -match "0\.0\.0\.0:$port\s" -or $_ -match "\[::\]:$port\s" }
    if ($inUse) {
        # Find which container (if any) owns the port -- if it is our own
        # project, that is fine (we are about to recreate it).
        $owner = docker ps --format '{{.Names}} {{.Ports}}' 2>&1 |
                 Where-Object { $_ -is [string] -and $_ -match ":$port->" }
        if ($owner -and $owner -match $ComposeProject) {
            # Our own container from a previous run -- will be replaced by 'down'
        } else {
            $ownerStr = if ($owner) { $owner } else { 'unknown process' }
            Write-Warn "Port $port ($name) is already in use: $ownerStr"
            $conflictFound = $true
        }
    }
}

if ($conflictFound) {
    Write-Warn "One or more ports are occupied. The stack may fail to start."
    Write-Warn "Stop the conflicting services, or check the port remapping in docker-compose.yml."
} else {
    Write-Ok "All ports are free"
}

# =============================================================================
# STEP 4 -- Tear down existing STAS containers (volumes preserved)
# =============================================================================

Write-Step "Removing existing STAS containers (data volumes preserved)"

docker compose down 2>&1 | Out-Null
Write-Ok "Previous containers removed"

# =============================================================================
# STEP 5 -- docker compose up
# =============================================================================

Write-Step "Starting Docker Compose stack"

docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Exit-Script "docker compose up failed (exit $LASTEXITCODE). Run 'docker compose logs' for details."
}

Write-Ok "All services started"

# =============================================================================
# STEP 6 -- Wait for containers to be healthy / running
# =============================================================================

function Wait-ContainerHealthy {
    param(
        [Parameter(Mandatory)][string]$Service,
        [int]$TimeoutSec = 180
    )
    $container = "${ComposeProject}-${Service}-1"
    Write-Step "Waiting for $Service to be healthy (up to ${TimeoutSec}s)"

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $raw    = docker inspect --format '{{.State.Health.Status}}' $container 2>&1
        $status = ($raw | Where-Object { $_ -is [string] } | Out-String).Trim()

        switch ($status) {
            'healthy'   { Write-Ok "$Service is healthy"; return }
            'unhealthy' { Exit-Script "$Service is unhealthy. Inspect: docker logs $container" }
            default     { Write-Host "    [$status] ..." -ForegroundColor DarkGray }
        }
        Start-Sleep 4
    }
    Exit-Script "$Service did not become healthy in ${TimeoutSec}s. Inspect: docker logs $container"
}

function Wait-ContainerRunning {
    param(
        [Parameter(Mandatory)][string]$Service,
        [int]$TimeoutSec = 90
    )
    $container = "${ComposeProject}-${Service}-1"
    Write-Step "Waiting for $Service to be running (up to ${TimeoutSec}s)"

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $raw    = docker inspect --format '{{.State.Status}}' $container 2>&1
        $status = ($raw | Where-Object { $_ -is [string] } | Out-String).Trim()

        if ($status -eq 'running') { Write-Ok "$Service is running"; return }
        Write-Host "    [$status] ..." -ForegroundColor DarkGray
        Start-Sleep 4
    }
    Exit-Script "$Service did not start in ${TimeoutSec}s. Inspect: docker logs $container"
}

function Wait-ContainerRunning-Optional {
    param(
        [Parameter(Mandatory)][string]$Service,
        [int]$TimeoutSec = 60
    )
    $container = "${ComposeProject}-${Service}-1"
    Write-Step "Waiting for $Service (optional, up to ${TimeoutSec}s)"

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $raw    = docker inspect --format '{{.State.Status}}' $container 2>&1
        $status = ($raw | Where-Object { $_ -is [string] } | Out-String).Trim()

        if ($status -eq 'running') { Write-Ok "$Service is running"; return }
        Write-Host "    [$status] ..." -ForegroundColor DarkGray
        Start-Sleep 4
    }
    Write-Warn "$Service did not start in ${TimeoutSec}s -- skipping (non-critical for demo)"
}

# ── Essential services (API cannot start without these) ───────────────────────

Wait-ContainerHealthy -Service 'neo4j'  -TimeoutSec 120
Wait-ContainerHealthy -Service 'kafka'  -TimeoutSec 150
Wait-ContainerHealthy -Service 'redis'  -TimeoutSec  60

# ── Application layer ─────────────────────────────────────────────────────────

Wait-ContainerHealthy -Service 'api'    -TimeoutSec  60
Wait-ContainerRunning -Service 'web'    -TimeoutSec  90

# Wait for Next.js dev server to finish its first compilation and serve HTTP.
# The container reaches "running" while Next.js is still compiling; opening the
# browser before this check completes produces a 404 on the root route.
Write-Step "Waiting for Next.js to be ready"

$webUrl   = "http://localhost:$($Ports.Web)"
$webReady = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $webUrl -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop -MaximumRedirection 0
        # 200 (already on a page) or 307 (root redirect to /dashboard) both mean ready
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { $webReady = $true; break }
    } catch [System.Net.WebException] {
        # A redirect throws in -MaximumRedirection 0 mode but still means the server is up
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode -ge 300) {
            $webReady = $true; break
        }
    } catch { }
    Write-Host "    Next.js not ready -- attempt $i/30 ..." -ForegroundColor DarkGray
    Start-Sleep 3
}

if ($webReady) {
    Write-Ok "Next.js is ready at $webUrl"
} else {
    Write-Warn "Next.js did not respond in 90s -- opening browser anyway"
}

# ── Observability (non-critical for demo) ─────────────────────────────────────

Wait-ContainerRunning-Optional -Service 'prometheus'  -TimeoutSec 45
Wait-ContainerRunning-Optional -Service 'grafana'      -TimeoutSec 60

# ── Airflow (slowest to start -- give it time but don't block on failure) ─────

Write-Step "Waiting for Airflow webserver (up to 180s -- this is the slowest service)"

$airflowContainer = "${ComposeProject}-airflow-webserver-1"
$airflowDeadline  = (Get-Date).AddSeconds(180)
$airflowOk        = $false

while ((Get-Date) -lt $airflowDeadline) {
    $raw    = docker inspect --format '{{.State.Health.Status}}' $airflowContainer 2>&1
    $status = ($raw | Where-Object { $_ -is [string] } | Out-String).Trim()
    if ($status -eq 'healthy') { $airflowOk = $true; break }
    Write-Host "    Airflow [$status] ..." -ForegroundColor DarkGray
    Start-Sleep 6
}

if ($airflowOk) {
    Write-Ok "Airflow webserver is healthy"
} else {
    Write-Warn "Airflow did not become healthy in time -- DAGs may not be loaded yet."
    Write-Warn "Check http://localhost:$($Ports.Airflow) in a few minutes."
}

Write-Ok "Stack is ready"

# =============================================================================
# STEP 7 -- Wait for API HTTP response
# =============================================================================

Write-Step "Waiting for API /health endpoint to respond"

$apiUrl   = "http://localhost:$($Ports.Api)/health"
$apiReady = $false

for ($i = 1; $i -le 20; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $apiUrl -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $apiReady = $true; break }
    } catch { }
    Write-Host "    API not yet responding -- attempt $i/20 ..." -ForegroundColor DarkGray
    Start-Sleep 3
}

if (-not $apiReady) {
    Write-Warn "API did not respond after 60s -- the containers may still be starting."
    Write-Warn "Check http://localhost:$($Ports.Api)/docs once the API is up."
}

Write-Ok "API is responding at $apiUrl"

# =============================================================================
# STEP 8 -- Seed demo graph if the database is empty
#
# Calls GET /admin/stats first. If engineers == 0, runs POST /admin/seed to
# load the 4 synthetic teams (24 engineers, ~150 edges). If data already exists
# (e.g. from a previous run with volumes preserved), seeding is skipped.
# =============================================================================

Write-Step "Checking graph data"

$statsUrl = "http://localhost:$($Ports.Api)/admin/stats"
$seedUrl  = "http://localhost:$($Ports.Api)/admin/seed"

try {
    $statsResp = Invoke-WebRequest -Uri $statsUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    $stats     = $statsResp.Content | ConvertFrom-Json

    if ($stats.engineers -eq 0) {
        Write-Warn "Graph is empty -- seeding demo data (4 teams, 24 engineers)"

        $seedResp = Invoke-WebRequest -Uri $seedUrl -Method POST `
                        -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
        $seed     = $seedResp.Content | ConvertFrom-Json

        Write-Ok ("Seeded: {0} engineers  |  {1} edges  |  teams: {2}" -f `
                  $seed.engineers_seeded, $seed.edges_seeded, ($seed.teams -join ', '))
    } else {
        Write-Ok ("Graph already has data: {0} engineers, {1} edges -- skipping seed" -f `
                  $stats.engineers, $stats.edges)
    }
} catch {
    Write-Warn "Could not seed graph: $_"
    Write-Warn "You can seed manually at http://localhost:$($Ports.Api)/admin/seed (POST)"
}

# =============================================================================
# STEP 9 -- Open browser
# =============================================================================

$AppUrl = "http://localhost:$($Ports.Web)"
Write-Step "Opening browser at $AppUrl"
Start-Process $AppUrl
Write-Ok "Browser launched"

# =============================================================================
# STEP 10 -- Summary
# =============================================================================

$div = "  " + ("-" * 62)

Write-Host ""
Write-Host $div -ForegroundColor DarkGray
Write-Host "  Service               URL" -ForegroundColor White
Write-Host $div -ForegroundColor DarkGray
Write-Host ("  Dashboard (Next.js)   http://localhost:{0}" -f $Ports.Web)        -ForegroundColor Green
Write-Host ("  API (FastAPI)         http://localhost:{0}" -f $Ports.Api)        -ForegroundColor Green
Write-Host ("  API docs (Swagger)    http://localhost:{0}/docs" -f $Ports.Api)   -ForegroundColor Green
Write-Host ("  API docs (ReDoc)      http://localhost:{0}/redoc" -f $Ports.Api)  -ForegroundColor Green
Write-Host $div -ForegroundColor DarkGray
Write-Host ("  Airflow               http://localhost:{0}   admin / admin" -f $Ports.Airflow)   -ForegroundColor Cyan
Write-Host ("  Grafana               http://localhost:{0}   admin / admin" -f $Ports.Grafana)   -ForegroundColor Cyan
Write-Host ("  Prometheus            http://localhost:{0}" -f $Ports.Prometheus)                -ForegroundColor DarkGray
Write-Host ("  Neo4j Browser         http://localhost:{0}   neo4j / changeme" -f $Ports.Neo4jHttp) -ForegroundColor DarkGray
Write-Host ("  Neo4j Bolt            bolt://localhost:{0}" -f $Ports.Neo4jBolt)                 -ForegroundColor DarkGray
Write-Host ("  Kafka (external)      localhost:{0}   KRaft mode" -f $Ports.Kafka)               -ForegroundColor DarkGray
Write-Host ("  Redis                 localhost:{0}" -f $Ports.Redis)                             -ForegroundColor DarkGray
Write-Host $div -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Stop the stack:        docker compose down"              -ForegroundColor Gray
Write-Host "  Stop + wipe data:      docker compose down -v"           -ForegroundColor Gray
Write-Host "  View API logs:         docker compose logs -f api"       -ForegroundColor Gray
Write-Host "  View all logs:         docker compose logs -f"           -ForegroundColor Gray
Write-Host ""
