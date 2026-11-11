import React, { useState } from 'react';
import { Event } from '../types';
import { analyzeEvent } from '../api';
import { describeEvent, isCrashRelated, relativeTime } from '../knownEvents';
import './EventDetail.css';

interface EventDetailProps {
  event: Event;
}

const EventDetail: React.FC<EventDetailProps> = ({ event }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const { title, meaning } = describeEvent(event);
  const crash = isCrashRelated(event);
  const when = new Date(event.timeCreated);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);
    try {
      const result = await analyzeEvent(event);
      setAnalysis(result.analysis);
      setModel(result.model);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="event-detail-container">
      <h2>Event details</h2>
      <div className="event-detail-content">
        <div className="event-header">
          <span className={`severity severity-${event.level.toLowerCase()}`}>{event.level}</span>
          <span className="event-id">Event {event.eventID}</span>
        </div>

        <h3 className="event-title">{title}</h3>
        {meaning && <p className="event-meaning">{meaning}</p>}

        {crash && (
          <div className="crash-warning">
            <strong>Possibly crash-related</strong>
            <p>This event matches patterns seen before a crash, reboot, or freeze. Start here.</p>
          </div>
        )}

        <dl className="facts">
          <dt>When</dt>
          <dd>{when.toLocaleString()} <span className="muted">({relativeTime(event.timeCreated)})</span></dd>
          <dt>Source</dt>
          <dd>{event.source}</dd>
          <dt>Computer</dt>
          <dd>{event.computer || 'n/a'}</dd>
          {event.category && event.category !== 'None' && (
            <>
              <dt>Category</dt>
              <dd>{event.category}</dd>
            </>
          )}
        </dl>

        <details className="raw-message">
          <summary>Original message</summary>
          <pre>{event.message || '(no message)'}</pre>
        </details>

        <div className="ai-panel">
          <div className="ai-panel-header">
            <h4>Ask the local AI</h4>
            <button className="btn-analyze" onClick={runAnalysis} disabled={analyzing}>
              {analyzing ? 'Analyzing…' : analysis ? 'Analyze again' : 'Explain with Ollama'}
            </button>
          </div>
          <p className="muted small">
            Sends this event to your local Ollama model. Nothing leaves your computer.
          </p>

          {analyzing && <div className="ai-loading">Thinking… this can take a minute on the first run.</div>}
          {analysisError && <div className="ai-error">{analysisError}</div>}
          {analysis && (
            <div className="ai-result">
              {model && <div className="muted small">Model: {model}</div>}
              <pre>{analysis}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventDetail;
