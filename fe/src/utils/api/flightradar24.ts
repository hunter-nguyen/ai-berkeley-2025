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
  MAX_AIRCRAFT_DISPLAY: 25,  // Maximum aircraft to show on map (increased for better visibility!)
  API_FETCH_LIMIT: 30,       // How many to fetch from API (should be higher than display limit)
  MIN_ALTITUDE: 0,           // Minimum altitude to show (feet) - include ground aircraft at airports
};

// San Francisco Bay Area bounds for filtering aircraft
const SFO_BOUNDS = {
  north: 37.9,
  south: 37.6,
  east: -122.2,
  west: -122.7
};

// Official FlightRadar24 API endpoints
const FR24_API_BASE = 'https://fr24api.flightradar24.com';
const FR24_ENDPOINTS = {
  FLIGHTS: '/api/live/flight-positions/full',
  LIGHT: '/api/live/flight-positions/light', 
  AIRPORTS: '/api/airports',
  AIRLINES: '/api/airlines'
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
    console.log('   - API Key prefix:', API_KEY ? API_KEY.substring(0, 8) + '...' : 'None');
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

    // If no API key, return EMPTY - NO MOCK DATA
    if (!API_KEY) {
      console.log('❌ No API key found - returning EMPTY (no mock data)');
      this.cache = [];
      this.lastFetch = now;
      return [];
    }

    // Skip API call if conditions aren't favorable
    if (this.shouldSkipAPICall()) {
      // Return cached data if available, otherwise EMPTY - NO MOCK DATA
      if (this.cache.length > 0) {
        return this.cache;
      } else {
        console.log('⏰ Skipping API call - returning EMPTY (no mock data)');
        return [];
      }
    }

    try {
      console.log(`🛩️ Fetching REAL aircraft data from FlightRadar24 Official API...`);
      console.log(`🔑 Using API base: ${FR24_API_BASE}`);
      
      // Use the OFFICIAL FlightRadar24 API endpoint with authentication
      const aircraft = await this.fetchFromOfficialAPI();
      
      if (aircraft.length > 0) {
        // Limit to configured maximum for performance and clarity
        this.cache = aircraft.slice(0, AIRCRAFT_CONFIG.MAX_AIRCRAFT_DISPLAY);
        this.lastFetch = now;
        
        // Reset error count on successful call
        this.errorCount = 0;
        
        console.log(`✅ Successfully processed ${this.cache.length}/${aircraft.length} REAL aircraft from FlightRadar24 Official API`);
        return this.cache;
      } else {
        console.log('⚠️ No aircraft data received from official API - returning EMPTY');
        this.cache = [];
        this.lastFetch = now;
        return [];
      }

    } catch (error) {
      console.error('❌ Error fetching FR24 Official API data:', error);
      
      // Increment error count and record time
      this.errorCount++;
      this.lastErrorTime = now;
      
      // Return cached data if available, otherwise EMPTY - NO MOCK DATA
      if (this.cache.length > 0) {
        console.log(`🔄 Using cached REAL data due to API error (${this.cache.length} aircraft)`);
        return this.cache;
      } else {
        console.log('❌ API failed and no cached data - returning EMPTY (no mock data)');
        this.cache = [];
        this.lastFetch = now;
        return [];
      }
    }
  }

  private async fetchFromOfficialAPI(): Promise<Aircraft[]> {
    // Official FlightRadar24 API endpoint
    const endpoint = `${FR24_API_BASE}${FR24_ENDPOINTS.LIGHT}`;
    const bounds = `${SFO_BOUNDS.north},${SFO_BOUNDS.south},${SFO_BOUNDS.west},${SFO_BOUNDS.east}`;
    
    console.log(`📡 Using Official FR24 API: ${endpoint}`);
    console.log(`📍 Bounds: ${bounds}`);
    
    try {
      const response = await fetch(`${endpoint}?bounds=${bounds}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'Accept-Version': 'v1',
          'Content-Type': 'application/json',
          'User-Agent': 'AI-Berkeley-2025-ATC-Agent/1.0',
        },
      });

      console.log(`📊 Official API Response:`, {
        status: response.status,
        statusText: response.statusText,
        url: response.url
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Official API Error Details:`, {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        
        // Check for specific error types
        if (response.status === 401) {
          throw new Error(`Authentication failed - check your API key: ${response.status} ${response.statusText}`);
        } else if (response.status === 402) {
          throw new Error(`Insufficient credits - check your subscription: ${response.status} ${response.statusText}`);
        } else if (response.status === 403) {
          throw new Error(`Access forbidden - check your API permissions: ${response.status} ${response.statusText}`);
        } else if (response.status === 429) {
          throw new Error(`Rate limit exceeded - too many requests: ${response.status} ${response.statusText}`);
        } else {
          throw new Error(`Official API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
      }

      const responseText = await response.text();
      console.log(`📊 Raw response preview:`, responseText.substring(0, 200) + '...');
      
      try {
        const data = JSON.parse(responseText);
        console.log(`✅ JSON parsed successfully from Official API`);
        return this.parseOfficialAPIResponse(data);
      } catch (parseError) {
        console.error(`❌ JSON Parse Error:`, parseError);
        console.error(`❌ Raw response:`, responseText.substring(0, 500));
        throw new Error(`Failed to parse JSON response: ${parseError}`);
      }
    } catch (fetchError) {
      console.error(`❌ Fetch Error Details:`, {
        name: (fetchError as Error).name,
        message: (fetchError as Error).message,
        stack: (fetchError as Error).stack
      });
      throw fetchError;
    }
  }

  private parseOfficialAPIResponse(data: any): Aircraft[] {
    const aircraft: Aircraft[] = [];
    
    if (!data) {
      console.log('⚠️ Empty response from official API');
      return aircraft;
    }

    console.log('📊 Official API response structure:', Object.keys(data));
    
    // Handle different possible response formats from the official API
    let flightData = data;
    
    // The official API returns flights in different formats:
    // 1. data.flights array
    // 2. direct array
    // 3. object with flight IDs as keys
    if (data.flights && Array.isArray(data.flights)) {
      flightData = data.flights;
      console.log(`🔄 Processing ${flightData.length} flights from flights array`);
    } else if (data.data && Array.isArray(data.data)) {
      flightData = data.data;
      console.log(`🔄 Processing ${flightData.length} flights from data array`);
    } else if (Array.isArray(data)) {
      flightData = data;
      console.log(`🔄 Processing ${flightData.length} flights from direct array`);
    } else if (typeof data === 'object') {
      console.log(`🔄 Processing object with keys:`, Object.keys(data));
      // Handle object format (flight ID as keys)
      flightData = Object.entries(data).map(([id, flight]) => {
        if (typeof flight === 'object' && flight !== null) {
          return { ...flight, id };
        } else {
          return { id, flight };
        }
      });
    }

    // Parse the flight data
    if (Array.isArray(flightData)) {
      for (const flight of flightData) {
        const aircraft_obj = this.parseFlightFromOfficialAPI(flight);
        if (aircraft_obj) {
          aircraft.push(aircraft_obj);
        }
      }
    }

    console.log(`📊 Parsed ${aircraft.length} aircraft from Official API response`);
    return aircraft;
  }

  private parseFlightFromOfficialAPI(flight: any): Aircraft | null {
    try {
      // Handle different possible field names from official FR24 API
      const lat = parseFloat(flight.lat || flight.latitude || flight.position?.latitude || 0);
      const lng = parseFloat(flight.lng || flight.lon || flight.longitude || flight.position?.longitude || 0);
      const altitude = parseInt(flight.alt || flight.altitude || flight.position?.altitude || 0);
      const speed = parseInt(flight.spd || flight.speed || flight.ground_speed || flight.velocity?.speed || 0);
      const heading = parseInt(flight.hdg || flight.heading || flight.track || flight.velocity?.heading || 0);
      const callsign = (flight.callsign || flight.flight || flight.call_sign || flight.identification?.callsign || '').trim();
      const aircraftId = flight.id || flight.hex || flight.aircraft_id || flight.identification?.id || callsign;

      // Validate required fields
      if (!lat || !lng || lat === 0 || lng === 0) {
        return null;
      }

      // Filter by altitude and bounds
      if (altitude >= AIRCRAFT_CONFIG.MIN_ALTITUDE && 
          lat >= SFO_BOUNDS.south && lat <= SFO_BOUNDS.north &&
          lng >= SFO_BOUNDS.west && lng <= SFO_BOUNDS.east) {
        
        const currentPosition = {
          lat,
          lng,
          timestamp: Date.now(),
          altitude
        };

        // Update flight trail
        this.updateFlightTrail(aircraftId, currentPosition);

        return {
          id: aircraftId,
          callsign: callsign || `AC${aircraftId.toString().substring(0, 4)}`,
          lat,
          lng,
          altitude,
          heading: this.normalizeHeading(heading),
          speed,
          trail: this.flightTrails.get(aircraftId) || [],
          origin: this.estimateOrigin(aircraftId),
          destination: this.estimateDestination(aircraftId),
          lastUpdated: Date.now(),
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error parsing flight data:', error, flight);
      return null;
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