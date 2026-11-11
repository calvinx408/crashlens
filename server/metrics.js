// Performance sampler: one long-running PowerShell process reads Windows performance
// counters every few seconds and prints one JSON line per sample. The server keeps
// the most recent samples in memory.

const { spawn } = require('child_process');

const SAMPLE_SECONDS = 2;
const MAX_SAMPLES = 600; // about 20 minutes at 2 s

const samples = [];
let child = null;
let restartTimer = null;
let started = false;
let lastError = null;
let buffer = '';

// Note: in a JS template literal, '\\' produces a single backslash for PowerShell.
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$cores = [Math]::Max(1, [int]$env:NUMBER_OF_PROCESSORS)
$paths = @(
  '\\Processor(_Total)\\% Processor Time',
  '\\Memory\\% Committed Bytes In Use',
  '\\Memory\\Available MBytes',
  '\\PhysicalDisk(_Total)\\% Disk Time',
  '\\PhysicalDisk(_Total)\\Disk Bytes/sec',
  '\\Network Interface(*)\\Bytes Total/sec',
  '\\Process(*)\\% Processor Time'
)
while ($true) {
  $set = Get-Counter -Counter $paths -ErrorAction SilentlyContinue
  $cpu = 0; $memUsed = 0; $memAvail = 0; $diskBusy = 0; $diskBps = 0; $netBps = 0
  $procs = @{}
  if ($set) {
    foreach ($s in $set.CounterSamples) {
      $p = $s.Path.ToLower()
      $v = [double]$s.CookedValue
      if ($p -like '*processor(_total)*% processor time') { $cpu = $v }
      elseif ($p -like '*committed bytes in use*') { $memUsed = $v }
      elseif ($p -like '*\\memory\\available mbytes*') { $memAvail = $v }
      elseif ($p -like '*physicaldisk(_total)*% disk time*') { $diskBusy = $v }
      elseif ($p -like '*physicaldisk(_total)*disk bytes/sec*') { $diskBps = $v }
      elseif ($p -like '*network interface(*bytes total/sec*') {
        if ($s.InstanceName -notlike '*loopback*') { $netBps += $v }
      }
      elseif ($p -like '*\\process(*% processor time') {
        $name = ($s.InstanceName -replace '#\\d+$', '')
        if ($name -ne '_total' -and $name -ne 'idle') {
          if ($procs.ContainsKey($name)) { $procs[$name] += $v } else { $procs[$name] = $v }
        }
      }
    }
  }
  $top = @($procs.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5 | ForEach-Object {
    [pscustomobject]@{ name = [string]$_.Key; cpuPct = [math]::Round($_.Value / $cores, 1) }
  })
  $obj = [pscustomobject]@{
    t = (Get-Date).ToString('o')
    cpuPct = [math]::Round($cpu, 1)
    memUsedPct = [math]::Round($memUsed, 1)
    memAvailMB = [math]::Round($memAvail, 0)
    diskBusyPct = [math]::Round($diskBusy, 1)
    diskMBps = [math]::Round($diskBps / 1MB, 2)
    netMBps = [math]::Round($netBps / 1MB, 2)
    topCpu = $top
  }
  Write-Output (ConvertTo-Json -InputObject $obj -Depth 4 -Compress)
  Start-Sleep -Seconds ${SAMPLE_SECONDS}
}
`;

function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return;
  try {
    samples.push(JSON.parse(trimmed));
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    lastError = null;
  } catch {
    // ignore partial or malformed lines
  }
}

function startChild() {
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true }
  );
  buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
    }
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8').trim();
    if (text) lastError = text.slice(0, 300);
  });
  child.on('exit', (code) => {
    child = null;
    if (!started) return;
    lastError = lastError || `Sampler stopped (exit ${code}), restarting`;
    restartTimer = setTimeout(startChild, 5000);
  });
}

function ensureSampler() {
  started = true;
  if (!child && !restartTimer) startChild();
  if (restartTimer && !child) {
    clearTimeout(restartTimer);
    restartTimer = null;
    startChild();
  }
}

function stopSampler() {
  started = false;
  if (restartTimer) clearTimeout(restartTimer);
  if (child) child.kill();
}

function getSamples(minutes) {
  const since = Date.now() - minutes * 60_000;
  return samples.filter((s) => new Date(s.t).getTime() >= since);
}

function summarize(minutes) {
  const list = getSamples(minutes);
  if (list.length === 0) return null;
  const keys = ['cpuPct', 'memUsedPct', 'memAvailMB', 'diskBusyPct', 'diskMBps', 'netMBps'];
  const stats = {};
  for (const k of keys) {
    const vals = list.map((s) => Number(s[k]) || 0);
    stats[k] = {
      avg: round(vals.reduce((a, b) => a + b, 0) / vals.length),
      max: round(Math.max(...vals)),
      latest: round(vals[vals.length - 1]),
    };
  }
  // Which processes were most often at the top of CPU use
  const counts = {};
  for (const s of list) {
    for (const p of s.topCpu || []) {
      counts[p.name] = counts[p.name] || { appearances: 0, cpuSum: 0 };
      counts[p.name].appearances += 1;
      counts[p.name].cpuSum += p.cpuPct;
    }
  }
  const topProcesses = Object.entries(counts)
    .map(([name, c]) => ({ name, appearances: c.appearances, avgCpuPct: round(c.cpuSum / c.appearances) }))
    .sort((a, b) => b.avgCpuPct - a.avgCpuPct)
    .slice(0, 6);
  return { windowMinutes: minutes, sampleCount: list.length, stats, topProcesses };
}

function round(n) {
  return Math.round(n * 10) / 10;
}

function status() {
  return { running: !!child, lastError, collected: samples.length };
}

module.exports = { ensureSampler, stopSampler, getSamples, summarize, status };
