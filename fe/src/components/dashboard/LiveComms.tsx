'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { ChevronUpIcon, ChevronDownIcon, FunnelIcon, XMarkIcon, RadioIcon, MicrophoneIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';
import MicrophoneDemo from './MicrophoneDemo';

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
  selectedCallsign: string | null;
  onCallsignSelect: (callsign: string) => void;
  onMessagesUpdate: (messages: CommMessage[]) => void;
  onMicrophoneTranscript?: (transcript: string, isEmergency: boolean) => void;
}

export default function LiveComms({ 
  isCollapsed, 
  onToggle, 
  selectedCallsign, 
  onCallsignSelect, 
  onMessagesUpdate,
  onMicrophoneTranscript 
}: LiveCommsProps) {
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [filteredCallsign, setFilteredCallsign] = useState<string | null>(null);
  const [showCallsignFilter, setShowCallsignFilter] = useState(false);
  const [uniqueCallsigns, setUniqueCallsigns] = useState<Set<string>>(new Set());
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'urgent' | 'normal'>('all');
  const [activeTab, setActiveTab] = useState<'live' | 'microphone'>('live');

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
              msg.callsign && // Ensure callsign exists
              msg.callsign !== 'SYSTEM' && // Hide system messages completely
              isClientMeaningful(msg.message, msg.callsign)
            ) // Client-side filter
            .map((msg: any) => ({
              id: msg.id || `msg-${Date.now()}-${Math.random()}`,
              timestamp: new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false }),
              callsign: msg.callsign || 'UNKNOWN',
              message: msg.message || '',
              isUrgent: msg.isUrgent || false,
              type: msg.type || 'incoming',
              rawTranscript: msg.rawTranscript,
              instructions: msg.instructions || [],
              runways: msg.runways || [],
              chunk: msg.chunk,
            }));
          
          // Only update state if messages actually changed
          if (convertedMessages.length !== messages.length || 
              (convertedMessages.length > 0 && messages.length > 0 && convertedMessages[convertedMessages.length - 1].id !== messages[messages.length - 1].id)) {
            
            setMessages(convertedMessages);
            setLastMessageCount(data.length);
            
            // Share messages with parent component
            if (onMessagesUpdate) {
              onMessagesUpdate(convertedMessages);
            }
            
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

  const clearFilter = () => {
    setFilteredCallsign(null);
  };

  const formatTime = (timestamp: string): string => {
    return timestamp; // Already formatted in the useEffect
  };

  // Apply both callsign and type filters
  const getFilteredMessages = () => {
    let filtered = filteredCallsign 
      ? messages.filter(msg => {
          const callsign = msg.callsign || '';
          const message = msg.message || '';
          const filterText = filteredCallsign || '';
          
          return callsign.toLowerCase().includes(filterText.toLowerCase()) ||
                 message.toLowerCase().includes(filterText.toLowerCase());
        })
      : messages;

    // Apply type filter
    if (filter === 'urgent') {
      filtered = filtered.filter(msg => msg.isUrgent);
    } else if (filter === 'normal') {
      filtered = filtered.filter(msg => !msg.isUrgent);
    }

    return filtered;
  };

  const finalFilteredMessages = getFilteredMessages();

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-gray-900/95 backdrop-blur-sm border border-gray-600/60 rounded-lg h-full flex flex-col shadow-xl"
    >
      {/* Header with Enhanced Tabs */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50 bg-gray-800/30">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="flex bg-gray-800/80 backdrop-blur-sm rounded-lg p-1 border border-gray-700/50">
              <button
                onClick={() => setActiveTab('live')}
                className={`px-4 py-2 rounded-md text-xs font-mono font-semibold transition-all duration-200 flex items-center space-x-2 ${
                  activeTab === 'live'
                    ? 'bg-blue-600/90 text-white shadow-lg border border-blue-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <RadioIcon className="w-4 h-4" />
                <span>LIVE ATC</span>
              </button>
              <button
                onClick={() => setActiveTab('microphone')}
                className={`px-4 py-2 rounded-md text-xs font-mono font-semibold transition-all duration-200 flex items-center space-x-2 ${
                  activeTab === 'microphone'
                    ? 'bg-green-600/90 text-white shadow-lg border border-green-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <MicrophoneIcon className="w-4 h-4" />
                <span>MIC</span>
              </button>
            </div>
          </div>
          
          {/* Status Indicator */}
          {activeTab === 'live' && (
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
              <span className="text-xs font-mono text-gray-300">{getStatusText()}</span>
            </div>
          )}
        </div>
        
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-700/50"
        >
          {isCollapsed ? (
            <ChevronUpIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {!isCollapsed && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 overflow-hidden"
          >
            {activeTab === 'live' && (
              <div className="h-full flex flex-col">
                {/* Enhanced Filter Controls */}
                <div className="p-3 border-b border-gray-700/50 bg-gray-800/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-gray-400 font-semibold uppercase tracking-wider">MESSAGE FILTER</span>
                    <span className="text-xs font-mono text-gray-500">{finalFilteredMessages.length} showing</span>
                  </div>
                  <div className="flex space-x-2">
                    {(['all', 'urgent', 'normal'] as const).map((filterType) => (
                      <button
                        key={filterType}
                        onClick={() => setFilter(filterType)}
                        className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all duration-200 border ${
                          filter === filterType
                            ? filterType === 'urgent' 
                              ? 'bg-red-600/90 text-white border-red-500/50 shadow-lg'
                              : filterType === 'normal'
                              ? 'bg-blue-600/90 text-white border-blue-500/50 shadow-lg'
                              : 'bg-gray-600/90 text-white border-gray-500/50 shadow-lg'
                            : 'bg-gray-800/50 text-gray-400 border-gray-600/50 hover:bg-gray-700/50 hover:text-white hover:border-gray-500/50'
                        }`}
                      >
                        {filterType.toUpperCase()}
                        {filter === filterType && (
                          <span className="ml-1 text-xs opacity-75">●</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Enhanced Messages List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-900/30">
                  <AnimatePresence>
                    {finalFilteredMessages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 backdrop-blur-sm ${
                          message.isUrgent
                            ? 'bg-red-900/40 border-red-500/60 hover:bg-red-900/60 shadow-lg shadow-red-500/10'
                            : selectedCallsign === message.callsign
                            ? 'bg-blue-900/40 border-blue-500/60 hover:bg-blue-900/60 shadow-lg shadow-blue-500/10'
                            : 'bg-gray-800/50 border-gray-600/50 hover:bg-gray-800/70 hover:border-gray-500/60'
                        }`}
                        onClick={() => onCallsignSelect(message.callsign)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-mono text-sm font-bold tracking-wide ${
                            message.isUrgent ? 'text-red-300' : 'text-white'
                          }`}>
                            {message.callsign}
                          </span>
                          <div className="flex items-center space-x-2">
                            <span className="text-gray-400 text-xs font-mono">
                              {formatTime(message.timestamp)}
                            </span>
                            {message.isUrgent && (
                              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            )}
                          </div>
                        </div>
                        
                        <div className={`text-xs font-mono leading-relaxed ${
                          message.isUrgent ? 'text-red-200 font-medium' : 'text-gray-300'
                        }`}>
                          {message.message}
                        </div>
                        
                        {message.isUrgent && (
                          <div className="mt-2 flex items-center space-x-2">
                            <span className="bg-red-600/80 text-white text-xs px-2 py-1 rounded-full font-mono font-bold tracking-wide">
                              🚨 URGENT
                            </span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {finalFilteredMessages.length === 0 && (
                    <div className="text-center text-gray-500 text-sm font-mono py-8">
                      <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-6">
                        <div className="text-gray-400 mb-2">📡</div>
                        <div className="font-semibold text-gray-400 mb-1">
                          {filter === 'all' ? 'No communications yet...' : `No ${filter} messages`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {filter === 'all' 
                            ? 'Waiting for ATC transmissions' 
                            : `Switch to "ALL" to see other message types`
                          }
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'microphone' && onMicrophoneTranscript && (
              <div className="h-full p-4 bg-gray-900/30">
                <MicrophoneDemo onTranscript={onMicrophoneTranscript} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Collapsed State */}
      {isCollapsed && (
        <div className="p-4 text-center bg-gray-800/20">
          <div className="flex items-center justify-center space-x-2">
            {activeTab === 'live' ? (
              <>
                <RadioIcon className="w-4 h-4 text-blue-400" />
                <span className="text-blue-400 text-xs font-mono font-semibold">LIVE ATC</span>
              </>
            ) : (
              <>
                <MicrophoneIcon className="w-4 h-4 text-green-400" />
                <span className="text-green-400 text-xs font-mono font-semibold">MICROPHONE</span>
              </>
            )}
            <span className="text-gray-500 text-xs font-mono">COLLAPSED</span>
          </div>
        </div>
      )}
    </motion.div>
  );
} 