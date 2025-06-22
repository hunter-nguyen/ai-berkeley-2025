'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';

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

interface FlightDetailsProps {
  aircraft: Aircraft | null;
  isOpen: boolean;
  onClose: () => void;
  messages?: CommMessage[];
}

export default function FlightDetails({ aircraft, isOpen, onClose, messages = [] }: FlightDetailsProps) {
  // Filter messages for the selected aircraft
  const filteredMessages = aircraft && messages ? messages.filter(msg => {
    const callsign = msg.callsign || '';
    const message = msg.message || '';
    const aircraftCallsign = aircraft.callsign || '';
    
    return callsign.toLowerCase().includes(aircraftCallsign.toLowerCase()) ||
           message.toLowerCase().includes(aircraftCallsign.toLowerCase());
  }).slice(-10) : []; // Show last 10 messages

  return (
    <AnimatePresence>
      {isOpen && aircraft && (
        <motion.div
          initial={{ x: -320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -320, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed left-4 top-20 bottom-4 w-72 bg-gray-900 border border-blue-500 rounded-lg shadow-2xl p-3 z-30 overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3 border-b border-gray-700 pb-2 flex-shrink-0">
            <h2 className="text-lg font-bold text-blue-400 font-mono">FLIGHT DATA</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Callsign Header */}
          <div className="bg-blue-900 bg-opacity-50 border border-blue-600 rounded p-3 mb-3 flex-shrink-0">
            <div className="text-xl font-bold text-blue-300 font-mono">{aircraft.callsign}</div>
            <div className="text-xs text-blue-400">COMMERCIAL AIRCRAFT</div>
            <div className="text-xs text-green-400 mt-1">● ACTIVE TRACKING</div>
          </div>

          {/* Live Data Fields */}
          <div className="space-y-2 mb-3 flex-shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-800 border border-gray-600 rounded p-2">
                <div className="text-xs text-gray-400 uppercase tracking-wide font-mono">ALT</div>
                <div className="text-sm font-mono font-bold text-green-400">
                  {aircraft.altitude.toLocaleString()}ft
                </div>
              </div>
              <div className="bg-gray-800 border border-gray-600 rounded p-2">
                <div className="text-xs text-gray-400 uppercase tracking-wide font-mono">SPD</div>
                <div className="text-sm font-mono font-bold text-green-400">
                  {aircraft.speed}kts
                </div>
              </div>
            </div>
            <div className="bg-gray-800 border border-gray-600 rounded p-2">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-mono">HDG</div>
              <div className="text-sm font-mono font-bold text-green-400">
                {aircraft.heading.toString().padStart(3, '0')}°
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-800 border border-gray-600 rounded p-2">
                <div className="text-xs text-gray-400 uppercase tracking-wide font-mono">LAT</div>
                <div className="text-xs font-mono text-white">
                  {aircraft.lat.toFixed(4)}
                </div>
              </div>
              <div className="bg-gray-800 border border-gray-600 rounded p-2">
                <div className="text-xs text-gray-400 uppercase tracking-wide font-mono">LNG</div>
                <div className="text-xs font-mono text-white">
                  {aircraft.lng.toFixed(4)}
                </div>
              </div>
            </div>
          </div>

          {/* Aircraft-Specific Communications */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-blue-400 font-mono border-b border-gray-700 pb-1">
                {aircraft.callsign} COMMS
              </h3>
              <span className="text-xs text-gray-400 font-mono">
                {filteredMessages.length} msgs
              </span>
            </div>
            <div className="space-y-1 overflow-y-auto flex-1">
              {filteredMessages.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-4">
                  No communications found for {aircraft.callsign}
                </div>
              ) : (
                filteredMessages.map((comm, index) => (
                  <motion.div
                    key={comm.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-2 rounded text-xs border ${
                      comm.isUrgent 
                        ? 'bg-red-900 bg-opacity-50 border-red-500' 
                        : 'bg-gray-800 border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-mono font-bold text-xs ${
                        comm.isUrgent ? 'text-red-400' : 'text-cyan-400'
                      }`}>
                        {comm.callsign}
                      </span>
                      <span className="text-gray-400 font-mono text-xs">
                        {comm.timestamp}
                      </span>
                    </div>
                    <div className={`text-xs leading-tight ${
                      comm.isUrgent ? 'text-red-300 font-semibold' : 'text-gray-300'
                    }`}>
                      "{comm.message}"
                    </div>
                    
                    {/* Show extracted ATC data */}
                    {comm.instructions && comm.instructions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {comm.instructions
                          .filter(instruction => instruction != null && instruction !== '')
                          .map((instruction, idx) => (
                            <span 
                              key={idx}
                              className="inline-block bg-blue-600 text-white text-xs px-1 py-0.5 rounded font-mono"
                            >
                              {String(instruction).replace(/_/g, ' ').toUpperCase()}
                            </span>
                          ))}
                      </div>
                    )}

                    {comm.runways && comm.runways.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {comm.runways
                          .filter(runway => runway != null && runway !== '')
                          .map((runway, idx) => (
                            <span 
                              key={idx}
                              className="inline-block bg-green-600 text-white text-xs px-1 py-0.5 rounded font-mono"
                            >
                              RWY {String(runway).toUpperCase()}
                            </span>
                          ))}
                      </div>
                    )}

                    {comm.isUrgent && (
                      <div className="mt-1">
                        <span className="inline-block bg-red-600 text-white text-xs px-1 py-0.5 rounded font-bold animate-pulse">
                          🚨 URGENT
                        </span>
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 