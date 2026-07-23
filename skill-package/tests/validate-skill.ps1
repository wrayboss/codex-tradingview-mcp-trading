param(
    [Parameter(Mandatory = $true)]
    [string]$SkillRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$errors = New-Object System.Collections.ArrayList

function Add-Error([string]$Message) {
    [void]$errors.Add($Message)
}

$expectedName = "wrayboss-codex-tradingview"
$requiredFiles = @(
    "SKILL.md",
    "references\environment-contract.md",
    "references\evidence-and-honesty.md",
    "references\operator-playbooks.md",
    "references\recovery-playbook.md",
    "references\tool-catalog.md",
    "references\known-limitations.md",
    "scripts\install-runtime.ps1",
    "scripts\invoke-mcp-tool.ps1",
    "scripts\mcp-client.mjs",
    "scripts\verify-environment.ps1",
    "scripts\run-capability-tests.ps1",
    "tests\expected-tools.json",
    "tests\capability-manifest.json",
    "tests\pressure-scenarios.md",
    "tests\verification-report.md",
    "tests\script-hashes.json"
)

if (-not (Test-Path -LiteralPath $SkillRoot -PathType Container)) {
    Add-Error "Skill root does not exist: $SkillRoot"
} else {
    $leaf = Split-Path -Leaf (Resolve-Path -LiteralPath $SkillRoot)
    if ($leaf -ne $expectedName) {
        Add-Error "Skill folder name must be $expectedName; found $leaf."
    }
}

foreach ($relative in $requiredFiles) {
    $path = Join-Path $SkillRoot $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-Error "Required file is missing: $relative"
    }
}

$skillPath = Join-Path $SkillRoot "SKILL.md"
if (Test-Path -LiteralPath $skillPath -PathType Leaf) {
    $skillText = Get-Content -LiteralPath $skillPath -Raw
    $frontmatter = [regex]::Match($skillText, '(?s)^---\r?\n(.*?)\r?\n---\r?\n')
    if (-not $frontmatter.Success) {
        Add-Error "SKILL.md has no valid YAML frontmatter block."
    } else {
        $yaml = $frontmatter.Groups[1].Value
        $nameMatch = [regex]::Match($yaml, '(?m)^name:\s*([^\r\n]+)$')
        $descriptionMatch = [regex]::Match($yaml, '(?m)^description:\s*([^\r\n]+)$')
        if (-not $nameMatch.Success -or $nameMatch.Groups[1].Value.Trim() -ne $expectedName) {
            Add-Error "Frontmatter name must equal the skill folder name."
        }
        if (-not $descriptionMatch.Success -or $descriptionMatch.Groups[1].Value.Trim() -notmatch '^Use when\b') {
            Add-Error "Frontmatter description must start with 'Use when'."
        }
        if ($yaml.Length -gt 1024) {
            Add-Error "YAML frontmatter exceeds 1024 characters."
        }
    }

    foreach ($requiredText in @(
        "C:\Users\Administrator\Documents\GitHub\codex-tradingview-mcp-trading",
        "https://github.com/wrayboss/codex-tradingview-mcp-trading.git",
        "C:\Users\Administrator\tradingview-mcp\src\server.js",
        "C:\Users\Administrator\TradingView-CDP\TradingView.exe",
        "114"
    )) {
        if (-not $skillText.Contains($requiredText)) {
            Add-Error "SKILL.md is missing required identity text: $requiredText"
        }
    }

    $wrongPath = "C:\Users\Administrator\Documents\GitHub\claude-tradingview-mcp-trading"
    if ($skillText.Contains($wrongPath)) {
        Add-Error "SKILL.md contains the prohibited Claude repository path."
    }
}

$allFiles = @()
if (Test-Path -LiteralPath $SkillRoot -PathType Container) {
    $allFiles = @(Get-ChildItem -LiteralPath $SkillRoot -File -Recurse)
}

