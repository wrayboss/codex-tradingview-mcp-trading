param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Tool,
    [string]$ArgumentsJson = "{}",
    [switch]$Raw
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$client = Join-Path $PSScriptRoot "mcp-client.mjs"

function Write-Failure([string]$Message, [string]$Detail = "") {
    [ordered]@{
        ok = $false
        status = "BLOCKED"
        tool = $Tool
        error = $Message
        detail = $Detail
    } | ConvertTo-Json -Depth 8
}

if (-not (Test-Path -LiteralPath $client -PathType Leaf)) {
    Write-Failure "Package MCP client is missing." $client
    exit 1
}

try {
    $null = $ArgumentsJson | ConvertFrom-Json -ErrorAction Stop
} catch {
    Write-Failure "ArgumentsJson is invalid JSON." $_.Exception.Message
    exit 2
}

$tempArgs = Join-Path ([IO.Path]::GetTempPath()) ("wrayboss-mcp-args-{0}.json" -f [guid]::NewGuid())
try {
    [IO.File]::WriteAllText($tempArgs, $ArgumentsJson, (New-Object Text.UTF8Encoding($false)))
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $nodePath
    $psi.Arguments = ('"{0}" call-file "{1}" "{2}"' -f $client, $Tool, $tempArgs)
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $psi
    $null = $process.Start()
    $text = $process.StandardOutput.ReadToEnd().Trim()
    $stderr = $process.StandardError.ReadToEnd().Trim()
    $process.WaitForExit()
    $exitCode = $process.ExitCode

    if ($Raw) {
        if ($text) { Write-Output $text }
    } elseif ($text) {
        try {
            ($text | ConvertFrom-Json -ErrorAction Stop) | ConvertTo-Json -Depth 30
        } catch {
            Write-Failure "MCP client returned non-JSON output." $text
            exit 3
        }
    }

    if ($exitCode -ne 0) {
        if (-not $text) { Write-Failure "MCP tool invocation failed." $stderr }
        exit $exitCode
    }
} finally {
    Remove-Item -LiteralPath $tempArgs -Force -ErrorAction SilentlyContinue
}
