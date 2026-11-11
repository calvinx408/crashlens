import React, { useMemo, useState } from 'react';
import { Event } from '../types';
import { describeEvent, isCrashRelated, relativeTime } from '../knownEvents';
import './EventList.css';

interface EventListProps {
  events: Event[];
  selectedEvent: Event | null;
  onSelectEvent: (event: Event) => void;
  loading: boolean;
}

type SortKey = 'level' | 'eventID' | 'source' | 'timeCreated';

const LEVEL_RANK: Record<Event['level'], number> = { Critical: 4, Error: 3, Warning: 2, Information: 1 };

const EventList: React.FC<EventListProps> = ({ events, selectedEvent, onSelectEvent, loading }) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'timeCreated', dir: 'desc' });

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'timeCreated' ? 'desc' : 'asc' }
    );
  };

  const sortedEvents = useMemo(() => {
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...events].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sort.key) {
        case 'level': av = LEVEL_RANK[a.level]; bv = LEVEL_RANK[b.level]; break;
        case 'eventID': av = a.eventID; bv = b.eventID; break;
        case 'source': av = a.source; bv = b.source; break;
        default: av = new Date(a.timeCreated).getTime(); bv = new Date(b.timeCreated).getTime();
      }
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return 0;
    });
  }, [events, sort]);

  const crashCount = useMemo(() => events.filter(isCrashRelated).length, [events]);

  const headerClass = (key: SortKey) =>
    `sortable ${sort.key === key ? sort.dir : ''}`;

  if (loading && events.length === 0) {
    return (
      <div className="event-list-container">
        <h2>Events</h2>
        <div className="loading">Reading event log…</div>
      </div>
    );
  }

  return (
    <div className="event-list-container">
      <div className="events-header">
        <h2>Events ({sortedEvents.length})</h2>
        {crashCount > 0 && (
          <span className="crash-count">{crashCount} possibly crash-related</span>
        )}
      </div>

      <div className="event-table-container">
        <table className="event-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('level')} className={headerClass('level')}>Severity</th>
              <th onClick={() => toggleSort('timeCreated')} className={headerClass('timeCreated')}>When</th>
              <th>What happened</th>
              <th onClick={() => toggleSort('eventID')} className={headerClass('eventID')}>ID</th>
              <th onClick={() => toggleSort('source')} className={headerClass('source')}>Source</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.length === 0 ? (
              <tr>
                <td colSpan={5} className="no-events">
                  No events match your filters. Try a longer time range or clear the filters.
                </td>
              </tr>
            ) : (
              sortedEvents.map((event) => {
                const { title } = describeEvent(event);
                const crash = isCrashRelated(event);
                return (
                  <tr
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                    className={`${selectedEvent?.id === event.id ? 'selected' : ''} ${crash ? 'row-crash' : ''}`}
                  >
                    <td>
                      <span className={`severity severity-${event.level.toLowerCase()}`}>{event.level}</span>
                    </td>
                    <td className="when-cell" title={new Date(event.timeCreated).toLocaleString()}>
                      {relativeTime(event.timeCreated)}
                    </td>
                    <td className="what-cell">
                      {crash && <span className="crash-tag">CRASH</span>}
                      <span className="what-title">{title}</span>
                    </td>
                    <td>{event.eventID}</td>
                    <td className="source-cell">{event.source}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EventList;
