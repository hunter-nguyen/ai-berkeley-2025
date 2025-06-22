'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { AdjustmentsHorizontalIcon, BellIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import ATCStatusBar from './ATCStatusBar';
import FlightDetails from './FlightDetails';
import LiveComms from './LiveComms';
import AlertsAndTasks from './AlertsAndTasks';
import ShiftHandover from './ShiftHandover';
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
  
  // Right panel tab management
  const [activeRightTab, setActiveRightTab] = useState<'comms' | 'shift'>('comms');
  
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

  const handleMicrophoneTranscript = useCallback(async (transcript: string, isEmergency: boolean) => {
    try {
      console.log('🎤 Processing microphone transcript:', transcript);
      
      // Send transcript to processing API
      const response = await fetch('/api/process-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          isEmergency
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('📋 Transcript processed:', result);
        
        // Handle aircraft selection from transcript
        if (result.aircraft_mentioned && result.aircraft_mentioned !== 'UNKNOWN') {
          console.log('✈️ Aircraft mentioned in transcript:', result.aircraft_mentioned);
          
          // Trigger aircraft selection and highlighting
          handleAircraftFromTranscript(result.aircraft_mentioned, isEmergency);
        }
        
        if (result.emergency_created) {
          // Show notification based on alert category
          const toast = document.createElement('div');
          
          let bgColor = 'bg-red-600/95';
          let borderColor = 'border-red-500/60';
          let icon = '🚨';
          let title = 'EMERGENCY DETECTED';
          let message = 'Check alerts panel for dispatch options';
          
          if (result.category === 'WARNING') {
            bgColor = 'bg-orange-600/95';
            borderColor = 'border-orange-500/60';
            icon = '⚠️';
            title = 'WARNING ALERT';
            message = 'Situation requires monitoring';
          } else if (result.category === 'REPORT') {
            bgColor = 'bg-blue-600/95';
            borderColor = 'border-blue-500/60';
            icon = '📋';
            title = 'REPORT LOGGED';
            message = 'Information recorded for awareness';
          }
          
          toast.className = `fixed top-4 left-1/2 transform -translate-x-1/2 ${bgColor} backdrop-blur-sm text-white px-6 py-4 rounded-lg font-mono text-sm z-[9999] shadow-2xl border ${borderColor} max-w-sm`;
          toast.innerHTML = `
            <div class="flex items-center space-x-3 mb-2">
              <span class="text-lg">${icon}</span>
              <div class="font-bold tracking-wide">${title}</div>
            </div>
            <div class="text-xs leading-relaxed opacity-90">
              <div class="font-semibold">${result.callsign} - ${result.emergency_type.replace('_', ' ').toUpperCase()}</div>
              <div class="mt-1">${message}</div>
            </div>
          `;
          document.body.appendChild(toast);
          
          // Add entrance animation
          toast.style.transform = 'translate(-50%, -20px)';
          toast.style.opacity = '0';
          setTimeout(() => {
            toast.style.transition = 'all 0.3s ease-out';
            toast.style.transform = 'translate(-50%, 0)';
            toast.style.opacity = '1';
          }, 10);
          
          setTimeout(() => {
            if (document.body.contains(toast)) {
              toast.style.transition = 'all 0.3s ease-in';
              toast.style.transform = 'translate(-50%, -20px)';
              toast.style.opacity = '0';
              setTimeout(() => {
                if (document.body.contains(toast)) {
                  document.body.removeChild(toast);
                }
              }, 300);
            }
          }, result.category === 'EMERGENCY' ? 5000 : 3000);
        } else if (result.aircraft_mentioned && result.aircraft_mentioned !== 'UNKNOWN') {
          // Show aircraft selection notification for non-emergency mentions
          const toast = document.createElement('div');
          toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600/95 backdrop-blur-sm text-white px-6 py-3 rounded-lg font-mono text-sm z-[9999] shadow-xl border border-blue-500/60';
          toast.innerHTML = `
            <div class="flex items-center space-x-3">
              <span class="text-lg">✈️</span>
              <div>
                <div class="font-bold">AIRCRAFT SELECTED</div>
                <div class="text-xs opacity-90 mt-1">
                  ${result.aircraft_mentioned} - Selected from transcript
                </div>
              </div>
            </div>
          `;
          document.body.appendChild(toast);
          
          // Add entrance animation
          toast.style.transform = 'translate(-50%, -20px)';
          toast.style.opacity = '0';
          setTimeout(() => {
            toast.style.transition = 'all 0.3s ease-out';
            toast.style.transform = 'translate(-50%, 0)';
            toast.style.opacity = '1';
          }, 10);
          
          setTimeout(() => {
            if (document.body.contains(toast)) {
              toast.style.transition = 'all 0.3s ease-in';
              toast.style.transform = 'translate(-50%, -20px)';
              toast.style.opacity = '0';
              setTimeout(() => {
                if (document.body.contains(toast)) {
                  document.body.removeChild(toast);
                }
              }, 300);
            }
          }, 3000);
        }
      }
    } catch (error) {
      console.error('❌ Error processing microphone transcript:', error);
    }
  }, []);

  const handleAircraftFromTranscript = useCallback((callsign: string, isEmergency: boolean) => {
    console.log('🎯 Looking for aircraft:', callsign, 'Emergency:', isEmergency);
    
    // Set the callsign for aircraft matching
    setSelectedCallsign(callsign);
    
    // Store emergency status for radar highlighting
    if (isEmergency) {
      // Add to emergency aircraft list (we'll create this)
      window.dispatchEvent(new CustomEvent('emergency-aircraft', {
        detail: { callsign, isEmergency: true }
      }));
    }
    
    // The RadarMap will handle the actual aircraft selection and zoom
    window.dispatchEvent(new CustomEvent('select-aircraft', {
      detail: { callsign, isEmergency }
    }));
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

        {/* Left Side - Enhanced Filters Toggle */}
        <AnimatePresence>
          {!showFilters && (
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              className="absolute left-4 top-4 z-20"
            >
              {/* Enhanced Filters Toggle */}
              <button
                onClick={() => setShowFilters(true)}
                className="bg-gray-900/90 backdrop-blur-sm text-white p-3 rounded-lg hover:bg-gray-800/90 transition-all duration-200 border border-gray-600/60 shadow-lg group"
                title="Show radar layers & filters"
              >
                <AdjustmentsHorizontalIcon className="w-5 h-5 group-hover:text-blue-400 transition-colors" />
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
              className="absolute left-0 top-0 bottom-0 w-72 bg-gray-900/95 backdrop-blur-sm border-r border-gray-600/60 z-20 p-4 shadow-xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-white font-mono text-sm font-bold tracking-wide">RADAR LAYERS & FILTERS</h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700/50 transition-all duration-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="border-b border-gray-700/50 pb-4">
                  <h4 className="text-gray-300 font-mono text-xs font-semibold mb-3 uppercase tracking-wider">Traffic Display</h4>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3 text-sm text-gray-300 hover:text-white cursor-pointer transition-colors">
                      <input type="checkbox" defaultChecked className="rounded text-blue-500 focus:ring-blue-500 focus:ring-2" />
                      <span>Aircraft Traffic</span>
                    </label>
                    <label className="flex items-center space-x-3 text-sm text-gray-300 hover:text-white cursor-pointer transition-colors">
                      <input type="checkbox" defaultChecked className="rounded text-blue-500 focus:ring-blue-500 focus:ring-2" />
                      <span>Flight Trails</span>
                    </label>
                  </div>
                </div>
                
                <div className="border-b border-gray-700/50 pb-4">
                  <h4 className="text-gray-300 font-mono text-xs font-semibold mb-3 uppercase tracking-wider">Airspace</h4>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3 text-sm text-gray-300 hover:text-white cursor-pointer transition-colors">
                      <input type="checkbox" defaultChecked className="rounded text-green-500 focus:ring-green-500 focus:ring-2" />
                      <span>Control Zones</span>
                    </label>
                    <label className="flex items-center space-x-3 text-sm text-gray-300 hover:text-white cursor-pointer transition-colors">
                      <input type="checkbox" defaultChecked className="rounded text-green-500 focus:ring-green-500 focus:ring-2" />
                      <span>Sector Boundaries</span>
                    </label>
                    <label className="flex items-center space-x-3 text-sm text-gray-300 hover:text-white cursor-pointer transition-colors">
                      <input type="checkbox" className="rounded text-green-500 focus:ring-green-500 focus:ring-2" />
                      <span>Waypoints</span>
                    </label>
                  </div>
                </div>
                
                <div className="border-b border-gray-700/50 pb-4">
                  <h4 className="text-gray-300 font-mono text-xs font-semibold mb-3 uppercase tracking-wider">Weather & Safety</h4>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3 text-sm text-gray-300 hover:text-white cursor-pointer transition-colors">
                      <input type="checkbox" className="rounded text-yellow-500 focus:ring-yellow-500 focus:ring-2" />
                      <span>Weather Layers</span>
                    </label>
                    <label className="flex items-center space-x-3 text-sm text-gray-300 hover:text-white cursor-pointer transition-colors">
                      <input type="checkbox" defaultChecked className="rounded text-red-500 focus:ring-red-500 focus:ring-2" />
                      <span>TFRs & NOTAMs</span>
                    </label>
                    <label className="flex items-center space-x-3 text-sm text-gray-300 hover:text-white cursor-pointer transition-colors">
                      <input type="checkbox" defaultChecked className="rounded text-orange-500 focus:ring-orange-500 focus:ring-2" />
                      <span>Alert Zones</span>
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Side - Tabbed Interface for Communications and Shift Handover */}
        <div className="absolute right-0 top-0 bottom-0 w-80 p-3 space-y-2 z-10">
          
          {/* Tab Headers */}
          <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg border border-gray-600/60 p-1 flex space-x-1">
            <button
              onClick={() => setActiveRightTab('comms')}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
                activeRightTab === 'comms'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <BellIcon className="w-4 h-4" />
              <span>Comms</span>
            </button>
            <button
              onClick={() => setActiveRightTab('shift')}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
                activeRightTab === 'shift'
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <UserGroupIcon className="w-4 h-4" />
              <span>Shift</span>
            </button>
          </div>

          {/* Tab Content */}
          {activeRightTab === 'comms' && (
            <>
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

              {/* LiveComms with Microphone Tab - Always Visible */}
              <div className={showEmergencyAlerts ? "h-1/2" : "h-[calc(100%-60px)]"}>
                <LiveComms 
                  isCollapsed={false}
                  onToggle={() => {}} // No toggle needed since always visible
                  selectedCallsign={selectedCallsign}
                  onCallsignSelect={handleCallsignSelect}
                  onMessagesUpdate={handleMessagesUpdate}
                  onMicrophoneTranscript={handleMicrophoneTranscript}
                />
              </div>
            </>
          )}

          {activeRightTab === 'shift' && (
            <div className="h-[calc(100%-60px)]">
              <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg border border-gray-600/60 h-full overflow-hidden">
                <div className="h-full overflow-y-auto p-1">
                  <ShiftHandover />
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Floating Action Button - Only for Emergency Alerts when on comms tab */}
          {activeRightTab === 'comms' && (
            <div className="absolute bottom-4 right-4 space-y-2">
              {!showEmergencyAlerts && criticalAlertsCount > 0 && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowEmergencyAlerts(true)}
                  className="relative bg-red-600/90 backdrop-blur-sm text-white p-4 rounded-full shadow-2xl hover:bg-red-500/90 transition-all duration-300 border border-red-500/50 group"
                >
                  {/* Pulsing glow effect for critical alerts */}
                  <div className="absolute inset-0 rounded-full bg-red-500/30 animate-ping"></div>
                  <div className="absolute inset-0 rounded-full bg-red-500/20 animate-pulse"></div>
                  
                  <BellIcon className="w-6 h-6 relative z-10 group-hover:animate-bounce" />
                  
                  {/* Enhanced badge */}
                  <motion.span 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute -top-2 -right-2 bg-white text-red-600 text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-red-600"
                  >
                    {criticalAlertsCount}
                  </motion.span>
                </motion.button>
              )}
            </div>
          )}
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