$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$config = Get-Content (Join-Path $appRoot 'app_config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$url = "http://127.0.0.1:$($config.port)/"

function Test-Coach {
    try {
        $health = Invoke-RestMethod -Uri ($url + 'api/health') -TimeoutSec 1
        return ($health.ok -eq $true)
    } catch { return $false }
}

if (-not (Test-Coach)) {
    $python = $config.python
    if (-not $python -or -not (Test-Path $python)) { $python = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source }
    if (-not $python) { $python = (Get-Command python.exe -ErrorAction SilentlyContinue).Source }
    if (-not $python) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show('Python was not found. Install Python 3 or rebuild the app with build_app.py.', $config.title) | Out-Null
        exit 1
    }
    Start-Process -FilePath $python -ArgumentList 'server.py' -WorkingDirectory $appRoot -WindowStyle Hidden
    $ready = $false
    for ($i = 0; $i -lt 50; $i++) {
        Start-Sleep -Milliseconds 200
        if (Test-Coach) { $ready = $true; break }
    }
    if (-not $ready) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show("The local server did not start. Check port $($config.port), or see $appRoot\data\server.log.", $config.title) | Out-Null
        exit 1
    }
}
Start-Process $url
