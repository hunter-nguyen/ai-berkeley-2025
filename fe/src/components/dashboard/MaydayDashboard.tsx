'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import ATCStatusBar from './ATCStatusBar';
import RadarMap from './RadarMap';
import FlightDetails from './FlightDetails';
import LiveComms from './LiveComms';
import AlertsAndTasks from './AlertsAndTasks';

// Dynamic import for Leaflet to avoid SSR issues
const DynamicRadarMap = dynamic(() => import('./RadarMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-900 rounded-lg">
      <div className="text-white font-mono">RADAR INITIALIZING...</div>
    </div>
  ),
});

interface Aircraft {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number;
  heading: number;
  speed: number;
}

export default function MaydayDashboard() {
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [selectedCallsign, setSelectedCallsign] = useState<string | null>(null);
  const [isFlightDetailsOpen, setIsFlightDetailsOpen] = useState(false);
  const [isLiveCommsCollapsed, setIsLiveCommsCollapsed] = useState(false);
  const [isAlertsCollapsed, setIsAlertsCollapsed] = useState(false);
  const [aircraftCount, setAircraftCount] = useState(0);

  const handleAircraftSelect = (aircraft: Aircraft) => {
    setSelectedAircraft(aircraft);
    setSelectedCallsign(aircraft.callsign);
    setIsFlightDetailsOpen(true);
    
    // Auto-expand LiveComms when aircraft is selected to show chat history
    if (isLiveCommsCollapsed) {
      setIsLiveCommsCollapsed(false);
    }
  };

  const handleCallsignSelect = (callsign: string) => {
    setSelectedCallsign(callsign);
    
    // Try to find and highlight the aircraft on the radar map
    // Note: This would need access to the aircraft list from RadarMap
    // For now, we'll just store the selected callsign
    console.log(`Selected callsign from LiveComms: ${callsign}`);
  };

  const handleCloseFlightDetails = () => {
    setIsFlightDetailsOpen(false);
    // Keep the aircraft/callsign selected for LiveComms filtering
    // setSelectedAircraft(null);
    // setSelectedCallsign(null);
  };

  const handleClearSelection = () => {
    setSelectedAircraft(null);
    setSelectedCallsign(null);
    setIsFlightDetailsOpen(false);
  };

  const handleAircraftUpdate = (count: number) => {
    setAircraftCount(count);
  };

  return (
    <div className="min-h-screen bg-gray-900 overflow-hidden">
      {/* ATC Status Bar */}
      <ATCStatusBar 
        aircraftCount={aircraftCount} 
        selectedCallsign={selectedCallsign}
        onClearSelection={handleClearSelection}
      />
      
      {/* Main Content Area */}
      <div className="h-[calc(100vh-60px)] flex">
        {/* Background Map Container - Full Width */}
        <div className="absolute inset-0 top-16 bottom-0">
          <DynamicRadarMap 
            onAircraftSelect={handleAircraftSelect}
            selectedAircraft={selectedAircraft}
            onAircraftUpdate={handleAircraftUpdate}
            selectedCallsign={selectedCallsign}
          />
        </div>

        {/* Right Sidebar - Fixed Position */}
        <div className="relative z-10 ml-auto w-80 p-3 space-y-3 h-full overflow-hidden">
          <div className="h-1/2">
            <LiveComms 
              isCollapsed={isLiveCommsCollapsed}
              onToggle={() => setIsLiveCommsCollapsed(!isLiveCommsCollapsed)}
              selectedCallsign={selectedCallsign}
              onCallsignSelect={handleCallsignSelect}
            />
          </div>
          <div className="h-1/2">
            <AlertsAndTasks 
              isCollapsed={isAlertsCollapsed}
              onToggle={() => setIsAlertsCollapsed(!isAlertsCollapsed)}
            />
          </div>
        </div>
      </div>

      {/* Left Sidebar - Flight Details (Overlay) */}
      <FlightDetails 
        aircraft={selectedAircraft}
        isOpen={isFlightDetailsOpen}
        onClose={handleCloseFlightDetails}
      />

      {/* Mobile Responsiveness Notice */}
      <div className="lg:hidden fixed inset-0 bg-gray-900 bg-opacity-95 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-sm mx-4">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Desktop Required</h2>
          <p className="text-gray-700 leading-relaxed">
            The Mayday ATC Dashboard is optimized for desktop and large tablet displays. 
            Please use a device with at least 1024px screen width for the best experience.
          </p>
        </div>
      </div>
    </div>
  );
} 