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

// --- SUB-COMPONENTS (To stop Netlify errors) ---
const DayScroller = ({ ...props }: any) => <div className="p-4 overflow-x-auto flex gap-4 bg-black/5">Day Scroller Placeholder</div>;
const TimelineCard = ({ event, onEdit, onLongPress }: any) => (
  <div onClick={() => onEdit(event)} className="ml-16 mr-6 mb-4 p-4 bg-white rounded-2xl shadow-sm border border-black/5">
    <p className="text-[10px] font-bold opacity-40">{event.startTime || 'Time TBD'}</p>
    <p className="font-black uppercase text-sm">{event.title || event.flight?.flightNo || event.stay?.name || 'Untitled Event'}</p>
  </div>
);

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
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const docId = "shared-trip-2026";

  // --- LOGIC ---
  const filteredEvents = useMemo(() => {
    if (!trip || !selectedDate) return [];
    const events = trip.events.filter(e => e.startTime.startsWith(selectedDate));
    return events.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [trip, selectedDate]);

  const totalSpent = trip?.expenses.reduce((sum, ex) => sum + ex.amount, 0) || 0;
  const currentCityStatus = trip?.destination || "Unknown";
  const hasPendingSync = false;

  // --- FIREBASE REAL-TIME LISTENER ---
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTrip));
    if (isOnline) {
      setSyncing(true);
      try {
        await setDoc(doc(db, "trips", docId), updatedTrip);
      } catch (e) {
        console.error("Firebase Sync Error:", e);
      }
      setSyncing(false);
    }
  };

  // --- ACTION HANDLERS (Required to fix build errors) ---
  const saveItem = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Save triggered");
    setModalMode(null);
  };

  const executeDelete = () => {
    console.log("Delete triggered");
    setItemToDelete(null);
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("Upload triggered");
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("Banner upload triggered");
  };

  const getMapsDirectionsUrl = (origin: string, dest: string) => {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
  };

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
            <button disabled={!isOnline} className={`p-2 rounded-full bg-white/20 backdrop-blur-md border border-black/5 ${syncing ? 'animate-spin' : ''}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[7px] font-black uppercase opacity-20 tracking-widest">{APP_VERSION}</span>
              <button onClick={() => setModalMode('trip')} className="p-2 rounded-full bg-white/20 backdrop-blur-md border border-black/5">⚙️</button>
            </div>
          </div>
          <div className="relative z-10">
            <h1 className="text-[26px] font-black tracking-tighter mb-1 leading-none uppercase">{trip?.name || 'My Adventure'}</h1>
            <p className="text-black/40 text-[9px] font-black tracking-[0.3em] uppercase">{trip?.destination || 'Setting Destination...'}</p>
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
              )) : <div className="text-center py-10 opacity-20 uppercase font-black text-[9px] tracking-widest">No plans yet</div>}
            </div>
          </>
        )}

        {activeTab === 'budget' && (
          <div className="p-8 space-y-6">
            <div className="bg-[#121212] p-8 rounded-[40px] text-white uppercase shadow-2xl relative overflow-hidden">
               <h3 className="text-[10px] font-black opacity-30 tracking-[0.2em] mb-4">Total Spending</h3>
               <div className="flex items-baseline gap-2">
                 <span className="text-4xl font-black">${totalSpent.toLocaleString()}</span>
               </div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60]">
        <button onClick={() => { setEditingItem(null); setModalMode('event'); }} className="w-16 h-16 bg-[#333333] text-white rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-all">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={6} d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xl" onClick={() => setModalMode(null)}></div>
          <div className="relative w-full max-w-md bg-[#E6DDD3] rounded-[40px] p-8 pb-12 shadow-4xl animate-in slide-in-from-bottom duration-500">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase">{modalMode}</h2>
              <button onClick={() => setModalMode(null)} className="text-black/30 font-black text-[9px] uppercase">Close</button>
            </div>
            <form onSubmit={saveItem} className="space-y-4">
               <input className="w-full bg-black/5 rounded-xl px-4 py-3 font-bold" placeholder="Title/Description" />
               <button type="submit" className="w-full py-5 bg-[#121212] text-white rounded-[24px] font-black uppercase shadow-2xl">Save</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
