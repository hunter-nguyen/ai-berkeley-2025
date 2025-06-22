'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { AdjustmentsHorizontalIcon, BellIcon } from '@heroicons/react/24/outline';
import ATCStatusBar from './ATCStatusBar';
import FlightDetails from './FlightDetails';
import LiveComms from './LiveComms';
import AlertsAndTasks from './AlertsAndTasks';
import '@/utils/aircraftConfig'; // Import for console utilities
import { debugAircraft } from '@/utils/debug-aircraft';

// Dynamic import for Leaflet to avoid SSR issues
const DynamicRadarMap = dynamic(() => import('./RadarMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-900">
      <div className="text-white font-mono text-sm">RADAR INITIALIZING...</div>
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

interface CommMessage {
  id: string;
  timestamp: string;
  callsign: string;
  message: string;
  isUrgent: boolean;
  type: 'incoming' | 'outgoing' | 'atc_analysis';
  rawTranscript?: string;
  instructions?: string[];
  runways?: string[];
  chunk?: number;
}

export default function MaydayDashboard() {
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [selectedCallsign, setSelectedCallsign] = useState<string | null>(null);
  const [isFlightDetailsOpen, setIsFlightDetailsOpen] = useState(false);
  const [aircraftCount, setAircraftCount] = useState(0);
  const [messages, setMessages] = useState<CommMessage[]>([]);
  
  // Auto-collapse states - only for emergency alerts now
  const [criticalAlertsCount, setCriticalAlertsCount] = useState(1); // Simulate critical alerts
  const [showFilters, setShowFilters] = useState(false);
  
  // Panel visibility - LiveComms always visible, only emergency alerts auto-collapse
  const [showEmergencyAlerts, setShowEmergencyAlerts] = useState(false);
  
  // Auto-collapse logic - only for emergency alerts
  useEffect(() => {
    // Auto-show Emergency panel only when critical alerts exist
    setShowEmergencyAlerts(criticalAlertsCount > 0);
  }, [criticalAlertsCount]);

  const handleAircraftSelect = useCallback((aircraft: Aircraft) => {
    setSelectedAircraft(aircraft);
    setSelectedCallsign(aircraft.callsign);
    setIsFlightDetailsOpen(true);
  }, []);

  const handleCallsignSelect = useCallback((callsign: string) => {
    setSelectedCallsign(callsign);
    console.log(`Selected callsign from LiveComms: ${callsign}`);
  }, []);

  const handleCloseFlightDetails = useCallback(() => {
    setIsFlightDetailsOpen(false);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedAircraft(null);
    setSelectedCallsign(null);
    setIsFlightDetailsOpen(false);
  }, []);

  const handleAircraftUpdate = useCallback((count: number) => {
    setAircraftCount(count);
  }, []);

  const handleMapClick = useCallback(() => {
    // Deselect aircraft when clicking on empty map space
    setSelectedAircraft(null);
    setSelectedCallsign(null);
    setIsFlightDetailsOpen(false);
  }, []);

  const handleMessagesUpdate = useCallback((updatedMessages: CommMessage[]) => {
    setMessages(updatedMessages);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 overflow-hidden">
      {/* ATC Status Bar */}
      <ATCStatusBar 
        aircraftCount={aircraftCount} 
        selectedCallsign={selectedCallsign}
        onClearSelection={handleClearSelection}
      />
      
      {/* Main Content Area */}
      <div className="h-[calc(100vh-60px)] flex relative">
        {/* Full-Width Map Background */}
        <div className="absolute inset-0">
          <DynamicRadarMap
            onAircraftSelect={handleAircraftSelect}
            selectedAircraft={selectedAircraft}
            onAircraftUpdate={handleAircraftUpdate}
            selectedCallsign={selectedCallsign}
            onMapClick={handleMapClick}
          />
        </div>

        {/* Left Side - Filters Toggle */}
        <AnimatePresence>
          {!showFilters && (
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              className="absolute left-3 top-3 z-20"
            >
              <button
                onClick={() => setShowFilters(true)}
                className="bg-black/80 text-white p-2 rounded-lg hover:bg-black/90 transition-colors border border-gray-600"
                title="Show filters & layers"
              >
                <AdjustmentsHorizontalIcon className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters Panel - Only when toggled */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="absolute left-0 top-0 bottom-0 w-64 bg-black/90 backdrop-blur-sm border-r border-gray-700 z-20 p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-mono text-sm font-bold">LAYERS & FILTERS</h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="text-gray-300">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span>Aircraft Traffic</span>
                  </label>
                </div>
                <div className="text-gray-300">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span>Alert Zones</span>
                  </label>
                </div>
                <div className="text-gray-300">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" className="rounded" />
                    <span>Weather Layers</span>
                  </label>
                </div>
                <div className="text-gray-300">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" className="rounded" />
                    <span>Airspace Sectors</span>
                  </label>
                </div>
                <div className="text-gray-300">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" className="rounded" />
                    <span>Waypoints</span>
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Side - Always Visible LiveComms + Auto-Collapsing Emergency Alerts */}
        <div className="absolute right-0 top-0 bottom-0 w-80 p-3 space-y-2 z-10">
          
          {/* Emergency Alerts - Only show when critical */}
          <AnimatePresence>
            {showEmergencyAlerts && (
              <motion.div
                initial={{ x: 320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 320, opacity: 0 }}
                className="h-1/2"
              >
                <AlertsAndTasks 
                  isCollapsed={false}
                  onToggle={() => setShowEmergencyAlerts(!showEmergencyAlerts)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* LiveComms - Always Visible */}
          <div className={showEmergencyAlerts ? "h-1/2" : "h-2/3"}>
            <LiveComms 
              isCollapsed={false}
              onToggle={() => {}} // No toggle needed since always visible
              selectedCallsign={selectedCallsign}
              onCallsignSelect={handleCallsignSelect}
              onMessagesUpdate={handleMessagesUpdate}
            />
          </div>

          {/* Floating Action Button - Only for Emergency Alerts */}
          <div className="absolute bottom-4 right-4 space-y-2">
            {!showEmergencyAlerts && criticalAlertsCount > 0 && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.1 }}
                onClick={() => setShowEmergencyAlerts(true)}
                className="bg-red-600 text-white p-3 rounded-full shadow-lg hover:bg-red-700 transition-colors relative"
              >
                <BellIcon className="w-6 h-6" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {criticalAlertsCount}
                </span>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Flight Details - Overlay */}
      <FlightDetails 
        aircraft={selectedAircraft}
        isOpen={isFlightDetailsOpen}
        onClose={handleCloseFlightDetails}
        messages={messages}
      />

      {/* Mobile Notice */}
      <div className="lg:hidden fixed inset-0 bg-gray-900 bg-opacity-95 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-sm mx-4">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Desktop Required</h2>
          <p className="text-gray-700 leading-relaxed">
            The ATC Dashboard requires a desktop display for optimal controller workflow.
          </p>
        </div>
      </div>
    </div>
  );
} 