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
      className="bg-black/90 backdrop-blur-sm border border-gray-600 rounded-lg h-full flex flex-col"
    >
      {/* Header with Tabs */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('live')}
                className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                  activeTab === 'live'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <RadioIcon className="w-4 h-4 inline mr-1" />
                LIVE ATC
              </button>
              <button
                onClick={() => setActiveTab('microphone')}
                className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                  activeTab === 'microphone'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <MicrophoneIcon className="w-4 h-4 inline mr-1" />
                MIC
              </button>
            </div>
          </div>
        </div>
        
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-white transition-colors"
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
                {/* Filter Controls */}
                <div className="p-3 border-b border-gray-700">
                  <div className="flex space-x-2">
                    {(['all', 'urgent', 'normal'] as const).map((filterType) => (
                      <button
                        key={filterType}
                        onClick={() => setFilter(filterType)}
                        className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                          filter === filterType
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {filterType.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  <AnimatePresence>
                    {finalFilteredMessages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                          message.isUrgent
                            ? 'bg-red-900/30 border-red-500 hover:bg-red-900/50'
                            : selectedCallsign === message.callsign
                            ? 'bg-blue-900/30 border-blue-500 hover:bg-blue-900/50'
                            : 'bg-gray-800/50 border-gray-600 hover:bg-gray-800/70'
                        }`}
                        onClick={() => onCallsignSelect(message.callsign)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white font-mono text-sm font-bold">
                            {message.callsign}
                          </span>
                          <span className="text-gray-400 text-xs font-mono">
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                        
                        <div className="text-gray-300 text-xs font-mono leading-relaxed">
                          {message.message}
                        </div>
                        
                        {message.isUrgent && (
                          <div className="mt-2 flex items-center space-x-1">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="text-red-400 text-xs font-mono font-bold">URGENT</span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {finalFilteredMessages.length === 0 && (
                    <div className="text-center text-gray-500 text-sm font-mono py-8">
                      {filter === 'all' ? 'No communications yet...' : `No ${filter} messages`}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'microphone' && onMicrophoneTranscript && (
              <div className="h-full p-3">
                <MicrophoneDemo onTranscript={onMicrophoneTranscript} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed State */}
      {isCollapsed && (
        <div className="p-4 text-center">
          <div className="text-gray-400 text-xs font-mono">
            {activeTab === 'live' ? 'LIVE ATC' : 'MICROPHONE'} COLLAPSED
          </div>
        </div>
      )}
    </motion.div>
  );
} 