$prohibitedExtensions = @(
    ".exe", ".dll", ".pfx", ".p12", ".pem", ".key",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip"
)
foreach ($file in $allFiles) {
    $relative = $file.FullName.Substring((Resolve-Path $SkillRoot).Path.Length).TrimStart('\')
    $lower = $relative.ToLowerInvariant()
    if ($lower -match '(^|\\)node_modules(\\|$)') {
        Add-Error "Package contains node_modules: $relative"
    }
    if ($file.Name -eq ".env" -or $file.Name -like ".env.*") {
        Add-Error "Package contains an environment file: $relative"
    }
    if ($lower -match 'cookie|profile-data|user-data') {
        Add-Error "Package contains prohibited session/profile material: $relative"
    }
    if ($prohibitedExtensions -contains $file.Extension.ToLowerInvariant()) {
        Add-Error "Package contains prohibited binary or image: $relative"
    }

    if ($file.Extension -in @(".md", ".ps1", ".mjs", ".json")) {
        $text = [string](Get-Content -LiteralPath $file.FullName -Raw)
        if ($text -match '(?mi)^\s*(TBD|TODO|FIXME)(\s|:|$)') {
            Add-Error "Unfinished placeholder found in $relative"
        }
        if ($text.Contains("C:\Users\Administrator\Documents\GitHub\claude-tradingview-mcp-trading")) {
            Add-Error "Prohibited Claude repository path found in $relative"
        }
    }

    if ($file.Extension -in @(".ps1", ".mjs")) {
        $bytes = [IO.File]::ReadAllBytes($file.FullName)
        if (@($bytes | Where-Object { $_ -gt 127 }).Count -gt 0) {
            Add-Error "Executable script contains non-ASCII bytes: $relative"
        }
    }
}

foreach ($markdown in @($allFiles | Where-Object { $_.Extension -eq ".md" })) {
    $text = [string](Get-Content -LiteralPath $markdown.FullName -Raw)
    $links = [regex]::Matches($text, '\]\(([^)]+)\)')
    foreach ($match in $links) {
        $target = $match.Groups[1].Value.Trim()
        if ($target -match '^(https?://|#|mailto:)') { continue }
        $target = $target.Split('#')[0]
        if (-not $target) { continue }
        $resolved = Join-Path $markdown.DirectoryName $target.Replace('/', '\')
        if (-not (Test-Path -LiteralPath $resolved)) {
            $relative = $markdown.FullName.Substring((Resolve-Path $SkillRoot).Path.Length).TrimStart('\')
            Add-Error "Broken relative link in $relative`: $target"
        }
    }
}

$manifestPath = Join-Path $SkillRoot "tests\expected-tools.json"
if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -ErrorAction Stop
        $names = @($manifest.tools)
        if ([int]$manifest.expectedToolCount -ne 114 -or $names.Count -ne 114) {
            Add-Error "Expected-tools manifest must contain exactly 114 tools."
        }
        if (@($names | Select-Object -Unique).Count -ne $names.Count) {
            Add-Error "Expected-tools manifest contains duplicate names."
        }
        foreach ($requiredTool in @(
            "chart_get_state", "draw_shape", "draw_remove_one", "capture_screenshot",
            "pine_compile", "replay_status", "alert_list", "jarvis_morning_brief",
            "deriv_ea_status", "deriv_ea_backtest_dry"
        )) {
            if ($requiredTool -notin $names) {
                Add-Error "Expected-tools manifest is missing $requiredTool."
            }
        }
    } catch {
        Add-Error "Expected-tools manifest is invalid JSON: $($_.Exception.Message)"
    }
}

$hashManifestPath = Join-Path $SkillRoot "tests\script-hashes.json"
if (Test-Path -LiteralPath $hashManifestPath -PathType Leaf) {
    try {
        $hashManifest = Get-Content -LiteralPath $hashManifestPath -Raw | ConvertFrom-Json -ErrorAction Stop
        foreach ($entry in @($hashManifest.files)) {
            $scriptPath = Join-Path $SkillRoot ([string]$entry.file)
            if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
                Add-Error "Hash manifest file is missing: $($entry.file)"
                continue
            }
            $actualHash = (Get-FileHash -LiteralPath $scriptPath -Algorithm SHA256).Hash
            if ($actualHash -ne [string]$entry.sha256) {
                Add-Error "Script hash mismatch: $($entry.file)"
            }
        }
    } catch {
        Add-Error "Script hash manifest is invalid: $($_.Exception.Message)"
    }
}
$result = [ordered]@{
    ok = ($errors.Count -eq 0)
    skillRoot = if (Test-Path $SkillRoot) { (Resolve-Path $SkillRoot).Path } else { $SkillRoot }
    fileCount = $allFiles.Count
    errors = @($errors)
}
$result | ConvertTo-Json -Depth 10
if ($errors.Count -gt 0) { exit 1 }
