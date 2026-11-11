import React, { useState, useEffect } from 'react';
import './EventFilter.css';

interface FilterOptions {
  level?: string[];
  source?: string[];
  startDate?: Date;
  endDate?: Date;
  searchQuery?: string;
}

interface EventFilterProps {
  onFilterChange: (filters: FilterOptions) => void;
}

const EventFilter: React.FC<EventFilterProps> = ({ onFilterChange }) => {
  const [filters, setFilters] = useState<FilterOptions>({
    level: [],
    source: [],
    startDate: undefined,
    endDate: undefined,
    searchQuery: ''
  });

  const [isExpanded, setIsExpanded] = useState(false);

  // Mock data for filter options
  const levels = ['Information', 'Warning', 'Error', 'Critical'];
  const sources = ['Application', 'System', 'Security', 'Setup', 'Windows PowerShell'];

  const handleLevelChange = (level: string) => {
    setFilters(prev => ({
      ...prev,
      level: (prev.level ?? []).includes(level)
        ? (prev.level ?? []).filter(l => l !== level)
        : [...(prev.level ?? []), level]
    }));
  };

  const handleSourceChange = (source: string) => {
    setFilters(prev => ({
      ...prev,
      source: (prev.source ?? []).includes(source)
        ? (prev.source ?? []).filter(s => s !== source)
        : [...(prev.source ?? []), source]
    }));
  };

  const handleDateChange = (type: 'startDate' | 'endDate', value: string) => {
    setFilters(prev => ({
      ...prev,
      [type]: value ? new Date(value) : undefined
    }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({
      ...prev,
      searchQuery: e.target.value
    }));
  };

  const applyFilters = () => {
    onFilterChange(filters);
  };

  const clearFilters = () => {
    setFilters({
      level: [],
      source: [],
      startDate: undefined,
      endDate: undefined,
      searchQuery: ''
    });
    onFilterChange({});
  };

  // Apply filters when they change
  useEffect(() => {
    const timer = setTimeout(() => {
      applyFilters();
    }, 500);

    return () => clearTimeout(timer);
  }, [filters]);

  return (
    <div className="event-filter-container">
      <div className="filter-header" onClick={() => setIsExpanded(!isExpanded)}>
        <h3>Filter Events</h3>
        <span className="toggle-icon">{isExpanded ? '−' : '+'}</span>
      </div>
      
      {isExpanded && (
        <div className="filter-content">
          <div className="filter-section">
            <h4>Event Level</h4>
            <div className="checkbox-group">
              {levels.map(level => (
                <label key={level} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.level?.includes(level) || false}
                    onChange={() => handleLevelChange(level)}
                  />
                  {level}
                </label>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <h4>Event Source</h4>
            <div className="checkbox-group">
              {sources.map(source => (
                <label key={source} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.source?.includes(source) || false}
                    onChange={() => handleSourceChange(source)}
                  />
                  {source}
                </label>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <h4>Date Range</h4>
            <div className="date-filters">
              <div className="date-input">
                <label>Start Date:</label>
                <input
                  type="datetime-local"
                  value={filters.startDate ? new Date(filters.startDate).toISOString().slice(0, 16) : ''}
                  onChange={(e) => handleDateChange('startDate', e.target.value)}
                />
              </div>
              <div className="date-input">
                <label>End Date:</label>
                <input
                  type="datetime-local"
                  value={filters.endDate ? new Date(filters.endDate).toISOString().slice(0, 16) : ''}
                  onChange={(e) => handleDateChange('endDate', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="filter-section">
            <h4>Search</h4>
            <input
              type="text"
              placeholder="Search in messages..."
              value={filters.searchQuery || ''}
              onChange={handleSearchChange}
              className="search-input"
            />
          </div>

          <div className="filter-actions">
            <button onClick={clearFilters} className="btn-clear">Clear Filters</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventFilter;