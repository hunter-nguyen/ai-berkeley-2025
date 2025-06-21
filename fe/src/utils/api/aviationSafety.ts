interface TFR {
  id: string;
  notamId: string;
  type: 'security' | 'disaster' | 'sporting' | 'other';
  status: 'active' | 'expired' | 'scheduled';
  coordinates: [number, number][];
  center: { lat: number; lng: number };
  radius: number; // meters
  altitudeLow: number; // feet
  altitudeHigh: number; // feet
  effectiveStart: string;
  effectiveEnd: string;
  description: string;
  reason: string;
  controllingAgency: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface NOTAM {
  id: string;
  type: 'airport' | 'airspace' | 'navigation' | 'procedure' | 'other';
  location: string; // ICAO code
  coordinates?: { lat: number; lng: number };
  subject: string;
  condition: string;
  effectiveStart: string;
  effectiveEnd?: string;
  severity: 'info' | 'caution' | 'warning' | 'critical';
  affectedFacility: string;
  description: string;
  source: 'faa' | 'aviationweather';
}

interface SIGMET {
  id: string;
  type: 'convective' | 'non-convective' | 'international';
  phenomenon: 'thunderstorm' | 'turbulence' | 'icing' | 'mountain_wave' | 'dust' | 'volcanic_ash';
  coordinates: [number, number][];
  flightLevels: string;
  validFrom: string;
  validTo: string;
  intensity: 'light' | 'moderate' | 'severe' | 'extreme';
  movement: string;
  description: string;
  fir: string; // Flight Information Region
}

class AviationSafetyService {
  private tfrs: TFR[] = [];
  private notams: NOTAM[] = [];
  private sigmets: SIGMET[] = [];
  private lastTFRUpdate = 0;
  private lastNOTAMUpdate = 0;
  private lastSIGMETUpdate = 0;
  private cacheTimeout = 300000; // 5 minutes

  // Mock TFR data for demonstration
  private getMockTFRs(): TFR[] {
    return [
      {
        id: 'TFR-001',
        notamId: '4/0825',
        type: 'security',
        status: 'active',
        coordinates: [
          [37.7849, -122.4094],
          [37.7949, -122.3994],
          [37.7749, -122.3994],
          [37.7649, -122.4094]
        ],
        center: { lat: 37.7849, lng: -122.4094 },
        radius: 5556, // 3 NM in meters
        altitudeLow: 0,
        altitudeHigh: 18000,
        effectiveStart: new Date().toISOString(),
        effectiveEnd: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        description: 'VIP Movement - Downtown San Francisco',
        reason: 'Temporary flight restriction for VIP movement',
        controllingAgency: 'FAA',
        severity: 'high'
      },
      {
        id: 'TFR-002',
        notamId: '4/0826',
        type: 'disaster',
        status: 'active',
        coordinates: [
          [37.6849, -122.5094],
          [37.6949, -122.4994],
          [37.6749, -122.4994],
          [37.6649, -122.5094]
        ],
        center: { lat: 37.6849, lng: -122.5094 },
        radius: 9260, // 5 NM in meters
        altitudeLow: 0,
        altitudeHigh: 8000,
        effectiveStart: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        effectiveEnd: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        description: 'Fire Suppression Operations',
        reason: 'Temporary flight restriction for firefighting aircraft',
        controllingAgency: 'CAL FIRE',
        severity: 'critical'
      }
    ];
  }

  // Mock NOTAM data for demonstration
  private getMockNOTAMs(): NOTAM[] {
    return [
      {
        id: 'NOTAM-SFO-001',
        type: 'airport',
        location: 'KSFO',
        coordinates: { lat: 37.6213, lng: -122.3790 },
        subject: 'Runway 28L Closure',
        condition: 'Runway 28L closed for maintenance',
        effectiveStart: new Date().toISOString(),
        effectiveEnd: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        severity: 'warning',
        affectedFacility: 'SFO Runway 28L',
        description: 'Runway 28L closed for routine maintenance operations. Use alternate runways.',
        source: 'faa'
      },
      {
        id: 'NOTAM-OAK-001',
        type: 'navigation',
        location: 'KOAK',
        coordinates: { lat: 37.7214, lng: -122.2208 },
        subject: 'ILS 29 Out of Service',
        condition: 'ILS approach system unavailable',
        effectiveStart: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        effectiveEnd: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        severity: 'caution',
        affectedFacility: 'Oakland ILS RWY 29',
        description: 'ILS approach system for runway 29 is out of service for equipment repairs.',
        source: 'faa'
      },
      {
        id: 'NOTAM-BAY-001',
        type: 'airspace',
        location: 'KSFO',
        coordinates: { lat: 37.7749, lng: -122.4194 },
        subject: 'Bay Area Airspace Advisory',
        condition: 'Increased traffic due to weather',
        effectiveStart: new Date().toISOString(),
        severity: 'info',
        affectedFacility: 'San Francisco Bay Area',
        description: 'Increased traffic volume expected due to weather conditions at other major airports.',
        source: 'faa'
      }
    ];
  }

  // Mock SIGMET data for demonstration
  private getMockSIGMETs(): SIGMET[] {
    return [
      {
        id: 'SIGMET-KZOA-001',
        type: 'convective',
        phenomenon: 'thunderstorm',
        coordinates: [
          [37.9, -122.8],
          [37.9, -121.8],
          [37.5, -121.8],
          [37.5, -122.8]
        ],
        flightLevels: 'SFC/FL450',
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        intensity: 'moderate',
        movement: 'MOVING E 25KT',
        description: 'Occasional moderate to severe thunderstorms. Tops FL450.',
        fir: 'KZOA'
      }
    ];
  }

  // Fetch TFR data from FAA (mock implementation)
  private async fetchTFRData(): Promise<TFR[]> {
    try {
      // In production, this would call FAA TFR API
      // const response = await fetch('https://tfr.faa.gov/api/tfrs');
      
      // For now, return mock data
      return this.getMockTFRs();
    } catch (error) {
      console.warn('Failed to fetch TFR data, using mock data:', error);
      return this.getMockTFRs();
    }
  }

  // Fetch NOTAM data from Aviation Weather API
  private async fetchNOTAMData(): Promise<NOTAM[]> {
    try {
      // In production, this would call Aviation Weather API
      // const response = await fetch('https://aviationweather.gov/api/data/notam');
      
      // For now, return mock data
      return this.getMockNOTAMs();
    } catch (error) {
      console.warn('Failed to fetch NOTAM data, using mock data:', error);
      return this.getMockNOTAMs();
    }
  }

  // Fetch SIGMET data from Aviation Weather API
  private async fetchSIGMETData(): Promise<SIGMET[]> {
    try {
      // In production, this would call Aviation Weather API
      // const response = await fetch('https://aviationweather.gov/api/data/airsigmet');
      
      // For now, return mock data
      return this.getMockSIGMETs();
    } catch (error) {
      console.warn('Failed to fetch SIGMET data, using mock data:', error);
      return this.getMockSIGMETs();
    }
  }

  // Get active TFRs in the Bay Area
  async getActiveTFRs(): Promise<TFR[]> {
    const now = Date.now();
    if (now - this.lastTFRUpdate > this.cacheTimeout) {
      this.tfrs = await this.fetchTFRData();
      this.lastTFRUpdate = now;
    }
    
    // Filter to only active TFRs
    const currentTime = new Date().toISOString();
    return this.tfrs.filter(tfr => 
      tfr.status === 'active' && 
      tfr.effectiveStart <= currentTime && 
      (!tfr.effectiveEnd || tfr.effectiveEnd > currentTime)
    );
  }

  // Get current NOTAMs for Bay Area airports
  async getCurrentNOTAMs(): Promise<NOTAM[]> {
    const now = Date.now();
    if (now - this.lastNOTAMUpdate > this.cacheTimeout) {
      this.notams = await this.fetchNOTAMData();
      this.lastNOTAMUpdate = now;
    }
    
    // Filter to only current NOTAMs
    const currentTime = new Date().toISOString();
    return this.notams.filter(notam => 
      notam.effectiveStart <= currentTime && 
      (!notam.effectiveEnd || notam.effectiveEnd > currentTime)
    );
  }

  // Get active SIGMETs for the area
  async getActiveSIGMETs(): Promise<SIGMET[]> {
    const now = Date.now();
    if (now - this.lastSIGMETUpdate > this.cacheTimeout) {
      this.sigmets = await this.fetchSIGMETData();
      this.lastSIGMETUpdate = now;
    }
    
    // Filter to only valid SIGMETs
    const currentTime = new Date().toISOString();
    return this.sigmets.filter(sigmet => 
      sigmet.validFrom <= currentTime && 
      sigmet.validTo > currentTime
    );
  }

  // Get TFR color based on severity and type
  getTFRColor(tfr: TFR): string {
    switch (tfr.severity) {
      case 'critical': return '#dc2626'; // Red
      case 'high': return '#ea580c'; // Orange-red
      case 'medium': return '#f59e0b'; // Orange
      case 'low': return '#eab308'; // Yellow
      default: return '#6b7280'; // Gray
    }
  }

  // Get NOTAM color based on severity
  getNOTAMColor(notam: NOTAM): string {
    switch (notam.severity) {
      case 'critical': return '#dc2626'; // Red
      case 'warning': return '#f59e0b'; // Orange
      case 'caution': return '#eab308'; // Yellow
      case 'info': return '#3b82f6'; // Blue
      default: return '#6b7280'; // Gray
    }
  }

  // Force refresh all data
  async forceRefresh(): Promise<{ tfrs: TFR[]; notams: NOTAM[]; sigmets: SIGMET[] }> {
    this.lastTFRUpdate = 0;
    this.lastNOTAMUpdate = 0;
    this.lastSIGMETUpdate = 0;
    
    const [tfrs, notams, sigmets] = await Promise.all([
      this.getActiveTFRs(),
      this.getCurrentNOTAMs(),
      this.getActiveSIGMETs()
    ]);
    
    return { tfrs, notams, sigmets };
  }
}

export const aviationSafety = new AviationSafetyService();
export type { TFR, NOTAM, SIGMET }; 