// Local backend for the Windows Event Debugger.
//  - GET  /api/events?log=System&hours=48&max=200  -> reads Windows event logs via PowerShell
//  - POST /api/analyze  { event }                   -> asks a local Ollama model to explain the event
//  - GET  /api/health                               -> status check
//
// Uses only Node built-in modules. Listens on 127.0.0.1 only.

const http = require('http');
const { execFile } = require('child_process');
const metrics = require('./metrics');

const PORT = Number(process.env.PORT) || 4000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3-coder:30b';

const ALLOWED_LOGS = ['System', 'Application', 'Security'];

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---------- Windows event logs ----------

function runPowerShell(script) {
  // -EncodedCommand avoids all quoting problems when passing the script to powershell.exe
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { maxBuffer: 64 * 1024 * 1024, timeout: 60_000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || 'PowerShell failed').trim()));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function normalizeLevel(level) {
  if (level === 'Critical') return 'Critical';
  if (level === 'Error') return 'Error';
  if (level === 'Warning') return 'Warning';
  // Information, Verbose, empty (Security log) and anything else
  return 'Information';
}

async function getEvents({ log, hours, max }) {
  const script = `
$ErrorActionPreference = 'Stop'
$start = (Get-Date).AddHours(-${hours})
try {
  $events = Get-WinEvent -FilterHashtable @{ LogName = '${log}'; StartTime = $start } -MaxEvents ${max} -ErrorAction Stop
} catch [System.Exception] {
  if ($_.Exception.Message -like '*No events were found*') { $events = @() } else { throw }
}
$list = @()
foreach ($e in $events) {
  $user = ''
  if ($e.UserId) { $user = $e.UserId.Value }
  $list += [pscustomobject]@{
    id          = [string]$e.RecordId
    source      = [string]$e.ProviderName
    level       = [string]$e.LevelDisplayName
    eventID     = [int]$e.Id
    timeCreated = $e.TimeCreated.ToString('o')
    message     = [string]$e.Message
    computer    = [string]$e.MachineName
    userID      = [string]$user
    keywords    = @([string]$e.KeywordsDisplayNames)
    category    = [string]$e.TaskDisplayName
  }
}
ConvertTo-Json -InputObject @($list) -Depth 4 -Compress
`;
  const out = (await runPowerShell(script)).trim();
  if (!out) return [];
  const parsed = JSON.parse(out);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map((e) => ({
    ...e,
    level: normalizeLevel(e.level),
    keywords: (Array.isArray(e.keywords) ? e.keywords : []).filter(Boolean),
  }));
}

// ---------- Ollama ----------

function buildPrompt(event) {
  return `You are a Windows troubleshooting assistant. Explain this Windows event log entry to a non-expert.

Event:
- Log source: ${event.source}
- Event ID: ${event.eventID}
- Level: ${event.level}
- Time: ${event.timeCreated}
- Category: ${event.category || 'n/a'}
- Message:
"""
${String(event.message || '').slice(0, 4000)}
"""

Answer using exactly these headings:
1. What happened: one or two plain-English sentences.
2. Is it serious: Low, Medium, or High, with a short reason.
3. Likely causes: up to 3 short bullets, most likely first.
4. What to check: up to 5 numbered, safe, read-only or reversible steps. Give exact Windows commands or menu locations where useful. Do not suggest deleting system files, editing the registry without a backup, or disabling security features.

Be concise. If the message is not enough to know the cause, say so.`;
}

function analyzeWithOllama(event) {
  return askOllama(buildPrompt(event));
}

