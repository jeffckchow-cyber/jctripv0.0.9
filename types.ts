
export enum EventCategory {
  TRANSPORT = 'TRANSPORT',
  ACCOMMODATION = 'ACCOMMODATION',
  SIGHTSEEING = 'SIGHTSEEING',
  DINING = 'DINING',
  ACTIVITY = 'ACTIVITY',
  NOTE = 'NOTE'
}

// Define TabType for use in App state
export type TabType = 'itinerary' | 'stay' | 'transport' | 'budget' | 'notes';

// Define ModalMode for use in App state
export type ModalMode = 'event' | 'accommodation' | 'flight' | 'otherTransport' | 'trip' | 'expense' | null;

export interface HighlightLabel {
  text: string;
  type: string; // Flexible type to allow user custom tags
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  data: string; // Base64 encoded string
}

export interface ItineraryEvent {
  id: string;
  title: string;
  category: EventCategory;
  startTime: string; // ISO string
  location?: string;
  mapLink?: string; // Google Maps URL
  notes?: string;
  isCompleted: boolean;
  cost?: number;
  labels?: HighlightLabel[];
  reservationCode?: string;
  story?: string;
  color?: string; // Hex color for the bubble/accent
  attachments?: Attachment[];
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  receiptUrl?: string; // Base64 of receipt
}

export interface FlightInfo {
  id: string;
  flightNo: string;
  departure: string; // From airport
  arrival: string;   // To airport
  departureTime: string; // ISO datetime string (date + time)
  arrivalTime: string;   // ISO datetime string (date + time)
  bookingNumber?: string;
  ticketUrl?: string; // Base64 or URL for uploaded ticket image/pdf
  attachments?: Attachment[];
}

export interface OtherTransport {
  id: string;
  type: string; // e.g. Train, Car Hire, Bus
  title: string;
  details: string;
  time: string;
  attachments?: Attachment[];
}

export interface Accommodation {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  location?: string;
  mapLink?: string;
  notes?: string;
  attachments?: Attachment[];
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  events: ItineraryEvent[];
  participants: string[];
  flights: FlightInfo[];
  otherTransport: OtherTransport[];
  accommodations: Accommodation[];
  expenses: Expense[];
  budget: number;
  headerImage?: string; // Base64 or URL for the backdrop photo
  headerImagePosition?: number; // Vertical position percentage (0-100)
  tripNotes?: string; // Global scratchpad for the trip
  cloudId?: string; // ID for cloud synchronization
  lastSynced?: string; // ISO timestamp
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}
