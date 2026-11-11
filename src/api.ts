import { Event } from './types';

export interface EventQuery {
  log: 'System' | 'Application' | 'Security';
  hours: number;
  max?: number;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchEvents(query: EventQuery): Promise<Event[]> {
  const params = new URLSearchParams({
    log: query.log,
    hours: String(query.hours),
    max: String(query.max ?? 200),
  });
  const res = await fetch(`/api/events?${params}`);
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return (data.events as Event[]).map((e) => ({ ...e, timeCreated: new Date(e.timeCreated) }));
}

export interface PerfSample {
  t: string;
  cpuPct: number;
  memUsedPct: number;
  memAvailMB: number;
  diskBusyPct: number;
  diskMBps: number;
  netMBps: number;
  topCpu: { name: string; cpuPct: number }[];
}

export interface PerfSummary {
  windowMinutes: number;
  sampleCount: number;
  stats: Record<string, { avg: number; max: number; latest: number }>;
  topProcesses: { name: string; appearances: number; avgCpuPct: number }[];
}

export async function fetchMetrics(minutes: number): Promise<{ samples: PerfSample[]; status: { running: boolean; lastError: string | null; collected: number } }> {
  const res = await fetch(`/api/metrics?minutes=${minutes}`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function troubleshootSlowness(note: string): Promise<{ analysis: string; model: string; summary: PerfSummary }> {
  const res = await fetch('/api/troubleshoot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function analyzeEvent(event: Event): Promise<{ analysis: string; model: string }> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: { ...event, timeCreated: new Date(event.timeCreated).toISOString() } }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