async function askOllama(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        think: false,
        options: { temperature: 0.2 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama returned ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    return (data.message && data.message.content || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Slowness troubleshooting ----------

function buildSlownessPrompt(summary, note) {
  const s = summary.stats;
  const line = (label, key, unit) =>
    `- ${label}: latest ${s[key].latest}${unit}, average ${s[key].avg}${unit}, peak ${s[key].max}${unit}`;
  const procs = summary.topProcesses.length
    ? summary.topProcesses
        .map((p) => `  - ${p.name}: avg ${p.avgCpuPct}% of total CPU, near the top in ${p.appearances} samples`)
        .join('\n')
    : '  - (no process data)';
  return `You are a Windows performance troubleshooting assistant. A user says their PC is slow.
Use only the numbers below. Do not invent measurements.

Performance over the last ${summary.windowMinutes} minutes (${summary.sampleCount} samples, about every 2 seconds):
${line('CPU use (%)', 'cpuPct', '%')}
${line('Memory in use (%)', 'memUsedPct', '%')}
${line('Memory available (MB)', 'memAvailMB', ' MB')}
${line('Disk busy (%)', 'diskBusyPct', '%')}
${line('Disk throughput (MB/s)', 'diskMBps', ' MB/s')}
${line('Network throughput (MB/s)', 'netMBps', ' MB/s')}

Processes most often using CPU:
${procs}
${note ? `\nUser's note: ${note.slice(0, 500)}\n` : ''}
Answer using exactly these headings:
1. Likely bottleneck: CPU, memory, disk, network, or none obvious. One sentence on why, citing the numbers.
2. Top suspects: up to 3 bullets, citing process names or numbers from the data above.
3. What to check: up to 5 numbered, safe, reversible steps (for example Task Manager tabs, closing or restarting a named app, checking startup apps, reviewing Windows Update, running sfc /scannow if disk or memory issues look likely). Do not suggest deleting system files, editing the registry without a backup, or disabling security features.
4. What the data cannot tell you: one or two sentences.

Be concise.`;
}

// ---------- HTTP server ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, model: OLLAMA_MODEL, ollama: OLLAMA_URL });
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      const log = url.searchParams.get('log') || 'System';
      if (!ALLOWED_LOGS.includes(log)) {
        return send(res, 400, { error: `log must be one of ${ALLOWED_LOGS.join(', ')}` });
      }
      const hours = Math.min(Math.max(Number(url.searchParams.get('hours')) || 48, 1), 24 * 30);
      const max = Math.min(Math.max(Number(url.searchParams.get('max')) || 200, 1), 1000);
      try {
        const events = await getEvents({ log, hours: Math.floor(hours), max: Math.floor(max) });
        return send(res, 200, { events });
      } catch (err) {
        return send(res, 500, {
          error: `Could not read the ${log} log. Security log usually needs an administrator terminal. (${err.message})`,
        });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/metrics') {
      metrics.ensureSampler();
      const minutes = Math.min(Math.max(Number(url.searchParams.get('minutes')) || 10, 1), 20);
      return send(res, 200, {
        samples: metrics.getSamples(minutes),
        status: metrics.status(),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/troubleshoot') {
      metrics.ensureSampler();
      const body = await readBody(req);
      const summary = metrics.summarize(5);
      if (!summary) {
        return send(res, 503, {
          error: 'Still collecting performance data. Wait about 10 seconds and try again.',
          status: metrics.status(),
        });
      }
      try {
        const analysis = await askOllama(buildSlownessPrompt(summary, typeof body.note === 'string' ? body.note : ''));
        return send(res, 200, { analysis, model: OLLAMA_MODEL, summary });
      } catch (err) {
        const reason = err.name === 'AbortError' ? 'Ollama took too long to answer' : err.message;
        return send(res, 502, {
          error: `Could not reach Ollama at ${OLLAMA_URL}. Is it running? (${reason})`,
          summary,
        });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      const body = await readBody(req);
      const event = body.event;
      if (!event || typeof event.message !== 'string') {
        return send(res, 400, { error: 'Body must include event with a message' });
      }
      try {
        const analysis = await analyzeWithOllama(event);
        return send(res, 200, { analysis, model: OLLAMA_MODEL });
      } catch (err) {
        const reason = err.name === 'AbortError' ? 'Ollama took too long to answer' : err.message;
        return send(res, 502, {
          error: `Could not reach Ollama at ${OLLAMA_URL}. Is it running? (${reason})`,
        });
      }
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    send(res, 400, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Event debugger API on http://127.0.0.1:${PORT}`);
  console.log(`Ollama: ${OLLAMA_URL}  model: ${OLLAMA_MODEL}`);
});
