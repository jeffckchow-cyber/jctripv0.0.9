
import * as React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Trip, ItineraryEvent, EventCategory, Expense, FlightInfo, OtherTransport, Accommodation, HighlightLabel, Attachment, TabType, ModalMode } from './types';
import { getCityWeather } from './geminiService';
import { APP_VERSION } from './constants';

// --- System Constants ---
const Palette = {
  accent: '#C6934B',
  darkCard: '#121212',
  greyFAB: '#333333',
  creamBase: '#E6DDD3',
  textMain: '#121212',
  textLight: '#F3F4F4',
};

const TAG_CONFIG: Record<string, string> = {
  "Meal": '#C6934B',
  "Sightseeing": '#5F9598',
  "Transport": '#1D546D',
  "Shopping": '#9B2C2C',
  "Must Visit": '#4F5D4C',
  "Coffee": '#121212',
};

const DEFAULT_TAGS = Object.keys(TAG_CONFIG);
const STORAGE_KEY = 'wanderSync_lifestyle_v4_final';
const PENDING_SYNC_KEY = 'wanderSync_pending_sync';

// --- Helpers ---
const useLongPress = (callback: () => void, ms = 600) => {
  const timeoutRef = useRef<any>(null);
  const start = () => { timeoutRef.current = setTimeout(callback, ms); };
  const stop = () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: start, onTouchEnd: stop, onTouchMove: stop };
};

const getMapsDirectionsUrl = (origin: string, dest: string) => {
  const clean = (val: string) => encodeURIComponent(val.trim());
  return `https://www.google.com/maps/dir/?api=1&origin=${clean(origin)}&destination=${clean(dest)}&travelmode=driving`;
};

// Fixed Sync URL (Google Sheets Apps Script)
const SHEET_API_URL = process.env.SYNC_URL || 'https://script.google.com/macros/s/AKfycbzNWiondifG_ttagkAGglP2WX1hxVNWRxOna-O7Rq5F38J-PrM2asdTodQY-a2HE29X/exec';

// --- Cloud Sync Helpers ---

/**
 * PUSH logic (POST)
 * Rules: mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, simple stringified JSON body.
 */
