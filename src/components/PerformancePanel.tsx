import React, { useEffect, useState } from 'react';
import { fetchMetrics, troubleshootSlowness, PerfSample } from '../api';
import LineChart from './LineChart';
import './PerformancePanel.css';

const WINDOW_MINUTES = 10;

const PerformancePanel: React.FC = () => {
  const [samples, setSamples] = useState<PerfSample[]>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(true);
  const [note, setNote] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisModel, setAnalysisModel] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Poll the sampler every 2 seconds while this panel is visible
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchMetrics(WINDOW_MINUTES);
        if (cancelled) return;
        setSamples(data.samples);
        setCollecting(!data.status.running && data.samples.length === 0);
        setPollError(data.status.lastError && data.samples.length === 0 ? data.status.lastError : null);
      } catch (err) {
        if (!cancelled) setPollError(err instanceof Error ? err.message : String(err));
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const latest = samples[samples.length - 1];
  const values = (key: keyof PerfSample) => samples.map((s) => Number(s[key]) || 0);
  const peak = (key: keyof PerfSample) => (samples.length ? Math.max(...values(key)) : 0);
  const fmt = (n: number | undefined, d = 1) => (n === undefined ? '–' : n.toFixed(d));

  const runTroubleshoot = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);
    try {
      const result = await troubleshootSlowness(note);
      setAnalysis(result.analysis);
      setAnalysisModel(result.model);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  if (pollError && samples.length === 0) {
    return (
      <div className="perf-panel">
        <div className="perf-error">
          Performance data is not available: {pollError}
          <br />
          Make sure the backend is running (<code>npm run server</code>).
        </div>
      </div>
    );
  }

  return (
    <div className="perf-panel">
      {collecting && samples.length === 0 && (
        <div className="perf-hint">Reading performance counters. The first samples arrive in a few seconds.</div>
      )}

      <div className="chart-grid">
        <LineChart
          title="CPU"
          unit="%"
          yMax={100}
          series={[{ label: 'CPU %', color: '#2563eb', values: values('cpuPct') }]}
          currentText={`${fmt(latest?.cpuPct)}%`}
          peakText={`${fmt(peak('cpuPct'))}%`}
        />
        <LineChart
          title="Memory"
          unit="%"
          yMax={100}
          series={[{ label: 'In use %', color: '#7c3aed', values: values('memUsedPct') }]}
          currentText={`${fmt(latest?.memUsedPct)}% used`}
          peakText={`${fmt(peak('memUsedPct'))}%`}
          note={latest ? `${Math.round(latest.memAvailMB).toLocaleString()} MB available` : undefined}
        />
        <LineChart
          title="Network"
          unit=" MB/s"
          series={[{ label: 'MB/s (all adapters)', color: '#0d9488', values: values('netMBps') }]}
          currentText={`${fmt(latest?.netMBps, 2)} MB/s`}
          peakText={`${fmt(peak('netMBps'), 2)} MB/s`}
        />
        <LineChart
          title="Disk"
          unit="%"
          yMax={100}
          series={[{ label: 'Busy %', color: '#ea580c', values: values('diskBusyPct') }]}
          currentText={`${fmt(latest?.diskBusyPct)}% busy`}
          peakText={`${fmt(peak('diskBusyPct'))}%`}
          note={latest ? `Throughput ${fmt(latest.diskMBps, 2)} MB/s` : undefined}
        />
      </div>

      <div className="perf-bottom">
        <div className="perf-procs">
          <h4>Top CPU processes right now</h4>
          {latest && latest.topCpu.length > 0 ? (
            <table>
              <tbody>
                {latest.topCpu.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="num">{fmt(p.cpuPct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small">No process data yet.</p>
          )}
          <p className="muted small">Percent of total CPU across all cores. Last {WINDOW_MINUTES} minutes shown in the charts.</p>
        </div>

        <div className="ai-panel perf-ai">
          <div className="ai-panel-header">
            <h4>Ask Ollama why it is slow</h4>
          </div>
          <p className="muted small">
            Sends the last 5 minutes of numbers and the top processes to your local model. Nothing leaves your computer.
          </p>
          <label className="note-label">
            Optional note (what were you doing when it slowed down?)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. opening Chrome with many tabs, during a Teams call"
            />
          </label>
          <button className="btn-analyze" onClick={runTroubleshoot} disabled={analyzing}>
            {analyzing ? 'Analyzing…' : analysis ? 'Analyze again' : 'Troubleshoot slowness'}
          </button>

          {analyzing && <div className="ai-loading">Thinking… this can take a minute on the first run.</div>}
          {analysisError && <div className="ai-error">{analysisError}</div>}
          {analysis && (
            <div className="ai-result">
              {analysisModel && <div className="muted small">Model: {analysisModel}</div>}
              <pre>{analysis}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformancePanel;
