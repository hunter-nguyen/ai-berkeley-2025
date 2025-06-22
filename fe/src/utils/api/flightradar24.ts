interface FlightRadar24Aircraft {
  hex: string;
  flight: string;
  lat: number;
  lng: number;
  altitude: number;
  heading: number;
  speed: number;
  squawk: string;
  aircraft_type: string;
  timestamp: number;
}

interface Aircraft {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number;
  heading: number;
  speed: number;
  trail?: { lat: number; lng: number; timestamp: number; altitude: number }[];
  origin?: { lat: number; lng: number; name?: string };
  destination?: { lat: number; lng: number; name?: string };
  lastUpdated?: number;
}

const API_KEY = process.env.NEXT_PUBLIC_FLIGHTRADAR24_API_KEY;

// ✈️ AIRCRAFT DISPLAY CONFIGURATION
// Adjust these values to control how many aircraft are shown
export const AIRCRAFT_CONFIG = {
  MAX_AIRCRAFT_DISPLAY: 20,  // Maximum aircraft to show on map (change this!)
  API_FETCH_LIMIT: 25,       // How many to fetch from API (should be higher than display limit)
  MIN_ALTITUDE: 1000,        // Minimum altitude to show (feet)
  MAX_FALLBACK_AIRCRAFT: 7   // Number of demo aircraft when no API key
};

// San Francisco Bay Area bounds for filtering aircraft
const SFO_BOUNDS = {
  north: 37.9,
  south: 37.6,
  east: -122.2,
  west: -122.7
};

export class FlightRadar24Service {
  private static instance: FlightRadar24Service;
  private cache: Aircraft[] = [];
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 30000; // 30 seconds - longer cache to reduce API calls
  private errorCount: number = 0;
  private readonly MAX_ERRORS = 3;
  private lastErrorTime: number = 0;
  private readonly ERROR_BACKOFF = 60000; // 1 minute backoff after errors
  private flightTrails: Map<string, { lat: number; lng: number; timestamp: number; altitude: number }[]> = new Map();
  private readonly MAX_TRAIL_POINTS = 20; // Keep last 20 positions for trail

  static getInstance(): FlightRadar24Service {
    if (!FlightRadar24Service.instance) {
      FlightRadar24Service.instance = new FlightRadar24Service();
    }
    return FlightRadar24Service.instance;
  }

  private isPageVisible(): boolean {
    return typeof document !== 'undefined' && !document.hidden;
  }

  private shouldSkipAPICall(): boolean {
    const now = Date.now();
    
    // Skip if page is not visible (tab is not active)
    if (!this.isPageVisible()) {
      console.log('📱 Page not visible, skipping API call');
      return true;
    }
    
    // Skip if we've had too many errors recently
    if (this.errorCount >= this.MAX_ERRORS && (now - this.lastErrorTime) < this.ERROR_BACKOFF) {
      console.log('⏰ In error backoff period, skipping API call');
      return true;
    }
    
    return false;
  }

