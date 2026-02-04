import * as React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Trip, ItineraryEvent, HighlightLabel, Attachment, TabType, ModalMode } from './types';
import { APP_VERSION } from './constants';

// --- FIREBASE REAL-TIME IMPORTS ---
import { db } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

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

// --- UI COMPONENTS ---
const LabelBadge = ({ label }: { label: HighlightLabel }) => (
  <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border border-black/5"
    style={{ backgroundColor: TAG_CONFIG[label.text] || '#333', color: '#fff' }}>
    {label.text}
  </span>
);

const TimelineCard = ({ event, onEdit }: any) => (
  <div onClick={() => onEdit(event)} className="ml-16 mr-6 mb-4 p-6 bg-white rounded-[32px] shadow-sm border border-black/5 active:scale-[0.98] transition-all relative group">
    <div className="absolute -left-[2.85rem] top-7 w-3 h-3 rounded-full bg-[#C6934B] border-4 border-[#E6DDD3] z-10"></div>
    <p className="text-[10px] font-black opacity-20 uppercase tracking-tighter mb-1">
      {event.startTime ? new Date(event.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'TBD'}
    </p>
    <h4 className="text-sm font-black uppercase leading-tight">{event.title || event.flightNo || event.name}</h4>
    <div className="flex gap-1 mt-2">
      {event.labels?.map((l: any, i: number) => <LabelBadge key={i} label={l} />)}
    </div>
  </div>
);

const DayScroller = ({ startDate, endDate, selectedDate, onSelect }: any) => {
  const dates = useMemo(() => {
    if (!startDate || !endDate) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const arr = [];
    for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
      arr.push(new Date(d).toISOString().split('T')[0]);
    }
    return arr;
  }, [startDate, endDate]);

  return (
    <div className="flex gap-4 px-6 py-4 overflow-x-auto hide-scrollbar bg-[#E6DDD3]">
      {dates.map(date => {
        const d = new Date(date);
        const isActive = selectedDate === date;
        return (
          <button key={date} onClick={() => onSelect(date)} className={`flex-shrink-0 w-12 h-16 rounded-2xl flex flex-col items-center justify-center transition-all ${isActive ? 'bg-[#121212] text-white' : 'bg-black/5 text-black/40'}`}>
            <span className="text-[8px] font-black uppercase">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span className="text-lg font-black">{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('itinerary');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const docId = "shared-trip-2026";

  const filteredEvents = useMemo(() => {
    if (!trip || !selectedDate) return [];
    return trip.events.filter(e => e.startTime.startsWith(selectedDate))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [trip, selectedDate]);

  const totalSpent = trip?.expenses.reduce((sum, ex) => sum + ex.amount, 0) || 0;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "trips", docId), (snapshot) => {
      if (snapshot.exists()) {
        const cloudData = snapshot.data() as Trip;
        setTrip(cloudData);
        if (cloudData.startDate && !selectedDate) setSelectedDate(cloudData.startDate);
        setLastSyncedAt(new Date().toISOString());
      }
      setSyncing(false);
    });
    return () => unsub();
  }, []);

  const handleUpdateAndSync = async (updatedTrip: Trip) => {
    setTrip(updatedTrip);
    if (isOnline) {
      setSyncing(true);
      try { await setDoc(doc(db, "trips", docId), updatedTrip); }
      catch (e) { console.error("Sync Error:", e); }
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-md mx-auto h-screen flex flex-col bg-[#E6DDD3] text-[#121212] overflow-hidden font-sans">
      <div ref={scrollContainerRef} className="flex-grow overflow-y-auto hide-scrollbar pb-40">
        <header className="relative pt-32 pb-10 px-8 text-center border-b border-black/5 overflow-hidden">
          {trip?.headerImage && (
            <div className="absolute inset-0 z-0">
              <img src={trip.headerImage} alt="Trip" className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#E6DDD3] to-transparent"></div>
            </div>
          )}
          <div className="relative z-10">
            <h1 className="text-[26px] font-black tracking-tighter mb-1 uppercase leading-none">{trip?.name || 'WanderSync'}</h1>
            <p className="text-black/40 text-[9px] font-black tracking-[0.3em] uppercase">{trip?.destination || 'Setting destination...'}</p>
          </div>
        </header>

        <nav className="flex px-4 border-b border-black/5 text-[8px] font-black sticky top-0 bg-[#E6DDD3]/95 backdrop-blur-3xl z-50 py-0.5">
          {['itinerary', 'stay', 'transport', 'budget', 'notes'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as TabType)} className={`flex-1 py-3 transition-all uppercase ${activeTab === tab ? 'text-[#121212] border-b-[2px] border-[#C6934B]' : 'text-black/15'}`}>{tab}</button>
          ))}
        </nav>

        {activeTab === 'itinerary' && (
          <>
            <DayScroller startDate={trip?.startDate} endDate={trip?.endDate} selectedDate={selectedDate} onSelect={setSelectedDate} />
            <div className="flex flex-col pt-4 relative">
              <div className="absolute left-[3.35rem] top-0 bottom-0 w-[1px] bg-black/5 z-0"></div>
              {filteredEvents.length > 0 ? filteredEvents.map((e, idx) => (
                <TimelineCard key={idx} event={e} onEdit={(item: any) => { setEditingItem(item); setModalMode('event'); }} />
              )) : <div className="text-center py-20 opacity-20 uppercase font-black text-[9px] tracking-widest">No plans for this day</div>}
            </div>
          </>
        )}

        {activeTab === 'budget' && (
          <div className="p-8 space-y-6">
            <div className="bg-[#121212] p-8 rounded-[40px] text-white uppercase shadow-2xl relative overflow-hidden">
               <h3 className="text-[10px] font-black opacity-30 tracking-[0.2em] mb-4">Total Spending</h3>
               <div className="flex items-baseline gap-2">
                 <span className="text-4xl font-black">${totalSpent.toLocaleString()}</span>
                 <span className="text-xs opacity-30">/ ${trip?.budget.toLocaleString()}</span>
               </div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60]">
        <button onClick={() => { setEditingItem(null); setModalMode('event'); }} className="w-16 h-16 bg-[#333333] text-white rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-all">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>

      <div className="fixed bottom-4 left-0 right-0 text-center">
         <p className="text-[7px] font-black uppercase tracking-widest opacity-20">
           {syncing ? 'Syncing...' : `Cloud Connected • ${APP_VERSION}`}
         </p>
      </div>
    </div>
  );
};

export default App;
