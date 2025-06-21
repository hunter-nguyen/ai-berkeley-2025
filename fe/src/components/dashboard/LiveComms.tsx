'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface CommMessage {
  id: string;
  timestamp: string;
  callsign: string;
  message: string;
  isUrgent: boolean;
  type: 'incoming' | 'outgoing';
}

interface LiveCommsProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function LiveComms({ isCollapsed, onToggle }: LiveCommsProps) {
  const [messages, setMessages] = useState<CommMessage[]>([
    {
      id: '1',
      timestamp: '14:35:42',
      callsign: 'UAL123',
      message: 'Tower, UAL123 requesting descent to flight level 250',
      isUrgent: false,
      type: 'incoming',
    },
    {
      id: '2',
      timestamp: '14:35:15',
      callsign: 'Tower',
      message: 'UAL123, descend and maintain flight level 250',
      isUrgent: false,
      type: 'outgoing',
    },
    {
      id: '3',
      timestamp: '14:34:58',
      callsign: 'DAL456',
      message: 'MAYDAY MAYDAY, DAL456 experiencing engine failure',
      isUrgent: true,
      type: 'incoming',
    },
    {
      id: '4',
      timestamp: '14:34:32',
      callsign: 'AAL789',
      message: 'Tower, AAL789 ready for departure runway 28L',
      isUrgent: false,
      type: 'incoming',
    },
  ]);

  // Simulate new messages
  useEffect(() => {
    const interval = setInterval(() => {
      const newMessage: CommMessage = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
        callsign: ['UAL123', 'DAL456', 'AAL789', 'Tower'][Math.floor(Math.random() * 4)],
        message: [
          'Roger, maintaining current heading',
          'Request vector for weather avoidance',
          'Checking in at flight level 350',
          'Ready for approach runway 28R',
        ][Math.floor(Math.random() * 4)],
        isUrgent: Math.random() < 0.1,
        type: Math.random() < 0.7 ? 'incoming' : 'outgoing',
      };
      
      setMessages(prev => [newMessage, ...prev.slice(0, 19)]);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      animate={{ height: isCollapsed ? 50 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-gray-900 border border-green-500 rounded-lg shadow-lg overflow-hidden h-full flex flex-col"
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800 transition-colors flex-shrink-0"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <h3 className="font-semibold text-green-400 font-mono text-sm">LIVE COMMS</h3>
        </div>
        {isCollapsed ? (
          <ChevronUpIcon className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        )}
      </div>

      {/* Messages Feed */}
      {!isCollapsed && (
        <div className="px-3 pb-3 flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-600 mb-3">
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className={`p-2 rounded text-xs border ${
                  message.isUrgent 
                    ? 'bg-red-900 bg-opacity-50 border-red-500' 
                    : message.type === 'outgoing'
                    ? 'bg-blue-900 bg-opacity-50 border-blue-500'
                    : 'bg-gray-800 border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-mono font-bold text-xs ${
                    message.isUrgent ? 'text-red-400' : 'text-cyan-400'
                  }`}>
                    {message.callsign}
                  </span>
                  <span className="text-gray-400 font-mono text-xs">
                    {message.timestamp}
                  </span>
                </div>
                <div className={`text-xs leading-tight ${
                  message.isUrgent ? 'text-red-300 font-semibold' : 'text-gray-300'
                }`}>
                  {message.message}
                </div>
                {message.isUrgent && (
                  <div className="mt-1">
                    <span className="inline-block bg-red-600 text-white text-xs px-1 py-0.5 rounded font-bold">
                      URGENT
                    </span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          
          {/* Input Area */}
          <div className="flex space-x-2 flex-shrink-0">
            <input
              type="text"
              placeholder="Type response..."
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors font-mono">
              SEND
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
} 