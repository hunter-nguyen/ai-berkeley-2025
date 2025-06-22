'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon, 
  ArrowPathIcon, 
  DocumentTextIcon,
  CircleStackIcon,
  ClockIcon,
  ExclamationCircleIcon,
  SignalIcon,
  RadioIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';

interface LettaStatus {
  status: string;
  agent_available: boolean;
  agent_id?: string;
  shift_overview?: {
    date: string;
    total_messages: number;
    active_callsigns: number;
    urgent_messages: number;
    runway_activity: string[];
    last_update: string;
  };
  capabilities?: string[];
  error?: string;
  message?: string;
}

interface ComprehensiveData {
  shift_date: string;
  total_messages: number;
  active_callsigns: string[];
  urgent_count: number;
  runway_activity: string[];
  instruction_types: string[];
  recent_messages: any[];
}

interface Summary {
  summary: string;
  patterns: {
    patterns_analysis: string;
    timestamp: string;
  };
  generated_at: string;
  shift_type: string;
  format: string;
}

const ShiftHandover: React.FC = () => {
  const [status, setStatus] = useState<LettaStatus | null>(null);
  const [comprehensiveData, setComprehensiveData] = useState<ComprehensiveData | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [noteCategory, setNoteCategory] = useState('general');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    summary: false,
    data: false,
    patterns: false
  });

  const API_BASE = 'http://localhost:8002/api/v1';

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/letta/comprehensive-status`);
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError('Failed to fetch Letta status');
    }
  };

  const initializeLetta = async () => {
    if (!apiKey.trim()) {
      setError('Please enter a Letta API key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/letta/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey })
      });

      if (!response.ok) {
        throw new Error('Failed to initialize Letta agent');
      }

      await fetchStatus();
      setApiKey(''); // Clear API key after successful init
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const loadComprehensiveData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/letta/load-comprehensive`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to load comprehensive data');
      }

      const result = await response.json();
      setComprehensiveData(result.data);
      await fetchStatus(); // Refresh status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const generateMarkdownSummary = async (shiftType: string = 'handover') => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/letta/markdown-summary?shift_type=${shiftType}&include_weather=true`);

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const result = await response.json();
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const addManualNote = async () => {
    if (!manualNote.trim()) {
      setError('Please enter a note');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/letta/add-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          note: manualNote,
          category: noteCategory 
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add note');
      }

      setManualNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const renderMarkdown = (text: string) => {
    // Simple markdown-to-JSX converter for display
    return text
      .split('\n')
      .map((line, i) => {
        if (line.startsWith('# ')) {
          return <h1 key={i} className="text-2xl font-bold mb-4 text-blue-400">{line.substring(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={i} className="text-xl font-semibold mb-3 mt-4 text-blue-300">{line.substring(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={i} className="text-lg font-medium mb-2 mt-3 text-blue-200">{line.substring(4)}</h3>;
        }
        if (line.startsWith('- ')) {
          return <li key={i} className="ml-4 mb-1 text-gray-300">{line.substring(2)}</li>;
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-bold mb-2 text-white">{line.slice(2, -2)}</p>;
        }
        if (line.trim() === '---') {
          return <hr key={i} className="my-4 border-gray-600" />;
        }
        if (line.trim()) {
          return <p key={i} className="mb-2 text-gray-300">{line}</p>;
        }
        return <br key={i} />;
      });
  };

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900/95 backdrop-blur-sm border border-gray-600/60 rounded-lg shadow-xl"
      >
        <button
          onClick={() => toggleSection('overview')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <RadioIcon className="w-5 h-5 text-blue-400" />
            <span className="text-lg font-semibold text-white">Letta Shift Agent Status</span>
            {status?.agent_available ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <CheckCircleIcon className="w-3 h-3 mr-1" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                <XCircleIcon className="w-3 h-3 mr-1" />
                Inactive
              </span>
            )}
          </div>
          {expandedSections.overview ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
        </button>
        
        <AnimatePresence>
          {expandedSections.overview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-4"
            >
              {status?.shift_overview && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center p-3 bg-blue-900/30 rounded border border-blue-500/30">
                    <div className="text-2xl font-bold text-blue-400">{status.shift_overview.total_messages}</div>
                    <div className="text-sm text-gray-400">Total Messages</div>
                  </div>
                  <div className="text-center p-3 bg-green-900/30 rounded border border-green-500/30">
                    <div className="text-2xl font-bold text-green-400">{status.shift_overview.active_callsigns}</div>
                    <div className="text-sm text-gray-400">Active Aircraft</div>
                  </div>
                  <div className="text-center p-3 bg-yellow-900/30 rounded border border-yellow-500/30">
                    <div className="text-2xl font-bold text-yellow-400">{status.shift_overview.urgent_messages}</div>
                    <div className="text-sm text-gray-400">Urgent Messages</div>
                  </div>
                  <div className="text-center p-3 bg-purple-900/30 rounded border border-purple-500/30">
                    <div className="text-2xl font-bold text-purple-400">{status.shift_overview.runway_activity?.length || 0}</div>
                    <div className="text-sm text-gray-400">Active Runways</div>
                  </div>
                </div>
              )}

              {status?.agent_available && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="text-green-300 text-sm font-medium">🤖 Auto-Update Active</span>
                    </div>
                    <div className="text-xs text-green-400">
                      Live feed to Letta enabled
                    </div>
                  </div>
                  <div className="text-xs text-green-300/70 mt-2">
                    ✅ New ATC messages automatically sent to Letta
                    <br />
                    🔄 Comprehensive updates every ~5 minutes
                    <br />
                    📡 Last update: {status.shift_overview?.last_update ? new Date(status.shift_overview.last_update).toLocaleTimeString() : 'Never'}
                  </div>
                </div>
              )}

              {!status?.agent_available && (
                <div className="space-y-4">
                  <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <ExclamationTriangleIcon className="h-4 w-4 text-yellow-400" />
                      <span className="text-yellow-200">
                        {status?.message || 'Letta agent not initialized. Enter your API key to get started.'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <input
                      placeholder="Enter Letta API key..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      type="password"
                      className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                    />
                    <button 
                      onClick={initializeLetta} 
                      disabled={loading}
                      className="px-4 py-2 bg-blue-600/90 text-white rounded-md hover:bg-blue-700/90 disabled:opacity-50 flex items-center space-x-2"
                    >
                      {loading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Initialize'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Action Buttons */}
      {status?.agent_available && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={loadComprehensiveData} 
            disabled={loading}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600/90 text-white rounded-md hover:bg-blue-700/90 disabled:opacity-50 transition-colors"
          >
            <CircleStackIcon className="w-4 h-4" />
            <span>Manual Refresh Data</span>
          </button>
          
          <button 
            onClick={() => generateMarkdownSummary('handover')} 
            disabled={loading}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600/90 text-white rounded-md hover:bg-gray-700/90 disabled:opacity-50 transition-colors border border-gray-500/50"
          >
            <DocumentTextIcon className="w-4 h-4" />
            <span>Generate Summary</span>
          </button>
          
          <button 
            onClick={fetchStatus} 
            disabled={loading}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-700/90 text-white rounded-md hover:bg-gray-800/90 disabled:opacity-50 transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <ExclamationCircleIcon className="h-4 w-4 text-red-400" />
            <span className="text-red-200">{error}</span>
          </div>
        </div>
      )}

      {/* Manual Note Input */}
      {status?.agent_available && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900/95 backdrop-blur-sm border border-gray-600/60 rounded-lg shadow-xl"
        >
          <div className="p-4 border-b border-gray-700/50">
            <div className="flex items-center space-x-2">
              <ClockIcon className="w-5 h-5 text-blue-400" />
              <span className="text-lg font-semibold text-white">Add Manual Note</span>
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              <select 
                value={noteCategory} 
                onChange={(e) => setNoteCategory(e.target.value)}
                className="w-full p-2 bg-gray-800/50 border border-gray-600/50 rounded-md text-white"
              >
                <option value="general">General</option>
                <option value="critical">Critical</option>
                <option value="weather">Weather</option>
                <option value="equipment">Equipment</option>
                <option value="traffic">Traffic</option>
              </select>
              
              <div className="flex space-x-2">
                <input
                  placeholder="Enter shift note..."
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                />
                <button 
                  onClick={addManualNote} 
                  disabled={loading}
                  className="px-4 py-2 bg-green-600/90 text-white rounded-md hover:bg-green-700/90 disabled:opacity-50"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Comprehensive Data Display */}
      {comprehensiveData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900/95 backdrop-blur-sm border border-gray-600/60 rounded-lg shadow-xl"
        >
          <button
            onClick={() => toggleSection('data')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <CircleStackIcon className="w-5 h-5 text-blue-400" />
              <span className="text-lg font-semibold text-white">Comprehensive Shift Data</span>
            </div>
            {expandedSections.data ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
          </button>
          
          <AnimatePresence>
            {expandedSections.data && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 pb-4"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-400 mb-2">Active Callsigns</h4>
                      <div className="flex flex-wrap gap-1">
                        {comprehensiveData.active_callsigns.map((callsign, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-900/30 text-blue-300 border border-blue-500/30">
                            <SignalIcon className="w-3 h-3 mr-1" />
                            {callsign}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-sm text-gray-400 mb-2">Runway Activity</h4>
                      <div className="flex flex-wrap gap-1">
                        {comprehensiveData.runway_activity.map((runway, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-800/50 text-gray-300 border border-gray-600/50">
                            {runway}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-sm text-gray-400 mb-2">Instruction Types</h4>
                      <div className="flex flex-wrap gap-1">
                        {comprehensiveData.instruction_types.map((type, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-800/50 text-gray-300 border border-gray-600/50">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {comprehensiveData.recent_messages.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-400 mb-2">Recent Communications</h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {comprehensiveData.recent_messages.map((msg, i) => (
                          <div key={i} className="text-xs p-2 bg-gray-800/30 rounded border border-gray-700/30">
                            <span className="font-medium text-blue-300">{msg.callsign}</span>: <span className="text-gray-300">{msg.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Markdown Summary Display */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900/95 backdrop-blur-sm border border-gray-600/60 rounded-lg shadow-xl"
        >
          <button
            onClick={() => toggleSection('summary')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <DocumentTextIcon className="w-5 h-5 text-blue-400" />
              <span className="text-lg font-semibold text-white">Shift Handover Summary</span>
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-800/50 text-gray-300 border border-gray-600/50">
                {summary.format.toUpperCase()}
              </span>
            </div>
            {expandedSections.summary ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
          </button>
          
          <AnimatePresence>
            {expandedSections.summary && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 pb-4"
              >
                <div className="prose prose-sm max-w-none">
                  {renderMarkdown(summary.summary)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Pattern Analysis */}
      {summary?.patterns && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900/95 backdrop-blur-sm border border-gray-600/60 rounded-lg shadow-xl"
        >
          <button
            onClick={() => toggleSection('patterns')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <ExclamationCircleIcon className="w-5 h-5 text-purple-400" />
              <span className="text-lg font-semibold text-white">Pattern Analysis</span>
            </div>
            {expandedSections.patterns ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
          </button>
          
          <AnimatePresence>
            {expandedSections.patterns && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 pb-4"
              >
                <div className="text-sm text-gray-300">
                  {summary.patterns.patterns_analysis}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Generated: {new Date(summary.patterns.timestamp).toLocaleString()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export default ShiftHandover; 