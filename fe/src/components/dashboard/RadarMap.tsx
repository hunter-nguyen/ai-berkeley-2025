'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { flightRadar24, AIRCRAFT_CONFIG } from '@/utils/api/flightradar24';
import { aviationSafety, type TFR, type NOTAM, type SIGMET } from '@/utils/api/aviationSafety';
import { debugAircraft } from '@/utils/debug-aircraft';

// Add custom CSS for popup styling
const customPopupStyles = `
  .custom-popup .leaflet-popup-content-wrapper {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    border-radius: 0 !important;
  }
  .custom-popup .leaflet-popup-tip {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }
  .custom-popup .leaflet-popup-close-button {
    color: #6b7280 !important;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const existingStyle = document.getElementById('custom-popup-styles');
  if (!existingStyle) {
    const styleElement = document.createElement('style');
    styleElement.id = 'custom-popup-styles';
    styleElement.textContent = customPopupStyles;
    document.head.appendChild(styleElement);
  }
}

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Aircraft {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number;
  heading: number;
  speed: number;
  isSelected?: boolean;
  trail?: { lat: number; lng: number; timestamp: number; altitude: number }[];
  origin?: { lat: number; lng: number; name?: string };
  destination?: { lat: number; lng: number; name?: string };
  lastUpdated?: number;
}

interface ConflictZone {
  id: string;
  lat: number;
  lng: number;
  radius: number;
  severity: 'low' | 'medium' | 'high';
}

interface Airport {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  type: 'major' | 'regional' | 'private';
  runways?: string[];
}

interface AirspaceZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  type: 'class-b' | 'class-c' | 'class-d';
  airport: string;
  altitudes: string;
}

interface SectorLine {
  id: string;
  name: string;
  coordinates: [number, number][];
  type: 'approach' | 'departure' | 'enroute' | 'transition';
  controller: string;
  frequency: string;
  altitudes: string;
}

interface RadarMapProps {
  onAircraftSelect: (aircraft: Aircraft) => void;
  selectedAircraft?: Aircraft | null;
  onAircraftUpdate?: (count: number) => void;
  selectedCallsign?: string | null;
  onMapClick?: () => void;
}

// Add MapEvents component for handling map clicks
function MapEvents({ onMapClick }: { onMapClick?: () => void }) {
  useMapEvents({
    click: () => {
      if (onMapClick) {
        onMapClick();
      }
    },
  });
  return null;
}

export default function RadarMap({ onAircraftSelect, selectedAircraft, onAircraftUpdate, selectedCallsign, onMapClick }: RadarMapProps) {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'live' | 'fallback' | 'loading'>('loading');
  const [mounted, setMounted] = useState(false);
  const [showAirports, setShowAirports] = useState(true);
  const [showAirspace, setShowAirspace] = useState(true);
  const [showSectors, setShowSectors] = useState(true);
  const [showTFRs, setShowTFRs] = useState(true);
  const [showNOTAMs, setShowNOTAMs] = useState(true);
  const [showSIGMETs, setShowSIGMETs] = useState(true);

  // Aviation safety data
  const [tfrs, setTFRs] = useState<TFR[]>([]);
  const [notams, setNOTAMs] = useState<NOTAM[]>([]);
  const [sigmets, setSIGMETs] = useState<SIGMET[]>([]);
  const [safetyDataLoading, setSafetyDataLoading] = useState(false);

  // San Francisco Bay Area airports with real coordinates
  const [airports, setAirports] = useState<Airport[]>([
    {
      id: 'SFO',
      code: 'SFO',
      name: 'San Francisco International Airport',
      lat: 37.6213,
      lng: -122.3790,
      type: 'major',
      runways: ['28L/10R', '28R/10L', '01L/19R', '01R/19L']
    },
    {
      id: 'OAK',
      code: 'OAK',
      name: 'Oakland International Airport',
      lat: 37.7214,
      lng: -122.2208,
      type: 'major',
      runways: ['29/11', '27R/09L', '27L/09R', '15/33']
    },
    {
      id: 'SJC',
      code: 'SJC',
      name: 'Norman Y. Mineta San José International Airport',
      lat: 37.3639,
      lng: -121.9289,
      type: 'major',
      runways: ['30L/12R', '30R/12L']
    },
    {
      id: 'HWD',
      code: 'HWD',
      name: 'Hayward Executive Airport',
      lat: 37.6591,
      lng: -122.1221,
      type: 'regional',
      runways: ['28L/10R', '28R/10L']
    },
    {
      id: 'PAO',
      code: 'PAO',
      name: 'Palo Alto Airport',
      lat: 37.4611,
      lng: -122.1150,
      type: 'regional',
      runways: ['31/13']
    },
    {
      id: 'HAF',
      code: 'HAF',
      name: 'Half Moon Bay Airport',
      lat: 37.5135,
      lng: -122.5014,
      type: 'regional',
      runways: ['30/12']
    },
    {
      id: 'SQL',
      code: 'SQL',
      name: 'San Carlos Airport',
      lat: 37.5118,
      lng: -122.2495,
      type: 'regional',
      runways: ['30/12']
    },
    {
      id: 'LVK',
      code: 'LVK',
      name: 'Livermore Municipal Airport',
      lat: 37.6934,
      lng: -121.8197,
      type: 'regional',
      runways: ['25R/07L', '25L/07R']
    }
  ]);

  // Realistic Bay Area airspace zones
  const [airspaceZones, setAirspaceZones] = useState<AirspaceZone[]>([
    // SFO Class B Airspace (largest, most complex)
    {
      id: 'sfo-class-b-inner',
      name: 'SFO Class B (Inner)',
      lat: 37.6213,
      lng: -122.3790,
      radius: 9260, // 5 NM
      type: 'class-b',
      airport: 'SFO',
      altitudes: 'SFC-10,000'
    },
    {
      id: 'sfo-class-b-outer',
      name: 'SFO Class B (Outer)',
      lat: 37.6213,
      lng: -122.3790,
      radius: 18520, // 10 NM
      type: 'class-b',
      airport: 'SFO',
      altitudes: '1,500-10,000'
    },
    
    // OAK Class C Airspace
    {
      id: 'oak-class-c-inner',
      name: 'OAK Class C (Inner)',
      lat: 37.7214,
      lng: -122.2208,
      radius: 9260, // 5 NM
      type: 'class-c',
      airport: 'OAK',
      altitudes: 'SFC-2,100'
    },
    {
      id: 'oak-class-c-outer',
      name: 'OAK Class C (Outer)',
      lat: 37.7214,
      lng: -122.2208,
      radius: 18520, // 10 NM
      type: 'class-c',
      airport: 'OAK',
      altitudes: '1,200-2,100'
    },
    
    // SJC Class C Airspace
    {
      id: 'sjc-class-c-inner',
      name: 'SJC Class C (Inner)',
      lat: 37.3639,
      lng: -121.9289,
      radius: 9260, // 5 NM
      type: 'class-c',
      airport: 'SJC',
      altitudes: 'SFC-2,500'
    },
    {
      id: 'sjc-class-c-outer',
      name: 'SJC Class C (Outer)',
      lat: 37.3639,
      lng: -121.9289,
      radius: 18520, // 10 NM
      type: 'class-c',
      airport: 'SJC',
      altitudes: '1,200-2,500'
    },
    
    // Class D Airspace for regional airports
    {
      id: 'hwd-class-d',
      name: 'HWD Class D',
      lat: 37.6591,
      lng: -122.1221,
      radius: 7408, // 4 NM
      type: 'class-d',
      airport: 'HWD',
      altitudes: 'SFC-2,500'
    },
    {
      id: 'pao-class-d',
      name: 'PAO Class D',
      lat: 37.4611,
      lng: -122.1150,
      radius: 7408, // 4 NM
      type: 'class-d',
      airport: 'PAO',
      altitudes: 'SFC-2,500'
    },
    {
      id: 'sql-class-d',
      name: 'SQL Class D',
      lat: 37.5118,
      lng: -122.2495,
      radius: 7408, // 4 NM
      type: 'class-d',
      airport: 'SQL',
      altitudes: 'SFC-2,500'
    },
    {
      id: 'lvk-class-d',
      name: 'LVK Class D',
      lat: 37.6934,
      lng: -121.8197,
      radius: 7408, // 4 NM
      type: 'class-d',
      airport: 'LVK',
      altitudes: 'SFC-2,500'
    }
  ]);

  const [conflictZones, setConflictZones] = useState<ConflictZone[]>([
    {
      id: 'conflict-1',
      lat: 37.7799,
      lng: -122.4144,
      radius: 5000,
      severity: 'high',
    },
    {
      id: 'conflict-2',
      lat: 37.7699,
      lng: -122.4244,
      radius: 3000,
      severity: 'medium',
    },
  ]);

  // Realistic Bay Area ATC sector lines
  const [sectorLines, setSectorLines] = useState<SectorLine[]>([
    // SFO Approach Sectors
    {
      id: 'sfo-app-north',
      name: 'SFO North Approach',
      coordinates: [
        [37.8, -122.6],
        [37.8, -122.2],
        [37.65, -122.2],
        [37.65, -122.45]
      ],
      type: 'approach',
      controller: 'SFO_APP',
      frequency: '120.9',
      altitudes: '3,000-10,000'
    },
    {
      id: 'sfo-app-south',
      name: 'SFO South Approach',
      coordinates: [
        [37.65, -122.45],
        [37.65, -122.2],
        [37.45, -122.2],
        [37.45, -122.6]
      ],
      type: 'approach',
      controller: 'SFO_APP',
      frequency: '135.1',
      altitudes: '3,000-10,000'
    },
    
    // Oakland Approach Sectors
    {
      id: 'oak-app-east',
      name: 'Oakland East Approach',
      coordinates: [
        [37.8, -122.2],
        [37.8, -121.7],
        [37.6, -121.7],
        [37.6, -122.0]
      ],
      type: 'approach',
      controller: 'NCT',
      frequency: '120.8',
      altitudes: '2,000-6,000'
    },
    
    // Bay Departure Sectors
    {
      id: 'bay-dep-west',
      name: 'Bay West Departure',
      coordinates: [
        [37.9, -122.6],
        [37.9, -122.4],
        [37.5, -122.4],
        [37.5, -122.7]
      ],
      type: 'departure',
      controller: 'NCT_DEP',
      frequency: '135.65',
      altitudes: '1,500-18,000'
    },
    {
      id: 'bay-dep-east',
      name: 'Bay East Departure',
      coordinates: [
        [37.9, -122.2],
        [37.9, -121.6],
        [37.5, -121.6],
        [37.5, -122.0]
      ],
      type: 'departure',
      controller: 'NCT_DEP',
      frequency: '127.0',
      altitudes: '1,500-18,000'
    },
    
    // Enroute Sectors
    {
      id: 'nor-cal-low',
      name: 'NorCal Low Sector',
      coordinates: [
        [38.1, -122.8],
        [38.1, -121.5],
        [37.3, -121.5],
        [37.3, -122.8]
      ],
      type: 'enroute',
      controller: 'NCT',
      frequency: '134.9',
      altitudes: '6,000-24,000'
    },
    
    // Transition Areas
    {
      id: 'sfo-oak-transition',
      name: 'SFO-OAK Transition',
      coordinates: [
        [37.75, -122.4],
        [37.75, -122.15],
        [37.65, -122.15],
        [37.65, -122.4]
      ],
      type: 'transition',
      controller: 'NCT',
      frequency: '120.9',
      altitudes: '2,500-5,000'
    }
  ]);

  // Handle client-side mounting to avoid hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch real aircraft data from FlightRadar24
  const fetchAircraftData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Debug logging for aircraft fetching
      console.log('🛩️ RadarMap: Fetching aircraft data...');
      await debugAircraft.checkAircraftData();
      
      const realAircraft = await flightRadar24.getAircraftInSFOArea();
      setAircraft(realAircraft);
      
      // Determine if we're using real data or no data (NO MORE FALLBACK)
      const hasApiKey = !!process.env.NEXT_PUBLIC_FLIGHTRADAR24_API_KEY;
      
      console.log(`✅ RadarMap: Updated with ${realAircraft.length} aircraft`);
      
      // Check if we actually got real data
      if (realAircraft.length > 0 && hasApiKey) {
        const isRealData = realAircraft.some(aircraft => 
          aircraft.lastUpdated && 
          aircraft.lastUpdated > Date.now() - 60000 // Updated in last minute
        );
        
        if (isRealData) {
          console.log('✅ RadarMap: Confirmed REAL aircraft data received!');
          setDataSource('live');
        } else {
          console.log('⚠️ RadarMap: Aircraft data may be cached');
          setDataSource('live'); // Still treat as live if we have API key
        }
      } else if (realAircraft.length === 0) {
        console.log('📭 RadarMap: No aircraft data - empty map');
        setDataSource('loading');
      } else {
        console.log('❌ RadarMap: No API key - empty map');
        setDataSource('loading');
      }
      
      if (onAircraftUpdate) {
        onAircraftUpdate(realAircraft.length);
      }
    } catch (err) {
      console.error('❌ RadarMap: Failed to fetch aircraft data:', err);
      setError('Failed to load aircraft data');
      setDataSource('fallback');
    } finally {
      setLoading(false);
    }
  };

  // Initial data fetch - only on client side
  useEffect(() => {
    if (mounted) {
      fetchAircraftData();
      fetchSafetyData();
    }
  }, [mounted]);

  // Refresh aircraft data every 30 seconds - optimized for API efficiency
  useEffect(() => {
    if (!mounted) return;
    
    const interval = setInterval(() => {
      if (dataSource === 'live') {
        fetchAircraftData();
      }
    }, 30000); // Increased to 30 seconds to match cache duration

    return () => clearInterval(interval);
  }, [mounted, dataSource]);

  // Refresh safety data every 5 minutes
  useEffect(() => {
    if (!mounted) return;
    
    const interval = setInterval(() => {
      fetchSafetyData();
    }, 300000); // 5 minutes

    return () => clearInterval(interval);
  }, [mounted]);

  // Manual refresh function
  const handleManualRefresh = async () => {
    try {
      setLoading(true);
      const refreshedAircraft = await flightRadar24.forceRefresh();
      setAircraft(refreshedAircraft);
      if (onAircraftUpdate) {
        onAircraftUpdate(refreshedAircraft.length);
      }
    } catch (err) {
      console.error('Manual refresh failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch aviation safety data
  const fetchSafetyData = async () => {
    try {
      setSafetyDataLoading(true);
      const [tfrData, notamData, sigmetData] = await Promise.all([
        aviationSafety.getActiveTFRs(),
        aviationSafety.getCurrentNOTAMs(),
        aviationSafety.getActiveSIGMETs()
      ]);
      
      setTFRs(tfrData);
      setNOTAMs(notamData);
      setSIGMETs(sigmetData);
      
      console.log(`Updated safety data: ${tfrData.length} TFRs, ${notamData.length} NOTAMs, ${sigmetData.length} SIGMETs`);
    } catch (err) {
      console.error('Failed to fetch aviation safety data:', err);
    } finally {
      setSafetyDataLoading(false);
    }
  };

  // Don't render anything until mounted to avoid hydration issues
  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 rounded-lg">
        <div className="text-white font-mono">RADAR INITIALIZING...</div>
      </div>
    );
  }

  // Create custom aircraft icon with better design
  const createAircraftIcon = (aircraft: Aircraft, isSelected: boolean) => {
    // Check if this aircraft is selected either directly or by callsign from LiveComms
    const isCallsignSelected = selectedCallsign && aircraft.callsign.toLowerCase().includes(selectedCallsign.toLowerCase());
    const isHighlighted = isSelected || isCallsignSelected;
    
    const iconColor = isHighlighted ? '#fbbf24' : '#22d3ee'; // yellow when selected, cyan otherwise
    const iconSize = isHighlighted ? 24 : 20;
    
    return L.divIcon({
      className: 'custom-aircraft-icon',
      html: `
        <div class="relative" style="transform: rotate(${aircraft.heading}deg);">
          <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Aircraft body (fuselage) -->
            <path d="M16 2L17 14H24L26 16L24 18H17L16 30L15 18H8L6 16L8 14H15L16 2Z" 
                  fill="${iconColor}" 
                  stroke="#1f2937" 
                  stroke-width="1"/>
            <!-- Wings -->
            <ellipse cx="16" cy="15" rx="10" ry="2" fill="${iconColor}" opacity="0.8"/>
            <!-- Tail -->
            <path d="M15 26L16 30L17 26H15Z" fill="${iconColor}"/>
            <!-- Cockpit -->
            <circle cx="16" cy="8" r="2" fill="#ffffff" opacity="0.9"/>
            <!-- Engine highlights -->
            <circle cx="12" cy="15" r="1" fill="#ff6b35" opacity="0.7"/>
            <circle cx="20" cy="15" r="1" fill="#ff6b35" opacity="0.7"/>
          </svg>
          ${isHighlighted ? `
            <div class="absolute -inset-2 border-2 border-yellow-400 rounded-full animate-ping opacity-60"></div>
            <div class="absolute -inset-1 border border-yellow-400 rounded-full"></div>
          ` : ''}
          ${isCallsignSelected && !isSelected ? `
            <div class="absolute -inset-2 border-2 border-blue-400 rounded-full animate-pulse opacity-80"></div>
            <div class="absolute -inset-1 border border-blue-400 rounded-full"></div>
          ` : ''}
        </div>
        <div class="absolute top-6 left-1/2 transform -translate-x-1/2 text-xs font-mono font-bold whitespace-nowrap bg-gray-900 bg-opacity-90 px-1 rounded border" 
             style="color: ${iconColor}; ${isCallsignSelected ? 'border-color: #60a5fa;' : ''}">
          ${aircraft.callsign}
          <div class="text-white text-xs">${aircraft.altitude.toLocaleString()}'</div>
          ${isCallsignSelected ? '<div class="text-blue-400 text-xs">📡 IN COMMS</div>' : ''}
        </div>
      `,
      iconSize: [iconSize, iconSize],
      iconAnchor: [iconSize/2, iconSize/2],
    });
  };

  // Create origin marker icon
  const createOriginIcon = () => {
    return L.divIcon({
      className: 'origin-marker',
      html: `
        <div class="flex items-center justify-center w-6 h-6 bg-green-500 border-2 border-white rounded-full shadow-lg">
          <div class="w-2 h-2 bg-white rounded-full"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  };

  // Create destination marker icon
  const createDestinationIcon = () => {
    return L.divIcon({
      className: 'destination-marker',
      html: `
        <div class="flex items-center justify-center w-6 h-6 bg-red-500 border-2 border-white rounded-full shadow-lg">
          <div class="w-1 h-1 bg-white rounded-full"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  };

  const getConflictColor = (severity: string) => {
    switch (severity) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  // Get airspace colors based on class
  const getAirspaceColor = (type: string) => {
    // All airspace same color like real ATC displays
    return '#10b981'; // Professional green for all airspace
  };

  // Get airspace opacity based on inner/outer
  const getAirspaceOpacity = (name: string) => {
    return name.includes('Inner') ? 0.3 : 0.15;
  };

  // Get sector line colors based on type
  const getSectorColor = (type: string) => {
    // All sector lines same color like real ATC displays
    return '#10b981'; // Professional green color for all sectors
  };

  // Generate trail path for selected aircraft
  const getTrailPath = (trail: { lat: number; lng: number; timestamp: number; altitude: number }[]) => {
    return trail.map(point => [point.lat, point.lng] as [number, number]);
  };

  // Generate trail color based on altitude
  const getTrailColor = (altitude: number) => {
    if (altitude > 30000) return '#22d3ee'; // cyan for high altitude
    if (altitude > 15000) return '#10b981'; // green for medium altitude
    return '#f59e0b'; // orange for low altitude
  };

  // Create airport marker icon
  const createAirportIcon = (airport: Airport) => {
    const iconColor = airport.type === 'major' ? '#3b82f6' : '#6b7280'; // blue for major, gray for regional
    const iconSize = airport.type === 'major' ? 32 : 26;
    const strokeColor = '#1f2937';
    
    return L.divIcon({
      className: 'airport-marker',
      html: `
        <div class="relative flex items-center justify-center drop-shadow-lg">
          <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Background circle for better visibility -->
            <circle cx="20" cy="20" r="18" fill="rgba(0,0,0,0.8)" stroke="${iconColor}" stroke-width="2"/>
            
            <!-- Airport terminal building -->
            <rect x="12" y="16" width="16" height="8" fill="${iconColor}" stroke="${strokeColor}" stroke-width="0.8" rx="1"/>
            
            <!-- Control tower -->
            <rect x="18" y="12" width="4" height="12" fill="${iconColor}" stroke="${strokeColor}" stroke-width="0.8" rx="0.5"/>
            
            <!-- Runway indicators (crosshair style) -->
            <rect x="8" y="19" width="24" height="2" fill="#ffffff" opacity="0.9" rx="1"/>
            <rect x="19" y="8" width="2" height="24" fill="#ffffff" opacity="0.7" rx="1"/>
            
            <!-- Airport beacon light -->
            <circle cx="20" cy="14" r="1.5" fill="#22d3ee" opacity="1">
              <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/>
            </circle>
            
            <!-- Small navigation lights -->
            <circle cx="16" cy="18" r="0.8" fill="#ef4444" opacity="0.8"/>
            <circle cx="24" cy="18" r="0.8" fill="#10b981" opacity="0.8"/>
          </svg>
          
          <!-- Airport code label with improved styling -->
          <div class="absolute -bottom-7 left-1/2 transform -translate-x-1/2 text-xs font-mono font-bold whitespace-nowrap bg-black bg-opacity-90 text-white px-2 py-1 rounded-md border border-gray-600 shadow-lg">
            ${airport.code}
          </div>
        </div>
      `,
      iconSize: [iconSize, iconSize],
      iconAnchor: [iconSize/2, iconSize/2],
    });
  };

  return (
    <div className="relative w-full h-full bg-gray-900 overflow-hidden">
      
      <MapContainer
        center={[37.7749, -122.4194]}
        zoom={11}
        className="w-full h-full z-0"
        style={{ height: '100%', width: '100%' }}
      >
        {/* Map Events Handler for deselecting aircraft */}
        <MapEvents onMapClick={onMapClick} />
        
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {/* Custom Airspace Zones */}
        {showAirspace && airspaceZones.map((zone) => (
          <Circle
            key={zone.id}
            center={[zone.lat, zone.lng]}
            radius={zone.radius}
            pathOptions={{
              color: getAirspaceColor(zone.type),
              fillColor: getAirspaceColor(zone.type),
              fillOpacity: getAirspaceOpacity(zone.name),
              weight: 2,
              dashArray: zone.name.includes('Outer') ? '10, 5' : undefined,
            }}
          >
            <Popup className="custom-popup">
              <div className="text-sm bg-gray-900 text-white p-3 rounded-lg">
                <div className="font-bold text-green-400">{zone.name}</div>
                <div className="text-xs mt-1">
                  <div>Airport: {zone.airport}</div>
                  <div>Class: {zone.type.toUpperCase().replace('-', ' ')}</div>
                  <div>Altitudes: {zone.altitudes}</div>
                  <div>Radius: {(zone.radius / 1852).toFixed(1)} NM</div>
                </div>
              </div>
            </Popup>
          </Circle>
        ))}

        {/* ATC Sector Lines */}
        {showSectors && sectorLines.map((sector) => (
          <Polygon
            key={sector.id}
            positions={sector.coordinates}
            pathOptions={{
              color: getSectorColor(sector.type),
              fillColor: getSectorColor(sector.type),
              fillOpacity: 0.05,
              weight: 2,
              dashArray: '8, 4',
              opacity: 0.9,
            }}
          >
            <Popup className="custom-popup">
              <div className="text-sm bg-gray-900 text-white p-3 rounded-lg">
                <div className="font-bold text-green-400">{sector.name}</div>
                <div className="text-xs mt-1">
                  <div>Controller: {sector.controller}</div>
                  <div>Frequency: {sector.frequency}</div>
                  <div>Type: {sector.type.toUpperCase()}</div>
                  <div>Altitudes: {sector.altitudes}</div>
                </div>
              </div>
            </Popup>
          </Polygon>
        ))}

        {/* Conflict Zones */}
        {conflictZones.map((zone) => (
          <Circle
            key={zone.id}
            center={[zone.lat, zone.lng]}
            radius={zone.radius}
            pathOptions={{
              color: getConflictColor(zone.severity),
              fillColor: getConflictColor(zone.severity),
              fillOpacity: 0.3,
              weight: 3,
              className: 'animate-pulse',
            }}
          />
        ))}

        {/* TFR (Temporary Flight Restrictions) */}
        {showTFRs && tfrs.map((tfr) => (
          <Polygon
            key={tfr.id}
            positions={tfr.coordinates}
            pathOptions={{
              color: aviationSafety.getTFRColor(tfr),
              fillColor: aviationSafety.getTFRColor(tfr),
              fillOpacity: 0.4,
              weight: 3,
              dashArray: '10, 5',
              opacity: 0.9,
            }}
          >
            <Popup className="custom-popup">
              <div className="text-sm bg-gray-900 text-white p-3 rounded-lg">
                <div className="font-bold text-red-400">{tfr.description}</div>
                <div className="text-xs mt-1">
                  <div>NOTAM: {tfr.notamId}</div>
                  <div>Type: {tfr.type.toUpperCase()}</div>
                  <div>Severity: {tfr.severity.toUpperCase()}</div>
                  <div>Agency: {tfr.controllingAgency}</div>
                  <div>Altitudes: {tfr.altitudeLow.toLocaleString()}' - {tfr.altitudeHigh.toLocaleString()}'</div>
                  <div>Radius: {(tfr.radius / 1852).toFixed(1)} NM</div>
                  <div className="mt-2 text-yellow-400">
                    <div>Effective: {new Date(tfr.effectiveStart).toLocaleString()}</div>
                    <div>Until: {new Date(tfr.effectiveEnd).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </Popup>
          </Polygon>
        ))}

        {/* NOTAM Markers */}
        {showNOTAMs && notams.filter(notam => notam.coordinates).map((notam) => (
          <Marker
            key={notam.id}
            position={[notam.coordinates!.lat, notam.coordinates!.lng]}
            icon={L.divIcon({
              className: 'notam-marker',
              html: `
                <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-lg animate-pulse" 
                     style="background-color: ${aviationSafety.getNOTAMColor(notam)};">
                  <div class="text-white font-bold text-xs">!</div>
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })}
          >
            <Popup className="custom-popup">
              <div className="text-sm bg-gray-900 text-white p-3 rounded-lg min-w-48">
                <div className="font-bold text-orange-400">{notam.subject}</div>
                <div className="text-xs mt-1">
                  <div>Location: {notam.location}</div>
                  <div>Type: {notam.type.toUpperCase()}</div>
                  <div>Severity: {notam.severity.toUpperCase()}</div>
                  <div>Facility: {notam.affectedFacility}</div>
                  <div className="mt-2">
                    <div className="text-gray-300">{notam.description}</div>
                  </div>
                  <div className="mt-2 text-cyan-400">
                    <div>Effective: {new Date(notam.effectiveStart).toLocaleString()}</div>
                    {notam.effectiveEnd && (
                      <div>Until: {new Date(notam.effectiveEnd).toLocaleString()}</div>
                    )}
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* SIGMETs (Significant Meteorological Information) */}
        {showSIGMETs && sigmets.map((sigmet) => (
          <Polygon
            key={sigmet.id}
            positions={sigmet.coordinates}
            pathOptions={{
              color: '#fbbf24',
              fillColor: '#fbbf24',
              fillOpacity: 0.2,
              weight: 2,
              dashArray: '15, 5',
              opacity: 0.8,
            }}
          >
            <Popup className="custom-popup">
              <div className="text-sm bg-gray-900 text-white p-3 rounded-lg">
                <div className="font-bold text-yellow-400">SIGMET</div>
                <div className="text-xs mt-1">
                  <div>Phenomenon: {sigmet.phenomenon.toUpperCase()}</div>
                  <div>Intensity: {sigmet.intensity.toUpperCase()}</div>
                  <div>Flight Levels: {sigmet.flightLevels}</div>
                  <div>Movement: {sigmet.movement}</div>
                  <div>FIR: {sigmet.fir}</div>
                  <div className="mt-2 text-gray-300">
                    {sigmet.description}
                  </div>
                  <div className="mt-2 text-cyan-400">
                    <div>Valid: {new Date(sigmet.validFrom).toLocaleString()}</div>
                    <div>Until: {new Date(sigmet.validTo).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </Popup>
          </Polygon>
        ))}

        {/* Flight Trail for Selected Aircraft */}
        {selectedAircraft && selectedAircraft.trail && selectedAircraft.trail.length > 1 && (
          <Polyline
            positions={getTrailPath(selectedAircraft.trail)}
            pathOptions={{
              color: '#fbbf24',
              weight: 3,
              opacity: 0.8,
              dashArray: '5, 5',
            }}
          />
        )}

        {/* Origin Marker for Selected Aircraft */}
        {selectedAircraft && selectedAircraft.origin && (
          <Marker
            position={[selectedAircraft.origin.lat, selectedAircraft.origin.lng]}
            icon={createOriginIcon()}
          >
            <Popup className="custom-popup">
              <div className="text-sm bg-gray-900 text-white p-2 rounded">
                <div className="font-bold text-green-400">ORIGIN</div>
                <div className="text-xs">{selectedAircraft.origin.name || 'Estimated Start Point'}</div>
                <div className="text-xs text-gray-400">
                  {selectedAircraft.origin.lat.toFixed(4)}, {selectedAircraft.origin.lng.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker for Selected Aircraft */}
        {selectedAircraft && selectedAircraft.destination && (
          <Marker
            position={[selectedAircraft.destination.lat, selectedAircraft.destination.lng]}
            icon={createDestinationIcon()}
          >
            <Popup className="custom-popup">
              <div className="text-sm bg-gray-900 text-white p-2 rounded">
                <div className="font-bold text-red-400">DESTINATION</div>
                <div className="text-xs">{selectedAircraft.destination.name || 'Estimated End Point'}</div>
                <div className="text-xs text-gray-400">
                  {selectedAircraft.destination.lat.toFixed(4)}, {selectedAircraft.destination.lng.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}
        
        {/* Airport Markers */}
        {showAirports && airports.map((airport) => (
          <Marker
            key={airport.id}
            position={[airport.lat, airport.lng]}
            icon={createAirportIcon(airport)}
          >
            <Popup className="custom-popup">
              <div className="text-sm bg-gray-900 text-gray-400 p-3 rounded-lg min-w-56 border-0">
                {/* Header */}
                <div className="flex items-center justify-between mb-3 border-b border-gray-600 pb-2">
                  <div className="font-bold text-lg text-green-400">{airport.code}</div>
                  <div className={`px-2 py-1 rounded text-xs font-bold ${
                    airport.type === 'major' ? 'bg-green-600 text-gray-900' : 'bg-gray-600 text-gray-300'
                  }`}>
                    {airport.type.toUpperCase()}
                  </div>
                </div>
                
                {/* Airport Name */}
                <div className="mb-3">
                  <div className="text-gray-400 font-semibold">{airport.name}</div>
                </div>
                
                {/* Airport Data Grid */}
                <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-400 text-xs">COORDINATES</div>
                    <div className="text-gray-300 font-bold">
                      {airport.lat.toFixed(4)}, {airport.lng.toFixed(4)}
                    </div>
                  </div>
                  
                  {airport.runways && airport.runways.length > 0 && (
                    <div className="bg-gray-800 p-2 rounded">
                      <div className="text-gray-400 text-xs">RUNWAYS</div>
                      <div className="text-cyan-400 font-bold">
                        {airport.runways.join(', ')}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Status Info */}
                <div className="mt-3 pt-2 border-t border-gray-600">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Airport ID:</span>
                    <span className="text-gray-300 font-mono">{airport.id}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-gray-400">Type:</span>
                    <span className="text-green-400">{airport.type} Airport</span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Aircraft Markers - Configurable limit for performance */}
        {aircraft.slice(0, AIRCRAFT_CONFIG.MAX_AIRCRAFT_DISPLAY).map((plane) => (
          <Marker
            key={plane.id}
            position={[plane.lat, plane.lng]}
            icon={createAircraftIcon(plane, selectedAircraft?.id === plane.id)}
            eventHandlers={{
              click: () => onAircraftSelect(plane),
            }}
          >
            <Popup className="custom-popup">
              <div className="text-sm bg-gray-900 text-white p-3 rounded-lg min-w-48">
                {/* Header */}
                <div className="flex items-center justify-between mb-3 border-b border-gray-600 pb-2">
                  <div className="font-bold text-lg text-blue-400">{plane.callsign}</div>
                  <div className={`px-2 py-1 rounded text-xs font-bold ${
                    dataSource === 'live' ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                  }`}>
                    {dataSource === 'live' ? 'LIVE' : 'No Data'}
                  </div>
                </div>
                
                {/* Flight Data Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-400 text-xs">ALTITUDE</div>
                    <div className="text-green-400 font-bold">{plane.altitude.toLocaleString()}ft</div>
                  </div>
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-400 text-xs">SPEED</div>
                    <div className="text-cyan-400 font-bold">{plane.speed}kts</div>
                  </div>
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-400 text-xs">HEADING</div>
                    <div className="text-white font-bold">{plane.heading.toString().padStart(3, '0')}°</div>
                  </div>
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-400 text-xs">POSITION</div>
                    <div className="text-white font-bold text-xs">
                      {plane.lat.toFixed(3)}, {plane.lng.toFixed(3)}
                    </div>
                  </div>
                </div>

                {/* Trail Info */}
                {plane.trail && plane.trail.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gray-600">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400">Trail Points:</span>
                      <span className="text-yellow-400 font-mono">{plane.trail.length}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Click aircraft to see flight path
                    </div>
                  </div>
                )}
                
                {/* Status Info */}
                <div className="mt-3 pt-2 border-t border-gray-600">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Aircraft ID:</span>
                    <span className="text-white font-mono">{plane.id}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-gray-400">Data Source:</span>
                    <span className={dataSource === 'live' ? 'text-green-400' : 'text-gray-400'}>
                      {dataSource === 'live' ? 'FlightRadar24' : 'No Data'}
                    </span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Controls Overlay */}
      <div className={`absolute top-1/2 transform -translate-y-1/2 z-20 bg-gray-900 bg-opacity-95 border border-green-500 rounded-lg p-3 shadow-xl transition-all duration-300 ${
        selectedAircraft ? 'left-80' : 'left-4'
      }`}>
        <div className="text-xs font-mono text-green-400">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
            <div className={`w-2 h-2 rounded-full ${
              loading ? 'bg-yellow-500 animate-pulse' : 
              error ? 'bg-red-500' : 
              dataSource === 'live' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
            }`}></div>
            <span className="text-xs font-bold">
              {loading ? 'UPD' : 
               error ? 'ERR' : 
               dataSource === 'live' ? 'LIVE' : 'EMPTY'}
            </span>
            {dataSource === 'live' && (
              <button
                onClick={handleManualRefresh}
                disabled={loading}
                className="px-1 py-0.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-xs rounded transition-colors"
                title="Refresh"
              >
                ↻
              </button>
            )}
          </div>
          
          {/* Vertical Filter Icons Grid */}
          <div className="flex flex-col gap-2">
            <div className="text-center text-xs text-gray-400 mb-1 font-bold">FILTERS</div>
            
            <button
              onClick={() => setShowAirports(!showAirports)}
              className={`w-8 h-8 rounded text-sm flex items-center justify-center transition-colors ${
                showAirports 
                  ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg' 
                  : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
              }`}
              title="Airports"
            >
              🏢
            </button>
            
            <button
              onClick={() => setShowAirspace(!showAirspace)}
              className={`w-8 h-8 rounded text-sm flex items-center justify-center transition-colors ${
                showAirspace 
                  ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg' 
                  : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
              }`}
              title="Airspace"
            >
              🛡️
            </button>
            
            <button
              onClick={() => setShowSectors(!showSectors)}
              className={`w-8 h-8 rounded text-sm flex items-center justify-center transition-colors ${
                showSectors 
                  ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg' 
                  : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
              }`}
              title="Sectors"
            >
              🏛️
            </button>
            
            <div className="border-t border-gray-700 my-2"></div>
            <div className="text-center text-xs text-gray-400 mb-1 font-bold">SAFETY</div>
            
            <button
              onClick={() => setShowTFRs(!showTFRs)}
              className={`w-8 h-8 rounded text-sm flex items-center justify-center transition-colors ${
                showTFRs 
                  ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg' 
                  : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
              }`}
              title="TFRs"
            >
              🚫
            </button>
            
            <button
              onClick={() => setShowNOTAMs(!showNOTAMs)}
              className={`w-8 h-8 rounded text-sm flex items-center justify-center transition-colors ${
                showNOTAMs 
                  ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg' 
                  : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
              }`}
              title="NOTAMs"
            >
              ⚠️
            </button>
            
            <button
              onClick={() => setShowSIGMETs(!showSIGMETs)}
              className={`w-8 h-8 rounded text-sm flex items-center justify-center transition-colors ${
                showSIGMETs 
                  ? 'bg-yellow-600 text-white hover:bg-yellow-700 shadow-lg' 
                  : 'bg-gray-600 text-gray-400 hover:bg-gray-500'
              }`}
              title="SIGMETs"
            >
              🌩️
            </button>
          </div>
        </div>
      </div>

      {/* Selected Aircraft Trail Info */}
      {selectedAircraft && (
        <div className="absolute top-4 right-80 z-20 bg-gray-900 bg-opacity-90 border border-yellow-500 rounded-lg p-3 shadow-lg">
          <div className="text-xs font-mono text-yellow-400">
            <div className="font-bold mb-1">TRACKING: {selectedAircraft.callsign}</div>
            <div className="text-white">
              <div>🟢 Origin: {selectedAircraft.origin ? 'Marked' : 'Unknown'}</div>
              <div>🔴 Destination: {selectedAircraft.destination ? 'Estimated' : 'Unknown'}</div>
              <div>📍 Trail: {selectedAircraft.trail?.length || 0} points</div>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Click another aircraft to change tracking
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && aircraft.length === 0 && (
        <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-30">
          <div className="text-center">
            <div className="text-cyan-400 font-mono text-lg mb-2">LOADING REAL AIRCRAFT DATA</div>
            <div className="text-gray-400 font-mono text-sm">
              Connecting to FlightRadar24 API...
            </div>
            <div className="text-gray-500 font-mono text-xs mt-2">
              No mock data - Real flights only
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 