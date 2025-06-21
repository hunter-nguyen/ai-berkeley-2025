'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
}

interface ConflictZone {
  id: string;
  lat: number;
  lng: number;
  radius: number;
  severity: 'low' | 'medium' | 'high';
}

interface RadarMapProps {
  onAircraftSelect: (aircraft: Aircraft) => void;
  selectedAircraft?: Aircraft | null;
}

export default function RadarMap({ onAircraftSelect, selectedAircraft }: RadarMapProps) {
  const [aircraft, setAircraft] = useState<Aircraft[]>([
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
  ]);

  // Simulate aircraft movement
  useEffect(() => {
    const interval = setInterval(() => {
      setAircraft(prevAircraft => 
        prevAircraft.map(plane => {
          // Calculate movement based on heading and speed
          const speedKnots = plane.speed;
          const speedMs = speedKnots * 0.514444; // Convert knots to m/s
          const distanceM = speedMs * 30; // Movement in 30 seconds
          
          // Convert distance to lat/lng (rough approximation)
          const deltaLat = (distanceM * Math.cos(plane.heading * Math.PI / 180)) / 111000;
          const deltaLng = (distanceM * Math.sin(plane.heading * Math.PI / 180)) / (111000 * Math.cos(plane.lat * Math.PI / 180));
          
          return {
            ...plane,
            lat: plane.lat + deltaLat,
            lng: plane.lng + deltaLng,
            // Slight variations in altitude and speed
            altitude: plane.altitude + (Math.random() - 0.5) * 200,
            speed: Math.max(400, Math.min(600, plane.speed + (Math.random() - 0.5) * 20)),
          };
        })
      );
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

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

  // Create custom aircraft icon
  const createAircraftIcon = (isSelected: boolean) => {
    return L.divIcon({
      className: 'custom-aircraft-icon',
      html: `
        <div class="relative">
          <div class="${isSelected ? 'bg-yellow-400 border-yellow-600' : 'bg-cyan-400 border-cyan-600'} 
                      w-4 h-4 rounded-full border-2 shadow-lg"></div>
          <div class="absolute -top-1 -left-1 w-6 h-6 border-2 border-cyan-300 rounded-full animate-ping opacity-40"></div>
          <div class="absolute top-5 left-1/2 transform -translate-x-1/2 text-xs font-mono text-cyan-400 font-bold whitespace-nowrap">
            ${isSelected ? '●' : ''}
          </div>
        </div>
      `,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
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

  return (
    <div className="relative w-full h-full bg-gray-900 overflow-hidden">
      
      <MapContainer
        center={[37.7749, -122.4194]}
        zoom={11}
        className="w-full h-full z-0"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
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
        
        {/* Aircraft Markers */}
        {aircraft.map((plane) => (
          <Marker
            key={plane.id}
            position={[plane.lat, plane.lng]}
            icon={createAircraftIcon(selectedAircraft?.id === plane.id)}
            eventHandlers={{
              click: () => onAircraftSelect(plane),
            }}
          >
            <Popup>
              <div className="text-sm bg-gray-900 text-white p-2 rounded">
                <div className="font-bold text-blue-400">{plane.callsign}</div>
                <div className="font-mono text-xs">ALT: {plane.altitude.toLocaleString()}ft</div>
                <div className="font-mono text-xs">HDG: {plane.heading.toString().padStart(3, '0')}°</div>
                <div className="font-mono text-xs">SPD: {plane.speed}kts</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Controls Overlay */}
      <div className="absolute top-4 left-4 z-20 bg-gray-900 bg-opacity-90 border border-green-500 rounded-lg p-3 shadow-lg">
        <div className="text-xs font-mono text-green-400">
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>RADAR: ACTIVE</span>
          </div>
          <div>RANGE: 50NM</div>
          <div>SCOPE: SFO</div>
          <div>A/C: {aircraft.length}</div>
        </div>
      </div>

      {/* Range Rings Overlay */}
      <div className="absolute top-4 right-4 z-20 bg-gray-900 bg-opacity-90 border border-blue-500 rounded-lg p-3 shadow-lg">
        <div className="text-xs font-mono text-blue-400">
          <div>ZOOM: {11}</div>
          <div>LAT: 37.7749</div>
          <div>LNG: -122.4194</div>
          <div className="mt-2 text-yellow-400">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span>CONFLICT: {conflictZones.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 