export interface Event {
  id: string;
  source: string;
  level: 'Information' | 'Warning' | 'Error' | 'Critical';
  eventID: number;
  timeCreated: Date;
  message: string;
  computer: string;
  userID: string;
  keywords: string[];
  category: string;
}

export interface FilterOptions {
  level?: string[];
  source?: string[];
  startDate?: Date;
  endDate?: Date;
  searchQuery?: string;
}