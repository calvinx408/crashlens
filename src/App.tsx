import React, { useEffect, useMemo, useState, useCallback } from 'react';
import './App.css';
import './readable.css';
import EventList from './components/EventList';
import EventFilter from './components/EventFilter';
import EventDetail from './components/EventDetail';
import PerformancePanel from './components/PerformancePanel';
import { Event } from './types';
import { fetchEvents, EventQuery } from './api';

interface Filters {
  level?: string[];
  source?: string[];
  startDate?: Date;
  endDate?: Date;
  searchQuery?: string;
}

// Demo data, used only when the backend (npm run server) is not running
const MOCK_EVENTS: Event[] = [
  {
    id: 'mock-1', source: 'Microsoft-Windows-Kernel-Power', level: 'Critical', eventID: 41,
    timeCreated: new Date(Date.now() - 2 * 3600_000),
    message: 'The system has rebooted without cleanly shutting down first. The computer has rebooted from a bugcheck. BugcheckCode: 0x0000000a',
    computer: 'DESKTOP-ABC123', userID: '', keywords: ['Kernel'], category: 'Unknown'
  },
  {
    id: 'mock-2', source: 'Application Error', level: 'Error', eventID: 1000,
    timeCreated: new Date(Date.now() - 5 * 3600_000),
    message: 'Faulting application name: chrome.exe, Faulting module name: ntdll.dll, Exception code: 0xc0000005',
    computer: 'DESKTOP-ABC123', userID: '', keywords: ['Classic'], category: '(100)'
  },
  {
    id: 'mock-3', source: 'System', level: 'Warning', eventID: 2001,
    timeCreated: new Date(Date.now() - 8 * 3600_000),
    message: 'Disk space is running low on C: drive',
    computer: 'DESKTOP-ABC123', userID: '', keywords: ['Warning'], category: 'None'
  },
  {
    id: 'mock-4', source: 'Service Control Manager', level: 'Error', eventID: 7034,
    timeCreated: new Date(Date.now() - 26 * 3600_000),
    message: 'The Print Spooler service terminated unexpectedly. It has done this 1 time(s).',
    computer: 'DESKTOP-ABC123', userID: '', keywords: ['Classic'], category: 'None'
  }
];

const LOGS: EventQuery['log'][] = ['System', 'Application', 'Security'];

function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [log, setLog] = useState<EventQuery['log']>('System');
  const [hours, setHours] = useState<number>(48);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState<boolean>(false);
  const [filters, setFilters] = useState<Filters>({});
  const [view, setView] = useState<'events' | 'performance'>('events');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEvents({ log, hours });
      setEvents(data);
      setUsingMock(false);
      setError(null);
    } catch (err) {
      // Backend not running: show demo data so the UI is still usable
      setEvents(MOCK_EVENTS);
      setUsingMock(true);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [log, hours]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelectedEvent(null);
  }, [log, hours]);

  const filteredEvents = useMemo(() => {
    const q = (filters.searchQuery || '').trim().toLowerCase();
    return events.filter((event) => {
      if (filters.level?.length && !filters.level.includes(event.level)) return false;
      if (filters.source?.length && !filters.source.includes(event.source)) return false;
      if (filters.startDate && event.timeCreated < filters.startDate) return false;
      if (filters.endDate && event.timeCreated > filters.endDate) return false;
      if (q && !`${event.message} ${event.eventID} ${event.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, filters]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Windows Event Debugger</h1>
        <p>Find what went wrong, explained in plain language, with an optional local AI explanation</p>
      </header>

      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'events'}
            className={view === 'events' ? 'tab active' : 'tab'}
            onClick={() => setView('events')}
          >
            Events
          </button>
          <button
            role="tab"
            aria-selected={view === 'performance'}
            className={view === 'performance' ? 'tab active' : 'tab'}
            onClick={() => setView('performance')}
          >
            Performance
          </button>
        </div>

        {view === 'events' && (
        <>
        <label>
          Log
          <select value={log} onChange={(e) => setLog(e.target.value as EventQuery['log'])}>
            {LOGS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>
          Last
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={6}>6 hours</option>
            <option value={24}>24 hours</option>
            <option value={48}>2 days</option>
            <option value={168}>7 days</option>
            <option value={720}>30 days</option>
          </select>
        </label>
        <button className="btn-refresh" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {usingMock && (
          <span className="mock-banner">Showing demo data. {error}</span>
        )}
        {!usingMock && error && (
          <span className="mock-banner">{error}</span>
        )}
        </>
        )}
      </div>

      {view === 'performance' && (
        <main className="app-main">
          <PerformancePanel />
        </main>
      )}

      {view === 'events' && (
      <main className="app-main">
        <EventFilter onFilterChange={(f) => setFilters(f as Filters)} />

        <div className="content-container">
          <EventList
            events={filteredEvents}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            loading={loading}
          />

          {selectedEvent ? (
            <EventDetail key={selectedEvent.id} event={selectedEvent} />
          ) : (
            <div className="event-detail-container empty-detail">
              <p>Select an event on the left to see what it means and get an AI explanation.</p>
            </div>
          )}
        </div>
      </main>
      )}
    </div>
  );
}

export default App;