async function pushToCloud(trip: Trip): Promise<boolean> {
  try {
    console.log('WanderSync: Pushing data to cloud...', trip);
    
    // We wrap the trip and add versioning info
    const payload = {
      ...trip,
      clientVersion: APP_VERSION,
      pushedAt: new Date().toISOString()
    };

    await fetch(SHEET_API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
    
    // With no-cors, we can't see the response body, but the fetch resolving
    // generally means the request was successfully dispatched.
    localStorage.removeItem(PENDING_SYNC_KEY);
    return true;
  } catch (e) {
    console.warn("WanderSync: Background push failed, flagging as pending", e);
    localStorage.setItem(PENDING_SYNC_KEY, 'true');
    return false;
  }
}

/**
 * PULL logic (GET)
 * Rules: mode: 'cors', redirect: 'follow'.
 */
async function pullFromCloud(): Promise<Trip | null> {
  try {
    const response = await fetch(`${SHEET_API_URL}?t=${Date.now()}`, {
      method: 'GET',
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data && data.id) ? data as Trip : null;
  } catch (e) {
    console.warn("WanderSync: Background pull error", e);
    return null;
  }
}

const LabelBadge: React.FC<{ label: HighlightLabel; isDark?: boolean }> = ({ label, isDark }) => (
  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest border transition-all ${isDark ? 'bg-white/10 text-white/80 border-white/10' : 'bg-black/10 text-black/60 border-black/10'}`}>
    {label.text}
  </span>
);

type TimelineItem = 
  | (ItineraryEvent & { isFlight: false; isStay: false }) 
  | { isFlight: true; isStay: false; flight: FlightInfo; startTime: string }
  | { isFlight: false; isStay: true; stay: Accommodation; startTime: string };

const DayScroller: React.FC<{ startDate: string; endDate: string; selectedDate: string; isMinimized: boolean; onSelect: (d: string) => void }> = ({ startDate, endDate, selectedDate, isMinimized, onSelect }) => {
  const dates = useMemo(() => {
    const arr = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { arr.push(new Date(d).toISOString().split('T')[0]); }
    return arr;
  }, [startDate, endDate]);

  return (
    <div className={`flex gap-1.5 overflow-x-auto hide-scrollbar px-6 bg-[#E6DDD3]/95 backdrop-blur-xl sticky top-[48px] z-40 border-b border-black/5 transition-all duration-300 ${isMinimized ? 'py-1 shadow-sm' : 'py-3'}`}>
      {dates.map((dateStr) => {
        const d = new Date(dateStr);
        const isSelected = dateStr === selectedDate;
        return (
          <button key={dateStr} onClick={() => onSelect(dateStr)} className={`flex flex-col items-center min-w-[44px] rounded-[16px] transition-all duration-300 ${isSelected ? 'bg-[#121212] text-white shadow-lg scale-105' : 'bg-black/5 text-black/40'} ${isMinimized ? 'py-1' : 'py-2'}`}>
            <span className={`font-black opacity-50 mb-0.5 ${isMinimized ? 'text-[5px]' : 'text-[7px]'}`}>{d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span>
            <span className={`font-black ${isMinimized ? 'text-xs' : 'text-base'}`}>{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
};

const TimelineCard: React.FC<{ event: TimelineItem, onEdit: (e: TimelineItem) => void, onLongPress: (e: TimelineItem) => void }> = ({ event, onEdit, onLongPress }) => {
  const isFlight = event.isFlight === true;
  const isStay = event.isFlight === false && event.isStay === true;
  
  const rawTime = isFlight ? event.flight.departureTime : (isStay ? '23:59:59' : (event as ItineraryEvent).startTime);
  const timeDisplay = isStay ? "STAY" : new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  
  const bubbleColor = (isFlight || isStay) ? Palette.darkCard : (event.color || Palette.darkCard);
  const isLight = bubbleColor === Palette.accent || bubbleColor === '#E6DDD3';
  
  const attachments = isFlight ? event.flight.attachments : (isStay ? event.stay.attachments : (event as ItineraryEvent).attachments);
  const props = useLongPress(() => onLongPress(event));

  const openDoc = (e: React.MouseEvent, att: Attachment) => {
    e.stopPropagation();
    const win = window.open();
    if (win) win.document.write(`<iframe src="${att.data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
  };

  const title = isFlight ? `${event.flight.flightNo} DEP` : (isStay ? event.stay.name : (event as ItineraryEvent).title);
  const sub = isFlight ? `${event.flight.departure} → ${event.flight.arrival}` : (isStay ? event.stay.location : (event as ItineraryEvent).location);

  return (
    <div className="px-4 py-1 flex gap-4 items-start relative group">
      <div className="w-12 pt-3 flex flex-col items-end flex-shrink-0 z-10">
        <span className="text-[11px] font-black tracking-tighter text-black/40 tabular-nums">{timeDisplay}</span>
      </div>
      <div {...props} onClick={() => onEdit(event)} className={`flex-1 rounded-[24px] p-4 shadow-sm relative active:scale-[0.98] transition-all flex flex-col gap-2 ${isLight ? 'text-[#121212]' : 'text-[#F3F4F4]'}`} style={{ backgroundColor: bubbleColor }}>
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0 pr-2">
            <h4 className="text-base font-black leading-tight uppercase tracking-tighter truncate">{title}</h4>
            <div className="text-[10px] font-bold opacity-60 truncate">{sub || ""}</div>
            {isFlight && event.flight.bookingNumber && (
              <div className="text-[8px] font-black opacity-40 uppercase mt-1 tracking-widest">Ref: {event.flight.bookingNumber}</div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <div className="flex flex-wrap justify-end gap-1">
              {isFlight && <LabelBadge label={{ text: 'Flight', type: 'system' }} isDark={!isLight} />}
              {isStay && <LabelBadge label={{ text: 'Hotel', type: 'system' }} isDark={!isLight} />}
              {!isFlight && !isStay && (event as ItineraryEvent).labels?.map((l, i) => <LabelBadge key={i} label={l} isDark={!isLight} />)}
            </div>
          </div>
        </div>
        {attachments && attachments.length > 0 && (
          <div className="flex gap-2 mt-1">
            {attachments.map((att) => (
              <button key={att.id} onClick={(e) => openDoc(e, att)} className="w-10 h-10 rounded-lg overflow-hidden border border-white/20 bg-black/20 flex items-center justify-center group/att">
                {att.mimeType.startsWith('image/') ? <img src={att.data} alt="doc" className="w-full h-full object-cover" /> : <span className="text-[8px] font-black">DOC</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('itinerary');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isScrolled, setIsScrolled] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<{ mode: ModalMode; item: any } | null>(null);
  const [selectedColor, setSelectedColor] = useState(Palette.darkCard);
  const [eventLabels, setEventLabels] = useState<HighlightLabel[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [localWeather, setLocalWeather] = useState<{ temp: number; condition: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasPendingSync, setHasPendingSync] = useState(localStorage.getItem(PENDING_SYNC_KEY) === 'true');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Sync Data Management ---
  const handleUpdateAndSync = (updatedTrip: Trip) => {
    const tripWithTimestamp = { ...updatedTrip, lastSynced: new Date().toISOString() };
    setTrip(tripWithTimestamp);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tripWithTimestamp));
    // The actual cloud push is handled by the debounced useEffect now
  };

  // Debounced Auto-Sync Effect
  useEffect(() => {
    if (!trip) return;

    // We debounce the sync by 2 seconds to avoid excessive hits to Google Script
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      if (isOnline) {
        setSyncing(true);
        const success = await pushToCloud(trip);
        if (success) {
          setLastSyncedAt(trip.lastSynced || new Date().toISOString());
          setHasPendingSync(false);
        } else {
          setHasPendingSync(true);
        }
        setSyncing(false);
      } else {
        localStorage.setItem(PENDING_SYNC_KEY, 'true');
        setHasPendingSync(true);
      }
    }, 2000);

    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [trip, isOnline]);

  const performInitialPull = async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const cloudData = await pullFromCloud();
    if (cloudData) {
      const local = localStorage.getItem(STORAGE_KEY);
      const localData = local ? JSON.parse(local) : null;
      
      // Merge logic: pull from cloud if cloud is newer or local is missing
      if (!localData || (cloudData.lastSynced && localData.lastSynced && cloudData.lastSynced > localData.lastSynced)) {
        setTrip(cloudData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
        if (cloudData.lastSynced) setLastSyncedAt(cloudData.lastSynced);
        setHasPendingSync(false);
        localStorage.removeItem(PENDING_SYNC_KEY);
      } else if (localData && cloudData.lastSynced !== localData.lastSynced) {
        // If local is newer, it will trigger its own sync via the debounced effect
      }
    }
    setSyncing(false);
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial Offline-First Load from LocalStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      setTrip(data);
      setSelectedDate(data.startDate);
      if (data.lastSynced) setLastSyncedAt(data.lastSynced);
    } else {
      const initial: Trip = {
        id: 'trip-' + Date.now(),
        name: 'JC US Trip 2026',
        destination: 'US and Toronto',
        startDate: '2026-05-15',
        endDate: '2026-05-29',
        headerImagePosition: 50,
        flights: [],
        otherTransport: [],
        accommodations: [],
        events: [
          { id: '1', title: 'Arrival Dinner', category: EventCategory.DINING, startTime: '2026-05-15T20:00:00', isCompleted: false, labels: [{ text: 'Meal', type: 'Meal' }], color: Palette.accent, location: 'Toronto', mapLink: 'https://www.google.com/maps/search/?api=1&query=Toronto' }
        ],
        participants: ['JC', 'Wife'],
        expenses: [],
        budget: 50000,
        tripNotes: ''
      };
      setTrip(initial);
      setSelectedDate(initial.startDate);
    }

    // Background cloud pull on mount
    performInitialPull();

    return () => { 
      window.removeEventListener('online', handleOnline); 
      window.removeEventListener('offline', handleOffline); 
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => { if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 180); };
    const container = scrollContainerRef.current;
    container?.addEventListener('scroll', handleScroll);
    return () => container?.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredEvents = useMemo(() => {
    if (!trip || !selectedDate) return [];
    
    const events = trip.events
      .filter(e => e.startTime.startsWith(selectedDate))
      .map(e => ({ ...e, isFlight: false as const, isStay: false as const }));
    
    const flights = trip.flights
      .filter(f => f.departureTime.startsWith(selectedDate))
      .map(f => ({ flight: f, isFlight: true as const, isStay: false as const, startTime: f.departureTime }));
    
    const stays = trip.accommodations
      .filter(a => {
        const d_cur = new Date(selectedDate);
        const d_start = new Date(a.startDate);
        const d_end = new Date(a.endDate);
        d_cur.setHours(0,0,0,0);
        d_start.setHours(0,0,0,0);
        d_end.setHours(0,0,0,0);
        return d_cur >= d_start && d_cur < d_end;
      })
      .map(a => ({ stay: a, isFlight: false as const, isStay: true as const, startTime: '23:59:59' }));

    const sortedBase = [...events, ...flights].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return [...sortedBase, ...stays];
  }, [trip, selectedDate]);

  const currentCityStatus = useMemo(() => {
    if (filteredEvents.length === 0) return null;
    const lastItem = [...filteredEvents].reverse().find(e => e.isFlight ? !!e.flight.arrival : (e.isStay ? !!e.stay.location : !!(e as ItineraryEvent).location));
    if (!lastItem) return null;
    if (lastItem.isFlight) return lastItem.flight.arrival;
    if (lastItem.isStay) return lastItem.stay.location;
    return (lastItem as ItineraryEvent).location;
  }, [filteredEvents]);

  useEffect(() => {
    if (currentCityStatus && isOnline) {
      setLocalWeather(null);
      getCityWeather(currentCityStatus).then(setLocalWeather);
    } else {
      setLocalWeather(null);
    }
  }, [currentCityStatus, isOnline]);

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !trip) return;
    const reader = new FileReader();
    reader.onloadend = () => { 
      handleUpdateAndSync({ ...trip, headerImage: reader.result as string }); 
      setModalMode(null); 
    };
    reader.readAsDataURL(file);
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const newAtt: Attachment = { id: 'att-' + Date.now(), name: file.name, mimeType: file.type, data: reader.result as string };
      setEditingItem((prev: any) => ({ ...prev, attachments: [...(prev?.attachments || []), newAtt] }));
    };
    reader.readAsDataURL(file);
  };

  const saveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const isExisting = !!editingItem?.id;
    const id = isExisting ? editingItem.id : 'item-' + Date.now();
    let updatedTrip = { ...trip };

    if (modalMode === 'trip') {
      updatedTrip = { ...trip, name: fd.get('name') as string, destination: fd.get('destination') as string, startDate: fd.get('startDate') as string, endDate: fd.get('endDate') as string, budget: parseFloat(fd.get('budget') as string) || trip.budget };
    } else if (modalMode === 'event') {
      const newEvent: ItineraryEvent = { id, title: fd.get('title') as string, startTime: fd.get('startTime') as string, location: fd.get('location') as string, mapLink: fd.get('mapLink') as string, notes: fd.get('notes') as string, category: EventCategory.ACTIVITY, isCompleted: editingItem?.isCompleted || false, labels: eventLabels, color: selectedColor, attachments: editingItem?.attachments || [] };
      updatedTrip.events = isExisting ? trip.events.map(ev => ev.id === id ? newEvent : ev) : [...trip.events, newEvent];
    } else if (modalMode === 'accommodation') {
      const newAcc: Accommodation = { id, name: fd.get('name') as string, startDate: fd.get('startDate') as string, endDate: fd.get('endDate') as string, location: fd.get('location') as string, mapLink: fd.get('mapLink') as string, notes: fd.get('notes') as string, attachments: editingItem?.attachments || [] };
      updatedTrip.accommodations = isExisting ? trip.accommodations.map(a => a.id === id ? newAcc : a) : [...trip.accommodations, newAcc];
    } else if (modalMode === 'flight') {
      const newFlight: FlightInfo = { id, flightNo: fd.get('flightNo') as string, departure: fd.get('departure') as string, arrival: fd.get('arrival') as string, departureTime: fd.get('departureTime') as string, arrivalTime: fd.get('arrivalTime') as string, bookingNumber: fd.get('bookingNumber') as string, attachments: editingItem?.attachments || [] };
      updatedTrip.flights = isExisting ? trip.flights.map(f => f.id === id ? newFlight : f) : [...trip.flights, newFlight];
    } else if (modalMode === 'expense') {
      const newExpense: Expense = { id, description: fd.get('description') as string, amount: parseFloat(fd.get('amount') as string), category: fd.get('category') as string, date: fd.get('date') as string };
      updatedTrip.expenses = isExisting ? trip.expenses.map(ex => ex.id === id ? newExpense : ex) : [...trip.expenses, newExpense];
    }
    handleUpdateAndSync(updatedTrip);
    setModalMode(null);
  };

  const executeDelete = () => {
    if (!trip || !itemToDelete) return;
    const { mode, item } = itemToDelete;
    let updated = { ...trip };
    if (mode === 'event') updated.events = trip.events.filter(e => e.id !== item.id);
    else if (mode === 'accommodation') updated.accommodations = trip.accommodations.filter(a => a.id !== item.id);
    else if (mode === 'flight') updated.flights = trip.flights.filter(f => f.id !== item.id);
    else if (mode === 'expense') updated.expenses = trip.expenses.filter(ex => ex.id !== item.id);
    handleUpdateAndSync(updated);
    setItemToDelete(null);
  };

  const totalSpent = trip?.expenses.reduce((sum, e) => sum + e.amount, 0) || 0;

  return (
    <div className="max-w-md mx-auto h-screen flex flex-col bg-[#E6DDD3] text-[#121212] overflow-hidden">
      {!isOnline && <div className="bg-red-500 text-white text-[9px] font-black uppercase tracking-widest text-center py-1.5 z-[100] animate-pulse">Offline Mode • Working Locally</div>}
      <div ref={scrollContainerRef} className="flex-grow overflow-y-auto hide-scrollbar pb-40">
        <header className="relative pt-32 pb-10 px-8 text-center border-b border-black/5 overflow-hidden">
          {trip?.headerImage && (
            <div className="absolute inset-0 z-0">
              <img src={trip.headerImage} alt="Trip Header" className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#E6DDD3] to-transparent opacity-90"></div>
            </div>
          )}
          <div className="absolute top-10 left-0 right-0 flex justify-between px-8 z-20 items-center">
            <div className="flex gap-2">
              <button onClick={performInitialPull} disabled={!isOnline} className={`p-2 rounded-full system-glass border border-black/5 ${syncing ? 'animate-spin opacity-50' : ''}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[7px] font-black uppercase opacity-20 tracking-widest">{APP_VERSION}</span>
              <button onClick={() => setModalMode('trip')} className="p-2 rounded-full system-glass border border-black/5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
            </div>
          </div>
          <div className="relative z-10" onClick={() => setModalMode('trip')}>
            <h1 className="text-[26px] font-black tracking-tighter mb-1 leading-none uppercase">{trip?.name}</h1>
            <p className="text-black/40 text-[9px] font-black tracking-[0.3em] uppercase">{trip?.destination}</p>
          </div>
        </header>
        <nav className="flex px-4 border-b border-black/5 text-[8px] font-black sticky top-0 bg-[#E6DDD3]/95 backdrop-blur-3xl z-50 py-0.5">{['itinerary', 'stay', 'transport', 'budget', 'notes'].map((tab) => (<button key={tab} onClick={() => setActiveTab(tab as TabType)} className={`flex-1 py-3 transition-all uppercase ${activeTab === tab ? 'text-[#121212] border-b-[2px] border-[#C6934B]' : 'text-black/15'}`}>{tab}</button>))}</nav>
        {activeTab === 'itinerary' && trip && (
          <>
            <DayScroller startDate={trip.startDate} endDate={trip.endDate} selectedDate={selectedDate} onSelect={setSelectedDate} isMinimized={isScrolled} />
            {localWeather && <div className="px-6 py-1.5 animate-in fade-in slide-in-from-top-2 duration-300"><div className="bg-white/60 border border-black/5 rounded-[16px] px-4 py-2 flex items-center justify-center gap-3 shadow-sm"><span className="text-[10px] font-black uppercase tracking-widest text-black/60">{currentCityStatus} • {localWeather.temp}°C {localWeather.condition}</span></div></div>}
            <div className="flex flex-col pt-4 relative">
              <div className="absolute left-[3.35rem] top-0 bottom-0 w-[1px] bg-black/5 z-0"></div>
              {filteredEvents.length > 0 ? filteredEvents.map((e, idx) => {
                const nextItem = filteredEvents[idx + 1];
                const originLoc = e.isFlight ? e.flight.arrival : (e.isStay ? e.stay.name : ((e as ItineraryEvent).location || (e as ItineraryEvent).title));
                const destLoc = nextItem ? (nextItem.isFlight ? nextItem.flight.departure : (nextItem.isStay ? nextItem.stay.name : ((nextItem as ItineraryEvent).location || (nextItem as ItineraryEvent).title))) : null;
                const showDirections = !!(originLoc && destLoc) && !e.isStay;
                return (
                  <React.Fragment key={e.isFlight ? e.flight.id : (e.isStay ? `${e.stay.id}-${selectedDate}` : (e as ItineraryEvent).id)}>
                    <TimelineCard event={e} onEdit={(item) => {
                      if (item.isFlight) { setEditingItem(item.flight); setEventLabels([]); setSelectedColor(Palette.darkCard); setModalMode('flight'); }
                      else if (item.isStay) { setEditingItem(item.stay); setEventLabels([]); setSelectedColor(Palette.darkCard); setModalMode('accommodation'); }
                      else { const ev = item as ItineraryEvent; setEditingItem(ev); setEventLabels(ev.labels || []); setSelectedColor(ev.color || Palette.darkCard); setModalMode('event'); }
                    }} onLongPress={(item) => {
                       const mode = item.isFlight ? 'flight' : (item.isStay ? 'accommodation' : 'event');
                       const data = item.isFlight ? item.flight : (item.isStay ? item.stay : item);
                       setItemToDelete({ mode, item: data });
                    }} />
                    {showDirections && (
                      <div className="relative h-10 flex items-center">
                        <div className="ml-[4.2rem] flex-grow flex justify-center pr-4">
                          <a href={getMapsDirectionsUrl(originLoc!, destLoc!)} target="_blank" rel="noreferrer" className="z-10 bg-white px-3 py-1 rounded-full border border-black/10 shadow-sm active:scale-95 flex items-center gap-1.5 transition-all hover:bg-black/5">
                            <svg className="w-2.5 h-2.5 text-[#C6934B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 20l-5.447-2.724A2 2 0 013 15.483V4a2 2 0 012.96-1.701L10 5l5-2.5a2 2 0 011.96.12L21 5.417V17a2 2 0 01-1.04 1.764L15 21l-6-1z" /></svg>
                            <span className="text-[7px] font-black uppercase tracking-widest text-black/40">Direction</span>
                          </a>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              }) : <div className="text-center py-10 opacity-20 uppercase font-black text-[9px] tracking-widest">No plans for today</div>}
              
              <div className="text-center py-8">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-black/20">
                  {syncing ? 'Synchronizing with Cloud...' : (hasPendingSync ? 'Changes Pending Sync...' : `Last Sync: ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Never'}`)}
                </p>
                {!isOnline && <p className="text-[6px] font-black uppercase text-red-400 mt-1">Offline • Using Local Cache</p>}
              </div>
            </div>
          </>
        )}
        {activeTab === 'stay' && trip && (
          <div className="p-8 space-y-4 animate-in fade-in">
             <div className="flex justify-between items-center"><h3 className="text-black/30 text-[10px] font-black uppercase tracking-widest">Accommodations</h3><button onClick={() => { setEditingItem(null); setModalMode('accommodation'); }} className="text-[#C6934B] text-[10px] font-black uppercase">+ ADD</button></div>
             {trip.accommodations.map((acc) => (
               <div key={acc.id} onClick={() => { setEditingItem(acc); setModalMode('accommodation'); }} className="bg-[#121212] p-6 rounded-[32px] shadow-xl text-white uppercase active:scale-[0.98] transition-all">
                 <div className="flex justify-between items-start"><div><p className="font-black text-lg">{acc.name}</p><p className="text-[9px] text-white/30 font-black">{acc.startDate} – {acc.endDate}</p></div>{acc.mapLink && (<button onClick={(e) => { e.stopPropagation(); window.open(acc.mapLink, '_blank'); }} className="p-2 rounded-full bg-white/10 border border-white/10 hover:bg-white/20 transition-all"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>)}</div>
                 <div className="mt-2 text-[8px] opacity-40 font-bold truncate">{acc.location}</div>
               </div>
             ))}
          </div>
        )}
        {activeTab === 'transport' && trip && (
          <div className="p-8 space-y-4 animate-in fade-in">
             <div className="flex justify-between items-center"><h3 className="text-black/30 text-[10px] font-black uppercase tracking-widest">Flights & Transport</h3><button onClick={() => { setEditingItem(null); setModalMode('flight'); }} className="text-[#C6934B] text-[10px] font-black uppercase">+ ADD</button></div>
             {trip.flights.map((f) => (
               <div key={f.id} onClick={() => { setEditingItem(f); setModalMode('flight'); }} className="bg-[#121212] p-6 rounded-[32px] shadow-xl text-white uppercase active:scale-[0.98] transition-all"><p className="font-black text-lg">{f.flightNo}</p><p className="text-[10px] font-black">{f.departure} → {f.arrival}</p></div>
             ))}
          </div>
        )}
        {activeTab === 'budget' && trip && (
          <div className="p-8 space-y-6 animate-in fade-in">
             <div className="bg-[#121212] p-8 rounded-[40px] text-white uppercase shadow-2xl relative overflow-hidden"><div className="absolute top-0 right-0 w-32 h-32 bg-[#C6934B]/20 blur-[64px] rounded-full"></div><h3 className="text-[10px] font-black opacity-30 tracking-[0.2em] mb-4">Total Spending</h3><div className="flex items-baseline gap-2"><span className="text-4xl font-black">${totalSpent.toLocaleString()}</span><span className="text-xs opacity-30 font-bold">/ ${trip.budget.toLocaleString()}</span></div><div className="mt-6 h-1 w-full bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-[#C6934B]" style={{ width: `${Math.min(100, (totalSpent / trip.budget) * 100)}%` }}></div></div></div>
             <div className="flex justify-between items-center"><h3 className="text-black/30 text-[10px] font-black uppercase tracking-widest">Expenses</h3><button onClick={() => { setEditingItem(null); setModalMode('expense'); }} className="text-[#C6934B] text-[10px] font-black uppercase">+ ADD</button></div>
             {trip.expenses.map(ex => (<div key={ex.id} onClick={() => { setEditingItem(ex); setModalMode('expense'); }} className="bg-white/40 border border-black/5 p-5 rounded-[24px] flex justify-between items-center active:scale-[0.98] transition-all"><div><p className="text-xs font-black uppercase">{ex.description}</p></div><p className="text-sm font-black">${ex.amount.toLocaleString()}</p></div>))}
          </div>
        )}
        {activeTab === 'notes' && trip && (<div className="p-8 animate-in fade-in"><h3 className="text-black/30 text-[10px] font-black uppercase tracking-widest mb-4">Global Scratchpad</h3><textarea className="w-full h-80 bg-white/40 border border-black/5 rounded-[32px] p-8 text-sm font-bold outline-none transition-all resize-none shadow-sm" placeholder="Tips, ideas..." value={trip.tripNotes} onChange={(e) => handleUpdateAndSync({ ...trip, tripNotes: e.target.value })} /></div>)}
      </div>
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60]"><button onClick={() => { setEditingItem(null); setEventLabels([]); setSelectedColor(Palette.darkCard); setModalMode('event'); }} className="w-16 h-16 bg-[#333333] text-white rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-all"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={6} d="M12 4v16m8-8H4" /></svg></button></div>
      {modalMode && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xl" onClick={() => setModalMode(null)}></div>
          <div className="relative w-full max-w-md bg-[#E6DDD3] rounded-[40px] p-8 pb-12 shadow-4xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-500">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black uppercase">{editingItem?.id ? 'Edit' : 'Add'} {modalMode}</h2><button onClick={() => setModalMode(null)} className="text-black/30 font-black text-[9px] uppercase">Close</button></div>
            
            {(modalMode === 'event' || modalMode === 'accommodation' || modalMode === 'flight') && (
              <div className="mb-6">
                <button type="button" onClick={() => attachInputRef.current?.click()} className="w-full py-4 border-2 border-dashed border-black/10 rounded-[24px] flex items-center justify-center gap-3 active:bg-black/5 transition-all">
                  <span className="text-xl">📎</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">Add Attachment</span>
                  <input type="file" ref={attachInputRef} className="hidden" onChange={handleAttachmentUpload} />
                </button>
                {editingItem?.attachments?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {editingItem.attachments.map((att: Attachment) => (
                      <div key={att.id} className="relative group/att">
                        <div className="w-12 h-12 rounded-xl bg-black/5 border border-black/5 flex items-center justify-center overflow-hidden">
                          {att.mimeType.startsWith('image/') ? <img src={att.data} className="w-full h-full object-cover" /> : <span className="text-[7px] font-black uppercase">DOC</span>}
                        </div>
                        <button type="button" onClick={() => setEditingItem((prev:any) => ({...prev, attachments: prev.attachments.filter((a:any) => a.id !== att.id)}))} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] font-black">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={saveItem} className="space-y-4">
              {modalMode === 'trip' && (<><div><label className="text-[8px] font-black uppercase opacity-30">Name</label><input required name="name" defaultValue={trip?.name} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div><label className="text-[8px] font-black uppercase opacity-30">Destination</label><input name="destination" defaultValue={trip?.destination} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div className="flex gap-4"><div className="flex-1"><label className="text-[8px] font-black uppercase opacity-30">Start</label><input type="date" name="startDate" defaultValue={trip?.startDate} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div className="flex-1"><label className="text-[8px] font-black uppercase opacity-30">End</label><input type="date" name="endDate" defaultValue={trip?.endDate} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div></div><div className="pt-4"><button type="button" onClick={() => bannerInputRef.current?.click()} className="w-full py-4 border-2 border-dashed border-black/10 rounded-[24px] flex items-center justify-center gap-3"><span className="text-xl">🖼️</span><span className="text-[10px] font-black uppercase tracking-widest">Change Banner</span><input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={handleBannerUpload} /></button></div></>)}
              
              {modalMode === 'event' && (<><div><label className="text-[8px] font-black uppercase opacity-30">Title</label><input required name="title" value={editingItem?.title || ''} onChange={e => setEditingItem({...editingItem, title: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div><label className="text-[8px] font-black uppercase opacity-30">Time</label><input required type="datetime-local" name="startTime" value={editingItem?.startTime || `${selectedDate}T12:00`} onChange={e => setEditingItem({...editingItem, startTime: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div><label className="text-[8px] font-black uppercase opacity-30">Location</label><input name="location" value={editingItem?.location || ''} onChange={e => setEditingItem({...editingItem, location: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div><label className="text-[8px] font-black uppercase opacity-30">Maps Link</label><input name="mapLink" value={editingItem?.mapLink || ''} onChange={e => setEditingItem({...editingItem, mapLink: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div><label className="text-[8px] font-black uppercase opacity-30">Tags</label><div className="flex flex-wrap gap-2 mt-2">{DEFAULT_TAGS.map(t => (<button key={t} type="button" onClick={() => { setEventLabels([{ text: t, type: 'category' }]); setSelectedColor(TAG_CONFIG[t]); }} className={`px-3 py-2 rounded-full text-[9px] font-black uppercase border-2 ${eventLabels.some(l => l.text === t) ? 'shadow-lg border-black/20' : 'opacity-40 border-transparent bg-black/5'}`} style={{ color: TAG_CONFIG[t] }}>{t}</button>))}</div></div></>)}
              
              {modalMode === 'flight' && (<><div><label className="text-[8px] font-black uppercase opacity-30">Flight #</label><input required name="flightNo" value={editingItem?.flightNo || ''} onChange={e => setEditingItem({...editingItem, flightNo: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold uppercase" /></div><div><label className="text-[8px] font-black uppercase opacity-30">Booking Reference</label><input name="bookingNumber" value={editingItem?.bookingNumber || ''} onChange={e => setEditingItem({...editingItem, bookingNumber: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold uppercase" /></div><div className="flex gap-4"><div className="flex-1"><label className="text-[8px] font-black uppercase opacity-30">From</label><input name="departure" value={editingItem?.departure || ''} onChange={e => setEditingItem({...editingItem, departure: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div className="flex-1"><label className="text-[8px] font-black uppercase opacity-30">To</label><input name="arrival" value={editingItem?.arrival || ''} onChange={e => setEditingItem({...editingItem, arrival: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div></div><div><label className="text-[8px] font-black uppercase opacity-30">Departure Time</label><input required type="datetime-local" name="departureTime" value={editingItem?.departureTime || `${selectedDate}T12:00`} onChange={e => setEditingItem({...editingItem, departureTime: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div><label className="text-[8px] font-black uppercase opacity-30">Arrival Time</label><input required type="datetime-local" name="arrivalTime" value={editingItem?.arrivalTime || `${selectedDate}T14:00`} onChange={e => setEditingItem({...editingItem, arrivalTime: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div></>)}
              
              {modalMode === 'accommodation' && (<><div><label className="text-[8px] font-black uppercase opacity-30">Stay Name</label><input required name="name" value={editingItem?.name || ''} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div className="grid grid-cols-2 gap-4"><div className="w-full"><label className="text-[8px] font-black uppercase opacity-30">Check In</label><input type="date" name="startDate" value={editingItem?.startDate || selectedDate} onChange={e => setEditingItem({...editingItem, startDate: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold text-sm" /></div><div className="w-full"><label className="text-[8px] font-black uppercase opacity-30">Check Out</label><input type="date" name="endDate" value={editingItem?.endDate || selectedDate} onChange={e => setEditingItem({...editingItem, endDate: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold text-sm" /></div></div><div><label className="text-[8px] font-black uppercase opacity-30">Location</label><input name="location" value={editingItem?.location || ''} onChange={e => setEditingItem({...editingItem, location: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div><label className="text-[8px] font-black uppercase opacity-30">Maps Link</label><input name="mapLink" value={editingItem?.mapLink || ''} onChange={e => setEditingItem({...editingItem, mapLink: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div></>)}
              
              {modalMode === 'expense' && (<><div><label className="text-[8px] font-black uppercase opacity-30">Description</label><input required name="description" value={editingItem?.description || ''} onChange={e => setEditingItem({...editingItem, description: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div className="flex gap-4"><div className="flex-1"><label className="text-[8px] font-black uppercase opacity-30">Amount</label><input required type="number" step="0.01" name="amount" value={editingItem?.amount || ''} onChange={e => setEditingItem({...editingItem, amount: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div><div className="flex-1"><label className="text-[8px] font-black uppercase opacity-30">Date</label><input required type="date" name="date" value={editingItem?.date || selectedDate} onChange={e => setEditingItem({...editingItem, date: e.target.value})} className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" /></div></div></>)}

              <div className="flex gap-3 pt-4">{editingItem?.id && (<button type="button" onClick={() => setItemToDelete({ mode: modalMode, item: editingItem })} className="w-16 h-16 bg-red-500/10 text-red-600 rounded-[20px] flex items-center justify-center active:bg-red-500/20"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>)}<button type="submit" className="flex-grow py-5 bg-[#121212] text-white rounded-[24px] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all">Save Changes</button></div>
            </form>
          </div>
        </div>
      )}
      {itemToDelete && (<div className="fixed inset-0 z-[200] flex items-center justify-center p-8"><div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setItemToDelete(null)}></div><div className="relative bg-white rounded-[32px] p-8 text-center w-full max-w-sm"><h3 className="text-lg font-black uppercase mb-2">Remove?</h3><div className="flex flex-col gap-2 mt-8"><button onClick={executeDelete} className="w-full py-4 bg-red-600 text-white rounded-[18px] font-black uppercase">Delete</button><button onClick={() => setItemToDelete(null)} className="w-full py-4 text-black/30 font-black uppercase">Cancel</button></div></div></div>)}
    </div>
  );
};

export default App;