  async getAircraftInSFOArea(): Promise<Aircraft[]> {
    const now = Date.now();
    
    // Debug logging
    console.log('🔍 FlightRadar24Service Debug:');
    console.log('   - API Key present:', !!API_KEY);
    console.log('   - Cache age:', now - this.lastFetch, 'ms');
    console.log('   - Cache size:', this.cache.length);
    console.log('   - Max aircraft display:', AIRCRAFT_CONFIG.MAX_AIRCRAFT_DISPLAY);
    console.log('   - Page visible:', this.isPageVisible());
    console.log('   - Error count:', this.errorCount);
    
    // Return cached data if still fresh
    if (this.cache.length > 0 && (now - this.lastFetch) < this.CACHE_DURATION) {
      console.log('📋 Using cached aircraft data');
      return this.cache;
    }

    // If no API key, return fallback data immediately
    if (!API_KEY) {
      console.log('🔑 No API key found, using fallback aircraft data');
      const fallback = this.getFallbackAircraft();
      this.cache = fallback;
      this.lastFetch = now;
      return fallback;
    }

    // Skip API call if conditions aren't favorable
    if (this.shouldSkipAPICall()) {
      // Return cached data if available, otherwise fallback
      return this.cache.length > 0 ? this.cache : this.getFallbackAircraft();
    }

    try {
      // Official FlightRadar24 API endpoint - use configurable limit
      const bounds = `${SFO_BOUNDS.north},${SFO_BOUNDS.south},${SFO_BOUNDS.west},${SFO_BOUNDS.east}`;
      const endpoint = `https://fr24api.flightradar24.com/api/live/flight-positions/light?bounds=${bounds}&limit=${AIRCRAFT_CONFIG.API_FETCH_LIMIT}`;
      
      console.log(`🛩️ Fetching live aircraft data from official FR24 API...`);
      console.log(`📍 Endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'Accept-Version': 'v1',
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(`📊 API Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ FR24 API error details:`, errorText);
        throw new Error(`FR24 API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform the official API response
      const aircraft: Aircraft[] = [];
      
      if (data.data && Array.isArray(data.data)) {
        console.log(`🔄 Processing ${data.data.length} aircraft from API`);
        
        for (const flight of data.data) {
          // Only include airborne aircraft (configurable altitude) to avoid ground traffic
          if (flight.lat && flight.lon && flight.alt > AIRCRAFT_CONFIG.MIN_ALTITUDE) {
            const aircraftId = flight.fr24_id || flight.hex;
            const currentPosition = {
              lat: parseFloat(flight.lat),
              lng: parseFloat(flight.lon),
              timestamp: now,
              altitude: parseInt(flight.alt) || 0
            };

            // Update flight trail
            this.updateFlightTrail(aircraftId, currentPosition);

            aircraft.push({
              id: aircraftId,
              callsign: flight.callsign || flight.hex || `AC${flight.fr24_id?.substring(0, 4)}`,
              lat: currentPosition.lat,
              lng: currentPosition.lng,
              altitude: currentPosition.altitude,
              heading: this.normalizeHeading(parseInt(flight.track) || 0),
              speed: parseInt(flight.gspeed) || 0,
              trail: this.flightTrails.get(aircraftId) || [],
              origin: this.estimateOrigin(aircraftId),
              destination: this.estimateDestination(aircraftId),
              lastUpdated: now,
            });
          }
        }
      } else {
        console.warn('⚠️ Unexpected API response format:', data);
      }

      // Limit to configured maximum for performance and clarity
      this.cache = aircraft.slice(0, AIRCRAFT_CONFIG.MAX_AIRCRAFT_DISPLAY);
      this.lastFetch = now;
      
      // Reset error count on successful call
      this.errorCount = 0;
      
      console.log(`✅ Successfully processed ${this.cache.length}/${aircraft.length} aircraft from official FR24 API`);
      return this.cache;

    } catch (error) {
      console.error('❌ Error fetching FR24 API data:', error);
      
      // Increment error count and record time
      this.errorCount++;
      this.lastErrorTime = now;
      
      // Return cached data if available, otherwise fallback
      if (this.cache.length > 0) {
        console.log(`🔄 Using cached data due to API error (${this.cache.length} aircraft)`);
        return this.cache;
      } else {
        const fallback = this.getFallbackAircraft();
        console.log(`🔄 Using ${fallback.length} fallback aircraft due to API error`);
        return fallback;
      }
    }
  }

  private updateFlightTrail(aircraftId: string, position: { lat: number; lng: number; timestamp: number; altitude: number }) {
    if (!this.flightTrails.has(aircraftId)) {
      this.flightTrails.set(aircraftId, []);
    }

    const trail = this.flightTrails.get(aircraftId)!;
    
    // Add new position
    trail.push(position);
    
    // Keep only the last MAX_TRAIL_POINTS positions
    if (trail.length > this.MAX_TRAIL_POINTS) {
      trail.shift();
    }
    
    // Clean up old trails (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    for (const [id, trailData] of this.flightTrails.entries()) {
      const recentPoints = trailData.filter(point => point.timestamp > oneHourAgo);
      if (recentPoints.length === 0) {
        this.flightTrails.delete(id);
      } else {
        this.flightTrails.set(id, recentPoints);
      }
    }
  }

  private estimateOrigin(aircraftId: string): { lat: number; lng: number; name?: string } | undefined {
    const trail = this.flightTrails.get(aircraftId);
    if (!trail || trail.length < 5) return undefined;
    
    // Use the earliest position in our trail as estimated origin
    const earliest = trail[0];
    return {
      lat: earliest.lat,
      lng: earliest.lng,
      name: 'Estimated Origin'
    };
  }

