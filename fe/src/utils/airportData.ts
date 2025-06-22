export interface AirportData {
  id: string;
  timestamp: string;
  callsign: string;
  message: string;
  isUrgent: boolean;
  type: string;
  rawTranscript: string;
  airport_data: {
    icaoId: string;
    temp: number;
    dewp: number;
    wdir: number;
    wspd: number;
    wgst: number | null;
    visib: string;
    wxString: string | null;
    clouds: Array<{
      cover: string;
      base: number | null;
    }>;
    name: string;
  };
}

export async function loadAirportData(): Promise<AirportData | null> {
  try {
    const response = await fetch('/airport.json');
    const data: AirportData[] = await response.json();
    return data[0] || null; // Return first (most recent) entry
  } catch (error) {
    console.error('Failed to load airport data:', error);
    return null;
  }
}

export function formatWindDisplay(wdir: number, wspd: number, wgst?: number | null): string {
  const windDir = wdir.toString().padStart(3, '0');
  if (wgst && wgst > wspd) {
    return `${windDir}/${wspd}G${wgst}`;
  }
  return `${windDir}/${wspd}`;
}

export function formatTemperature(temp: number): string {
  return `${temp.toFixed(1)}°C`;
}

export function formatClouds(clouds: Array<{ cover: string; base: number | null }>): string {
  if (!clouds || clouds.length === 0) return 'UNK';
  const firstCloud = clouds[0];
  if (firstCloud.cover === 'CLR') return 'CLR';
  if (firstCloud.base) {
    return `${firstCloud.cover}${Math.round(firstCloud.base / 100).toString().padStart(3, '0')}`;
  }
  return firstCloud.cover;
} 