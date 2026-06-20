param(
  [string]$OutputDir = "work\wslgpu-scaling",
  [int]$MaxSequence = 768,
  [int]$BudgetMiB = 24000,
  [int]$NumModels = 1,
  [int]$NumRecycle = 2,
  [int]$TimeoutSeconds = 7200,
  [switch]$ContinueOnFailure
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root
$outDir = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$targets = @(
  @{ name = "insulin"; label = "Insulin B-chain"; residues = 30; sequence = "FVNQHLCGSHLVEALYLVCGERGFFYTPKA" },
  @{ name = "collagen"; label = "Collagen peptide"; residues = 30; sequence = "PPGPPGPPGITGARGLAGPPGPPGPPGPPG" },
  @{ name = "hemoglobin-alpha"; label = "Hemoglobin alpha"; residues = 141; sequence = "VLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR" },
  @{ name = "myoglobin"; label = "Myoglobin"; residues = 154; sequence = "VLSEGEWQLVLHVWAKVEADVAGHGQDILIRLFKSHPETLEKFDRFKHLKTEAEMKASEDLKKHGVTVLTALGAILKKKGHHEAELKPLAQSHATKHKIPIKYLEFISEAIIHVLHSRHPGDFGADAQGAMNKALELFRKDIAAKYKELGYQG" },
  @{ name = "lysozyme"; label = "Lysozyme"; residues = 164; sequence = "MNIFEMLRIDEGLRLKIYKATEGYYTIGIGHLLTKSPSLNAAKSELDKAIGRNTNGVITKDEAEKLFNQDVDAAVRGILRNAKLKPVYDSLDAVRRAALINMVFQMGETGVAGFTNSLRMLQQKRWDEAAVNLAKSRWYNQTPNRAKRVITTFRTGTWDAYKNL" },
  @{ name = "gfp"; label = "GFP"; residues = 238; sequence = "MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFYVQCFSRYPDHMKRHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK" }
)

$oldMax = $env:AF_COMPANION_MAX_SEQUENCE
$oldBudget = $env:AF_COMPANION_VRAM_BUDGET_MIB
$env:AF_COMPANION_MAX_SEQUENCE = "$MaxSequence"
$env:AF_COMPANION_VRAM_BUDGET_MIB = "$BudgetMiB"
$rows = @()

try {
  foreach ($target in $targets) {
    $artifact = Join-Path $outDir "$($target.name).json"
    $stdout = Join-Path $outDir "$($target.name).stdout.log"
    $gpu = Join-Path $outDir "$($target.name).gpu.csv"
    "timestamp,name,memory_total_mib,memory_used_mib,utilization_gpu_pct" | Set-Content -LiteralPath $gpu -Encoding utf8
    $job = Start-Job -ArgumentList $gpu -ScriptBlock {
      param($gpu)
      while ($true) {
        $sample = nvidia-smi --query-gpu=timestamp,name,memory.total,memory.used,utilization.gpu --format=csv,noheader,nounits 2>$null
        if ($sample) { Add-Content -LiteralPath $gpu -Value $sample -Encoding utf8 }
        Start-Sleep -Seconds 2
      }
    }
    Write-Host "== $($target.label) ($($target.residues) aa) =="
    $started = Get-Date
    $exit = 0
    & powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\Run-LocalColabFoldSmoke.ps1") -UseWslGpu -NumModels $NumModels -NumRecycle $NumRecycle -TimeoutSeconds $TimeoutSeconds -Sequence $target.sequence -Output $artifact *> $stdout
    $exit = $LASTEXITCODE
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    $elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 2)
    $samples = Import-Csv -LiteralPath $gpu
    $peak = if ($samples) { ($samples | ForEach-Object { [int]($_.memory_used_mib.Trim()) } | Measure-Object -Maximum).Maximum } else { $null }
    $data = if (Test-Path -LiteralPath $artifact) { Get-Content -Raw -LiteralPath $artifact | ConvertFrom-Json } else { $null }
    $result = if ($data) { $data.result } else { $null }
    $meta = if ($result) { $result.meta } else { $null }
    $tail = if ($result) { [string]$result.provenance.metadata.stdout_tail } else { "" }
    $plddt = if ($result) { @($result.plddt) } else { @() }
    $row = [pscustomobject]@{
      name = $target.name; label = $target.label; residues = $target.residues; exit_code = $exit;
      elapsed_seconds = $elapsed; backend_runtime_seconds = if ($meta) { $meta.runtime_seconds } else { $null };
      peak_gpu_mib = $peak; frames = if ($result) { @($result.frames).Count } else { $null };
      mean_plddt = if ($plddt.Count) { [math]::Round(($plddt | Measure-Object -Average).Average, 2) } else { $null };
      guardrail_estimate_mib = if ($meta) { $meta.guardrail.estimate_mib } else { $null };
      guardrail_budget_mib = if ($meta) { $meta.guardrail.budget_mib } else { $null };
      running_on_gpu = $tail.Contains("Running on GPU"); cached = if ($meta) { $meta.cached } else { $null };
      artifact = $artifact; stdout = $stdout; gpu_csv = $gpu
    }
    $rows += $row
    $row | ConvertTo-Json -Depth 5
    if ($exit -ne 0 -and -not $ContinueOnFailure) { break }
  }
} finally {
  if ($null -eq $oldMax) { Remove-Item Env:AF_COMPANION_MAX_SEQUENCE -ErrorAction SilentlyContinue } else { $env:AF_COMPANION_MAX_SEQUENCE = $oldMax }
  if ($null -eq $oldBudget) { Remove-Item Env:AF_COMPANION_VRAM_BUDGET_MIB -ErrorAction SilentlyContinue } else { $env:AF_COMPANION_VRAM_BUDGET_MIB = $oldBudget }
}

$summaryJson = Join-Path $outDir "summary.json"
$summaryMd = Join-Path $outDir "summary.md"
$rows | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryJson -Encoding utf8
$lines = @("# WSL GPU Scaling Ladder", "", "| Target | Residues | Exit | Runtime (s) | Backend (s) | Peak GPU MiB | Frames | Mean pLDDT | GPU log | Cached |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |")
foreach ($row in $rows) { $lines += "| $($row.label) | $($row.residues) | $($row.exit_code) | $($row.elapsed_seconds) | $($row.backend_runtime_seconds) | $($row.peak_gpu_mib) | $($row.frames) | $($row.mean_plddt) | $($row.running_on_gpu) | $($row.cached) |" }
$lines | Set-Content -LiteralPath $summaryMd -Encoding utf8
Write-Host "Summary: $summaryJson"
Write-Host "Markdown: $summaryMd"
