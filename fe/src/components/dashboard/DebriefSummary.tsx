'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUpIcon, ChevronDownIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

interface DebriefSummaryProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export default function DebriefSummary({ isExpanded, onToggle }: DebriefSummaryProps) {
  const summary = {
    shiftDuration: '8h 23m',
    totalAircraft: 247,
    conflicts: 3,
    weatherEvents: 2,
    emergencies: 1,
    narrative: `Tower Tale: During the evening shift, controllers successfully managed 247 aircraft movements including one emergency landing (DAL456 engine failure) which was handled efficiently with no incidents. Three potential conflicts were resolved using standard separation procedures. Weather deviations were managed for thunderstorm activity in sectors 2 and 5. Overall operational efficiency maintained at 98.2% with all safety protocols followed.

Key Events:
• 14:34 - DAL456 declared Mayday due to engine failure, vectored for priority landing RWY 28L
• 15:22 - Weather deviation procedures activated for Sector 2 
• 16:45 - Heavy traffic period managed with 23 aircraft in controlled airspace
• 18:15 - Shift handover completed with comprehensive briefing

Recommendations:
• Review weather radar calibration for Sector 5
• Consider additional staffing during peak evening hours
• Update emergency procedures documentation based on DAL456 incident`
  };

  return (
    <motion.div
      animate={{ height: isExpanded ? 320 : 60 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed bottom-4 left-4 right-4 bg-gray-900 border border-blue-500 rounded-lg shadow-2xl overflow-hidden z-20"
    >
      {/* Collapsed Bar */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-4">
          <DocumentTextIcon className="w-5 h-5 text-blue-400" />
          <div className="flex items-center space-x-6 text-sm font-mono">
            <span className="text-gray-300">
              <span className="font-semibold text-blue-400">SHIFT:</span> {summary.shiftDuration}
            </span>
            <span className="text-gray-300">
              <span className="font-semibold text-blue-400">AIRCRAFT:</span> {summary.totalAircraft}
            </span>
            <span className="text-gray-300">
              <span className="font-semibold text-blue-400">EVENTS:</span> {summary.conflicts + summary.weatherEvents + summary.emergencies}
            </span>
            <span className="text-green-400 font-semibold">ALL CLEAR</span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDownIcon className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronUpIcon className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {/* Expanded Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-4"
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-5 gap-4 mb-4">
              <div className="bg-blue-900 bg-opacity-50 border border-blue-600 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400 font-mono">{summary.totalAircraft}</div>
                <div className="text-xs text-blue-300 font-mono">TOTAL AIRCRAFT</div>
              </div>
              <div className="bg-red-900 bg-opacity-50 border border-red-600 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-400 font-mono">{summary.conflicts}</div>
                <div className="text-xs text-red-300 font-mono">CONFLICTS</div>
              </div>
              <div className="bg-yellow-900 bg-opacity-50 border border-yellow-600 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-yellow-400 font-mono">{summary.weatherEvents}</div>
                <div className="text-xs text-yellow-300 font-mono">WEATHER EVENTS</div>
              </div>
              <div className="bg-orange-900 bg-opacity-50 border border-orange-600 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-orange-400 font-mono">{summary.emergencies}</div>
                <div className="text-xs text-orange-300 font-mono">EMERGENCIES</div>
              </div>
              <div className="bg-green-900 bg-opacity-50 border border-green-600 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-400 font-mono">98.2%</div>
                <div className="text-xs text-green-300 font-mono">EFFICIENCY</div>
              </div>
            </div>

            {/* Narrative */}
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-400 mb-2 font-mono border-b border-gray-700 pb-1">SHIFT SUMMARY</h4>
              <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto font-mono">
                {summary.narrative}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
} 