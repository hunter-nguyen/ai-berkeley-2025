'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { LettaClient } from '@letta-ai/letta-client';
import { 
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  PlayIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ShiftData {
  totalMessages: number;
  urgentMessages: number;
  activeAircraft: string[];
  runwayActivity: string[];
}

const LettaChatWidget: React.FC = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [lettaClient, setLettaClient] = useState<LettaClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const [shiftData] = useState<ShiftData>({
    totalMessages: parseInt(process.env.NEXT_PUBLIC_SHIFT_TOTAL_MESSAGES || '0'),
    urgentMessages: parseInt(process.env.NEXT_PUBLIC_SHIFT_URGENT_MESSAGES || '0'),
    activeAircraft: (process.env.NEXT_PUBLIC_SHIFT_ACTIVE_AIRCRAFT || '').split(',').filter(Boolean),
    runwayActivity: (process.env.NEXT_PUBLIC_SHIFT_RUNWAYS || '').split(',').filter(Boolean)
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const config = {
    apiKey: process.env.NEXT_PUBLIC_LETTA_API_KEY || '',
    agentId: process.env.NEXT_PUBLIC_LETTA_AGENT_ID || '',
    baseUrl: process.env.NEXT_PUBLIC_LETTA_BASE_URL || 'https://api.letta.com'
  };

  const quickCommands = ['Shift status', 'Traffic brief', 'Handover prep', 'Priority list'];

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  useEffect(() => {
    if (config.apiKey && config.agentId) {
      setIsConfigured(true);
      initializeLettaClient();
    }
  }, []);

  useEffect(() => {
    if (lettaClient && isConfigured && chatMessages.length === 0) {
      initializeWithShiftData();
    }
  }, [lettaClient, isConfigured]);

  const initializeLettaClient = () => {
    try {
      setConnectionStatus('connecting');
      let client;
      
      if (config.baseUrl === 'https://api.letta.com') {
        client = new LettaClient({
          token: config.apiKey,
        });
      } else {
        client = new LettaClient({
          baseUrl: config.baseUrl,
        });
      }
      
      setLettaClient(client);
      setConnectionStatus('connected');
      return client;
    } catch (err) {
      console.error('Failed to initialize Letta client:', err);
      setError('Failed to initialize Letta client');
      setConnectionStatus('disconnected');
      return null;
    }
  };

  const generateShiftBriefing = () => {
    const currentTime = new Date().toLocaleString();
    
    return `SHIFT BRIEFING - KSFO Tower Control
Time: ${currentTime}

CURRENT STATUS:
- Total Traffic: ${shiftData.totalMessages} messages processed
- Urgent Items: ${shiftData.urgentMessages} requiring immediate attention  
- Active Aircraft: ${shiftData.activeAircraft.length} (${shiftData.activeAircraft.join(', ')})
- Active Runways: ${shiftData.runwayActivity.join(', ')}

RECENT CRITICAL EVENTS:
1. UAL1542 - Emergency fuel situation, landed safely on 28L at 14:35Z
2. SWA3847 - Go-around due to runway incursion, successful landing 28R at 14:31Z  
3. DAL926 - Medical emergency onboard, expedited to gate with paramedics standing by
4. AAL482 - Bird strike on final, aircraft inspected, no damage found
5. Weather deviation requests increasing due to thunderstorms NE of field

CURRENT CONDITIONS:
- Winds: 280/15G22 (gusting, monitor for wind shear)
- Visibility: 10SM with scattered clouds at 2500ft
- Active Config: Landing 28L/28R, Departures 28L
- NOTAMs: RWY 10R closed maintenance, Taxiway Charlie restricted

OPERATIONAL NOTES:
- High traffic volume during afternoon push
- Medical emergency protocols activated twice this shift
- Ground vehicle coordination critical after earlier runway incursion
- Weather watching required - thunderstorms developing northeast

You are the AI assistant for this shift. Help with handovers, traffic management, emergency protocols, and operational questions. Always prioritize safety and provide accurate, concise information for tower operations.`;
  };

  const initializeWithShiftData = async () => {
    const briefing = generateShiftBriefing();
    await sendMessageToLetta(briefing, true);
  };

  const sendMessageToLetta = async (message: string, isSystemMessage: boolean = false) => {
    if (!lettaClient || !config.agentId) {
      setError('Letta client not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!isSystemMessage) {
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: message,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, userMessage]);
      }

      const response = await lettaClient.agents.messages.create(config.agentId, {
        messages: [{
          role: 'user',
          content: message
        }]
      });

      let assistantResponse = "I'm here to help with your shift operations.";
      
      if (response.messages && response.messages.length > 0) {
        const assistantMessages = response.messages.filter((msg: any) => 
          msg.messageType === 'assistant_message'
        );
        
        if (assistantMessages.length > 0) {
          const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
          if ('content' in lastAssistantMessage && lastAssistantMessage.content) {
            if (typeof lastAssistantMessage.content === 'string') {
              assistantResponse = lastAssistantMessage.content;
            }
          }
        }
      }

      if (!isSystemMessage) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantResponse,
          timestamp: new Date().toISOString()
        };

        setChatMessages(prev => [...prev, assistantMessage]);
      }

    } catch (err: any) {
      console.error('Letta API Error:', err);
      setError(err.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const message = chatInput.trim();
    setChatInput('');
    
    await sendMessageToLetta(message);
  };

  const handleQuickCommand = async (command: string) => {
    await sendMessageToLetta(command);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const testConnection = async () => {
    if (!lettaClient) return;
    setConnectionStatus('connecting');
    try {
      await lettaClient.agents.list();
      setConnectionStatus('connected');
    } catch {
      setConnectionStatus('disconnected');
    }
  };

  if (!isConfigured) {
    return (
      <div className="w-full h-full bg-gray-900/95 border border-red-500/30 rounded-lg p-4 flex flex-col items-center justify-center">
        <ExclamationCircleIcon className="w-8 h-8 text-red-400 mb-3" />
        <h3 className="text-red-300 font-mono text-sm font-bold mb-2">CONFIG REQUIRED</h3>
        <p className="text-gray-300 text-xs font-mono text-center">
          Add Letta API credentials to .env.local
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-900/95 backdrop-blur-sm border border-gray-600/60 rounded-lg shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
        <div className="flex items-center space-x-2">
          <ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-400" />
          <h3 className="text-white font-mono text-sm font-bold tracking-wide">SHIFT ASSISTANT</h3>
        </div>
        <div className="flex items-center space-x-2">
          {/* Connection Status */}
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500' : 
            connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
          }`} />
          <button
            onClick={testConnection}
            disabled={loading}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700/50 transition-all duration-200"
            title="Test Connection"
          >
            <PlayIcon className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="p-3 border-b border-gray-700/50 bg-gray-800/50">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center space-x-3">
            <span className="text-gray-400">
              TFC: <span className="text-blue-400">{shiftData.totalMessages}</span>
            </span>
            {shiftData.urgentMessages > 0 && (
              <motion.span 
                className="text-red-400"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                URG: <span className="text-red-300">{shiftData.urgentMessages}</span>
              </motion.span>
            )}
            <span className="text-gray-400">
              A/C: <span className="text-green-400">{shiftData.activeAircraft.length}</span>
            </span>
          </div>
          <div className="flex items-center space-x-1 text-gray-500">
            <ClockIcon className="w-3 h-3" />
            <span>{new Date().toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit'
            })}</span>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {chatMessages.length === 0 && (
          <div className="text-center text-gray-500 text-sm font-mono mt-8">
            <ChatBubbleLeftRightIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Ready to assist with shift operations</p>
            <p className="text-xs mt-1">Type a message or use quick commands below</p>
          </div>
        )}
        
        {chatMessages.map((message) => (
          <div key={message.id}>
            <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] p-2 rounded text-xs ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-100 border border-gray-700'
                }`}
              >
                <div className="leading-relaxed whitespace-pre-wrap font-mono">{message.content}</div>
                <div className={`text-xs mt-1 opacity-70 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                }`}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-100 border border-gray-700 p-2 rounded">
              <div className="flex items-center space-x-1">
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick Commands */}
      <div className="p-3 border-t border-gray-700/50 bg-gray-800/50">
        <div className="grid grid-cols-2 gap-1 mb-3">
          {quickCommands.map((command, index) => (
            <button
              key={index}
              onClick={() => handleQuickCommand(command)}
              className="px-2 py-1 bg-gray-700/60 text-gray-300 text-xs rounded hover:bg-gray-600 border border-gray-600/50 transition-colors font-mono"
            >
              {command}
            </button>
          ))}
        </div>
        
        {/* Input */}
        <div className="flex space-x-2">
          <input
            ref={inputRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Message..."
            className="flex-1 px-2 py-2 border border-gray-600 bg-gray-800/50 text-gray-100 placeholder-gray-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
            disabled={loading}
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !chatInput.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <PaperAirplaneIcon className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-500/10 border-t border-red-500/30">
          <div className="flex items-center space-x-2">
            <ExclamationCircleIcon className="h-3 w-3 text-red-400" />
            <span className="text-red-300 text-xs font-mono">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LettaChatWidget; 