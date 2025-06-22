'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { ChevronUpIcon, ChevronDownIcon, FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';

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

interface LiveCommsProps {
  isCollapsed: boolean;
  onToggle: () => void;
  selectedCallsign?: string | null;
  onCallsignSelect?: (callsign: string) => void;
}

export default function LiveComms({ isCollapsed, onToggle, selectedCallsign, onCallsignSelect }: LiveCommsProps) {
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [filteredCallsign, setFilteredCallsign] = useState<string | null>(null);
  const [showCallsignFilter, setShowCallsignFilter] = useState(false);
  const [uniqueCallsigns, setUniqueCallsigns] = useState<Set<string>>(new Set());
  const [lastMessageCount, setLastMessageCount] = useState(0);

  // Update filtered callsign when aircraft is selected from radar map
  useEffect(() => {
    if (selectedCallsign) {
      setFilteredCallsign(selectedCallsign);
    }
  }, [selectedCallsign]);

  // Function to filter meaningful messages on client side too
  const isClientMeaningful = (message: string, callsign: string): boolean => {
    if (!message || message.trim().length <= 1) return false;
    const cleaned = message.trim().toLowerCase();
    if (cleaned === '.' || cleaned === 'thank you' || cleaned === 'thanks') return false;
    return cleaned.split(' ').length >= 2;
  };

  // Connect to ATC Audio Agent via optimized JSON polling
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    let lastUpdateTime = 0;
    
    const fetchMessages = async () => {
      try {
        setConnectionStatus('connecting');
        
        const response = await fetch('/messages.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Only update if there are actually new messages
        if (data && Array.isArray(data) && data.length !== lastMessageCount) {
          setConnectionStatus('connected');
          
          // Filter and convert messages to our format
          const convertedMessages: CommMessage[] = data
            .filter((msg: any) => 
              msg.message && 
              msg.callsign !== 'SYSTEM' && // Hide system messages completely
              isClientMeaningful(msg.message, msg.callsign)
            ) // Client-side filter
            .map((msg: any) => ({
              id: msg.id,
              timestamp: new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false }),
              callsign: msg.callsign,
              message: msg.message,
              isUrgent: msg.isUrgent,
              type: msg.type,
              rawTranscript: msg.rawTranscript,
              instructions: msg.instructions,
              runways: msg.runways,
              chunk: msg.chunk,
            }));
          
          // Only update state if messages actually changed
          if (convertedMessages.length !== messages.length || 
              (convertedMessages.length > 0 && messages.length > 0 && convertedMessages[convertedMessages.length - 1].id !== messages[messages.length - 1].id)) {
            
            setMessages(convertedMessages);
            setLastMessageCount(data.length);
            
            // Update unique callsigns
            const callsigns = new Set<string>();
            convertedMessages.forEach(msg => {
              if (msg.callsign && msg.callsign !== 'SYSTEM') {
                callsigns.add(msg.callsign);
              }
            });
            setUniqueCallsigns(callsigns);
          }
        } else if (data && Array.isArray(data) && data.length > 0) {
          setConnectionStatus('connected');
        }
        
        lastUpdateTime = Date.now();
      } catch (error) {
        console.error('❌ Error fetching messages:', error);
        setConnectionStatus('disconnected');
      }
    };
    
    // Initial fetch
    fetchMessages();
    
    // Poll every 2 seconds for updates
    pollInterval = setInterval(fetchMessages, 2000);
    
    // Cleanup
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, []); // Remove messages dependency to prevent unnecessary re-renders

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-red-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'LIVE KSFO TOWER';
      case 'connecting': return 'CONNECTING...';
      case 'disconnected': return 'OFFLINE';
    }
  };

  // Filter messages by callsign
  const filteredMessages = filteredCallsign 
    ? messages.filter(msg => 
        msg.callsign.toLowerCase().includes(filteredCallsign.toLowerCase()) ||
        msg.message.toLowerCase().includes(filteredCallsign.toLowerCase())
      )
    : messages;

  const handleCallsignClick = (callsign: string) => {
    if (filteredCallsign === callsign) {
      setFilteredCallsign(null);
    } else {
      setFilteredCallsign(callsign);
      if (onCallsignSelect) {
        onCallsignSelect(callsign);
      }
    }
  };

  const clearFilter = () => {
    setFilteredCallsign(null);
  };

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
          <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'animate-pulse' : ''} ${getStatusColor()}`} />
          <h3 className="font-semibold text-green-400 font-mono text-sm">{getStatusText()}</h3>
          {filteredCallsign && (
            <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded font-mono">
              {filteredCallsign}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400 font-mono">
            {filteredMessages.length}/{messages.length} msgs
          </span>
          {!isCollapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCallsignFilter(!showCallsignFilter);
              }}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
            >
              <FunnelIcon className="w-4 h-4 text-gray-400" />
            </button>
          )}
          {isCollapsed ? (
            <ChevronUpIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-3 pb-3 flex-1 flex flex-col min-h-0">
          
          {/* Callsign Filter */}
          <AnimatePresence>
            {showCallsignFilter && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 p-2 bg-gray-800 rounded border border-gray-600"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-mono">Filter by Callsign:</span>
                  {filteredCallsign && (
                    <button
                      onClick={clearFilter}
                      className="flex items-center space-x-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <XMarkIcon className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {Array.from(uniqueCallsigns).sort().map((callsign) => (
                    <button
                      key={callsign}
                      onClick={() => handleCallsignClick(callsign)}
                      className={`text-xs px-2 py-1 rounded font-mono transition-colors ${
                        filteredCallsign === callsign
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {callsign}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-600 mb-3">
            {filteredMessages.length === 0 && connectionStatus === 'connected' && !filteredCallsign && (
              <div className="text-center text-gray-400 text-xs py-4">
                🎧 Listening for ATC communications...
              </div>
            )}
            
            {filteredMessages.length === 0 && filteredCallsign && (
              <div className="text-center text-gray-400 text-xs py-4">
                No messages found for {filteredCallsign}
              </div>
            )}
            
            {filteredMessages.length === 0 && connectionStatus === 'disconnected' && (
              <div className="text-center text-red-400 text-xs py-4">
                ❌ Communications unavailable<br/>
                No messages found
              </div>
            )}

            {filteredMessages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className={`p-3 rounded-lg text-xs border ${
                  message.isUrgent 
                    ? 'bg-red-900 bg-opacity-50 border-red-500 shadow-lg shadow-red-500/20' 
                    : message.type === 'atc_analysis'
                    ? 'bg-blue-900 bg-opacity-30 border-blue-400'
                    : 'bg-gray-800 border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => handleCallsignClick(message.callsign)}
                    className={`font-mono font-bold text-sm transition-colors hover:text-blue-300 ${
                      message.isUrgent ? 'text-red-400' : 'text-cyan-400'
                    }`}
                  >
                    {message.callsign}
                  </button>
                  <div className="flex items-center space-x-2">
                    {message.chunk && (
                      <span className="text-xs text-gray-500 font-mono">
                        #{message.chunk}
                      </span>
                    )}
                    <span className="text-gray-400 font-mono text-xs">
                      {message.timestamp}
                    </span>
                  </div>
                </div>
                
                <div className={`text-sm leading-relaxed mb-2 ${
                  message.isUrgent ? 'text-red-300 font-semibold' : 'text-gray-200'
                }`}>
                  "{message.message}"
                </div>

                {/* Show extracted ATC data */}
                {message.instructions && message.instructions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {message.instructions.map((instruction, idx) => (
                      <span 
                        key={idx}
                        className="inline-block bg-blue-600 text-white text-xs px-2 py-1 rounded font-mono"
                      >
                        {instruction.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}

                {message.runways && message.runways.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {message.runways.map((runway, idx) => (
                      <span 
                        key={idx}
                        className="inline-block bg-green-600 text-white text-xs px-2 py-1 rounded font-mono"
                      >
                        RWY {runway.toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}

                {message.isUrgent && (
                  <div className="mt-2">
                    <span className="inline-block bg-red-600 text-white text-xs px-2 py-1 rounded font-bold animate-pulse">
                      🚨 URGENT
                    </span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          
          {/* Status Info */}
          <div className="flex-shrink-0 text-xs text-gray-400 font-mono text-center py-2 border-t border-gray-700">
            {connectionStatus === 'connected' ? (
              <div className="space-y-1">
                <div>🎧 KSFO Tower Live Communications</div>
              </div>
            ) : connectionStatus === 'connecting' ? (
              '🔄 Loading...'
            ) : (
              '❌ No communications available'
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
} 