  private estimateDestination(aircraftId: string): { lat: number; lng: number; name?: string } | undefined {
    const trail = this.flightTrails.get(aircraftId);
    if (!trail || trail.length < 3) return undefined;
    
    // Estimate destination based on current heading and recent positions
    const recent = trail.slice(-3);
    const avgLat = recent.reduce((sum, p) => sum + p.lat, 0) / recent.length;
    const avgLng = recent.reduce((sum, p) => sum + p.lng, 0) / recent.length;
    
    // Project forward based on current trajectory (simplified)
    const latDiff = trail[trail.length - 1].lat - trail[Math.max(0, trail.length - 3)].lat;
    const lngDiff = trail[trail.length - 1].lng - trail[Math.max(0, trail.length - 3)].lng;
    
    return {
      lat: avgLat + (latDiff * 5), // Project 5x current movement
      lng: avgLng + (lngDiff * 5),
      name: 'Estimated Destination'
    };
  }

  // Get flight trail for a specific aircraft
  getFlightTrail(aircraftId: string): { lat: number; lng: number; timestamp: number; altitude: number }[] {
    return this.flightTrails.get(aircraftId) || [];
  }

  // Method to manually refresh data (for a refresh button)
  async forceRefresh(): Promise<Aircraft[]> {
    console.log('🔄 Force refreshing aircraft data...');
    this.lastFetch = 0; // Reset cache timer
    this.errorCount = 0; // Reset error count
    return this.getAircraftInSFOArea();
  }

  // Get cache info for debugging
  getCacheInfo() {
    const now = Date.now();
    return {
      cacheAge: now - this.lastFetch,
      cacheSize: this.cache.length,
      maxDisplay: AIRCRAFT_CONFIG.MAX_AIRCRAFT_DISPLAY,
      errorCount: this.errorCount,
      isVisible: this.isPageVisible(),
      nextRefreshIn: Math.max(0, this.CACHE_DURATION - (now - this.lastFetch))
    };
  }

  private getFallbackAircraft(): Aircraft[] {
    // Enhanced mock data that looks realistic for SFO area
    // Limit fallback aircraft to configured amount
    const fallbackAircraft = [
      {
        id: 'UAL123',
        callsign: 'UAL123',
        lat: 37.7749,
        lng: -122.4194,
        altitude: 35000,
        heading: 90,
        speed: 480,
      },
      {
        id: 'DAL456',
        callsign: 'DAL456',
        lat: 37.7849,
        lng: -122.4094,
        altitude: 37000,
        heading: 270,
        speed: 520,
      },
      {
        id: 'AAL789',
        callsign: 'AAL789',
        lat: 37.7649,
        lng: -122.4294,
        altitude: 33000,
        heading: 180,
        speed: 460,
      },
      {
        id: 'SWA901',
        callsign: 'SWA901',
        lat: 37.7949,
        lng: -122.3994,
        altitude: 39000,
        heading: 45,
        speed: 490,
      },
      {
        id: 'JBU234',
        callsign: 'JBU234',
        lat: 37.7549,
        lng: -122.4394,
        altitude: 31000,
        heading: 315,
        speed: 470,
      },
      {
        id: 'ASA567',
        callsign: 'ASA567',
        lat: 37.7849,
        lng: -122.4294,
        altitude: 36000,
        heading: 120,
        speed: 505,
      },
      {
        id: 'VIR890',
        callsign: 'VIR890',
        lat: 37.7649,
        lng: -122.4094,
        altitude: 34000,
        heading: 240,
        speed: 485,
      },
      {
        id: 'LUV123',
        callsign: 'LUV123',
        lat: 37.8049,
        lng: -122.3894,
        altitude: 32000,
        heading: 60,
        speed: 495,
      },
      {
        id: 'FFT456',
        callsign: 'FFT456',
        lat: 37.7349,
        lng: -122.4494,
        altitude: 38000,
        heading: 300,
        speed: 515,
      },
      {
        id: 'UAL789',
        callsign: 'UAL789',
        lat: 37.7949,
        lng: -122.4194,
        altitude: 36000,
        heading: 150,
        speed: 485,
      }
    ];
    
    return fallbackAircraft.slice(0, AIRCRAFT_CONFIG.MAX_FALLBACK_AIRCRAFT);
  }

  private normalizeHeading(heading: number): number {
    // Normalize heading to be between 0 and 360 degrees
    while (heading < 0) {
      heading += 360;
    }
    while (heading >= 360) {
      heading -= 360;
    }
    return heading;
  }
}

export const flightRadar24 = FlightRadar24Service.getInstance(); 