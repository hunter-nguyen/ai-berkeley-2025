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

interface FlightDetailsProps {
  aircraft: Aircraft | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function FlightDetails({ aircraft, isOpen, onClose }: FlightDetailsProps) {
  const recentComms = [
    { time: '14:32:15', message: 'UAL123, maintain flight level 350' },
    { time: '14:31:48', message: 'Roger, flight level 350, UAL123' },
    { time: '14:30:22', message: 'UAL123, turn left heading 090' },
  ];

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

          {/* Recent Communications */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="text-xs font-semibold text-blue-400 mb-2 font-mono border-b border-gray-700 pb-1">RECENT COMMS</h3>
            <div className="space-y-1 overflow-y-auto flex-1">
              {recentComms.map((comm, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-gray-800 border border-gray-600 rounded p-2"
                >
                  <div className="text-xs text-green-400 font-mono">{comm.time}</div>
                  <div className="text-xs text-gray-300 leading-tight">{comm.message}</div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Track History placeholder - now smaller */}
          <div className="mt-2 bg-gray-800 border border-gray-600 rounded p-2 flex-shrink-0">
            <div className="text-xs text-blue-400 mb-1 font-mono">TRACK HISTORY</div>
            <div className="h-12 bg-gray-700 border border-gray-600 rounded flex items-center justify-center">
              <span className="text-xs text-gray-400 font-mono">TRACK DATA</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 