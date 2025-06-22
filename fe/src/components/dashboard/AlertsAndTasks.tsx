'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { 
  ChevronUpIcon, 
  ChevronDownIcon, 
  ExclamationTriangleIcon,
  PhoneIcon,
  SpeakerWaveIcon,
  CheckIcon,
  MapPinIcon,
  EyeSlashIcon,
  EyeIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

interface EmergencyAlert {
  id: string;
  timestamp: string;
  source_message_id: string;
  source_timestamp: string;
  callsign: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'EMERGENCY' | 'WARNING' | 'REPORT' | 'ALERT';
  emergency_type: string;
  description: string;
  original_message: string;
  raw_transcript: string;
  recommended_actions: string[];
  confidence: number;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISPATCHED';
  acknowledged: boolean;
  escalated: boolean;
  atc_data: any;
  created_by: string;
  dispatched?: boolean;
  pinned?: boolean;
}

interface AlertsAndTasksProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function AlertsAndTasks({ isCollapsed, onToggle }: AlertsAndTasksProps) {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatchingAlert, setDispatchingAlert] = useState<string | null>(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  // Fetch emergencies from our backend
  const fetchEmergencies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/emergencies');
      if (!response.ok) {
        throw new Error('Failed to fetch emergencies');
      }
      const data = await response.json();
      setAlerts(data.map((emergency: any) => ({
        ...emergency,
        dispatched: emergency.status === 'ACKNOWLEDGED' || emergency.escalated,
        pinned: emergency.severity === 'CRITICAL'
      })));
      setError(null);
    } catch (err) {
      console.error('Error fetching emergencies:', err);
      setError('Failed to load emergencies');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    fetchEmergencies();
    const interval = setInterval(fetchEmergencies, 5000);
    return () => clearInterval(interval);
  }, [fetchEmergencies]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd' && !dispatchingAlert) {
        const criticalAlert = alerts.find(a => a.severity === 'CRITICAL' && !a.dispatched);
        if (criticalAlert) {
          handleDispatch(criticalAlert.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [alerts, dispatchingAlert]);

  const handleDispatch = async (alertId: string) => {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return;

    setDispatchingAlert(alertId);

    try {
      // Call the new dispatch API
      const response = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId: alert.id,
          callsign: alert.callsign,
          emergencyType: alert.emergency_type,
          description: alert.description,
          originalMessage: alert.original_message
        })
      });

      if (response.ok) {
        const dispatchResult = await response.json();
        
        // Update local state
        setAlerts(prev => 
          prev.map(a => 
            a.id === alertId ? { 
              ...a, 
              dispatched: true, 
              escalated: true,
              status: 'DISPATCHED' as const
            } : a
          )
        );

        // Show detailed toast notification
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg font-mono text-sm z-[9999] shadow-lg max-w-md';
        toast.innerHTML = `
          <div class="font-bold">✅ EMERGENCY DISPATCH INITIATED</div>
          <div class="text-xs mt-1">
            Flight: ${alert.callsign}<br/>
            Recipient: ${dispatchResult.recipient}<br/>
            Call ID: ${dispatchResult.call_id || 'Simulated'}<br/>
            Status: ${dispatchResult.call_status}
          </div>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
          if (document.body.contains(toast)) {
            document.body.removeChild(toast);
          }
        }, 5000);

        console.log(`🚨 VAPI DISPATCH INITIATED for ${alert.callsign}:`, dispatchResult);
        console.log(`📞 Script: ${dispatchResult.script}`);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Dispatch failed');
      }
    } catch (err) {
      console.error('Failed to dispatch emergency:', err);
      
      // Show error toast
      const errorToast = document.createElement('div');
      errorToast.className = 'fixed top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg font-mono text-sm z-[9999] shadow-lg';
      errorToast.textContent = `❌ Dispatch Failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      document.body.appendChild(errorToast);
      
      setTimeout(() => {
        if (document.body.contains(errorToast)) {
          document.body.removeChild(errorToast);
        }
      }, 3000);
    } finally {
      setDispatchingAlert(null);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      const response = await fetch('/api/emergencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergencyId: alertId, action: 'acknowledge' })
      });

      if (response.ok) {
        setAlerts(prev => 
          prev.map(a => 
            a.id === alertId ? { ...a, acknowledged: true, status: 'ACKNOWLEDGED' as const } : a
          )
        );
      }
    } catch (err) {
      console.error('Failed to acknowledge emergency:', err);
    }
  };

  const togglePin = (alertId: string) => {
    setAlerts(prev => 
      prev.map(a => 
        a.id === alertId ? { ...a, pinned: !a.pinned } : a
      )
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'text-red-400 bg-red-500/10 border-red-500/50';
      case 'HIGH': return 'text-orange-400 bg-orange-500/10 border-orange-500/50';
      case 'MEDIUM': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/50';
      case 'LOW': return 'text-blue-400 bg-blue-500/10 border-blue-500/50';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/50';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'EMERGENCY': return '🚨';
      case 'WARNING': return '⚠️';
      case 'REPORT': return '📋';
      default: return '📢';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'EMERGENCY': return 'text-red-400 bg-red-500/15 border-red-500/40';
      case 'WARNING': return 'text-orange-400 bg-orange-500/15 border-orange-500/40';
      case 'REPORT': return 'text-blue-400 bg-blue-500/15 border-blue-500/40';
      default: return 'text-gray-400 bg-gray-500/15 border-gray-500/40';
    }
  };

  const getAlertPriority = (alert: EmergencyAlert) => {
    if (alert.pinned) return 0;
    if (alert.severity === 'CRITICAL') return 1;
    if (alert.severity === 'HIGH') return 2;
    return 3;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour12: false });
  };

  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' && !a.dispatched);
  const sortedAlerts = alerts.sort((a, b) => getAlertPriority(a) - getAlertPriority(b));
  const visibleAlerts = showAllAlerts ? sortedAlerts : sortedAlerts.filter(a => a.severity === 'CRITICAL' || a.pinned);

  if (loading && alerts.length === 0) {
    return (
      <motion.div
        animate={{ height: isCollapsed ? 50 : '100%' }}
        className="bg-gray-900/95 backdrop-blur-sm border border-gray-600/60 rounded-lg shadow-xl overflow-hidden h-full flex flex-col"
      >
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <div className="text-gray-300 font-mono text-sm font-semibold">Loading Emergency System</div>
            <div className="text-gray-500 font-mono text-xs mt-1">Initializing real-time alerts...</div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      animate={{ height: isCollapsed ? 50 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={`bg-gray-900/95 backdrop-blur-sm border rounded-lg shadow-xl overflow-hidden h-full flex flex-col ${
        criticalAlerts.length > 0 ? 'border-red-500/60 shadow-red-500/20' : 'border-gray-600/60'
      }`}
    >
      {/* Enhanced Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800/50 transition-all duration-200 flex-shrink-0 border-b border-gray-700/50"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-3">
          <div className={`p-1.5 rounded-md ${criticalAlerts.length > 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-700/50 text-gray-400'}`}>
            <ExclamationTriangleIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`font-bold font-mono text-sm tracking-wide ${criticalAlerts.length > 0 ? 'text-red-400' : 'text-gray-300'}`}>
              {criticalAlerts.length > 0 ? 'EMERGENCY ALERTS' : 'SYSTEM ALERTS'}
            </h3>
            <div className="text-xs text-gray-500 font-mono">
              {alerts.length} total • {criticalAlerts.length} critical
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {criticalAlerts.length > 0 && (
            <motion.span 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="bg-red-600 text-white text-xs px-2.5 py-1 rounded-full font-bold shadow-lg"
            >
              {criticalAlerts.length}
            </motion.span>
          )}
          {error && (
            <span className="text-red-400 text-xs bg-red-500/20 px-2 py-1 rounded">!</span>
          )}
          <motion.div
            animate={{ rotate: isCollapsed ? 0 : 180 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-hidden flex flex-col"
          >
            {/* Error State */}
            {error && (
              <div className="p-2 bg-red-900/20 border-b border-red-500/20">
                <div className="text-red-400 text-xs font-mono">{error}</div>
              </div>
            )}

            {/* Enhanced Controls */}
            <div className="px-3 py-2 bg-gray-800/30 border-b border-gray-700/50 flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <div className="text-gray-400 text-xs font-mono">
                  <span className="text-white font-semibold">{alerts.length}</span> total
                </div>
                <div className="w-px h-4 bg-gray-600"></div>
                <div className="text-gray-400 text-xs font-mono">
                  <span className={`font-semibold ${criticalAlerts.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {criticalAlerts.length}
                  </span> critical
                </div>
              </div>
              <button
                onClick={() => setShowAllAlerts(!showAllAlerts)}
                className="text-gray-400 hover:text-white text-xs font-mono flex items-center space-x-1.5 px-2 py-1 rounded hover:bg-gray-700/50 transition-all duration-200"
              >
                {showAllAlerts ? <EyeSlashIcon className="w-3 h-3" /> : <EyeIcon className="w-3 h-3" />}
                <span>{showAllAlerts ? 'Critical Only' : 'Show All'}</span>
              </button>
            </div>

            {/* Enhanced Alerts List */}
            <div className="flex-1 overflow-y-auto">
              {visibleAlerts.length === 0 ? (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckIcon className="w-6 h-6 text-green-400" />
                  </div>
                  <div className="text-green-400 text-sm font-mono font-semibold mb-1">All Systems Clear</div>
                  <div className="text-gray-500 text-xs">No active alerts requiring attention</div>
                </div>
              ) : (
                <div className="space-y-2 p-3">
                  {visibleAlerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ x: 300, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className={`relative p-3 rounded-lg border-l-4 ${getSeverityColor(alert.severity)} ${
                        alert.dispatched ? 'bg-gray-800/30' : 'bg-gray-800/60'
                      } hover:bg-gray-700/60 transition-all duration-200 backdrop-blur-sm`}
                    >
                      {/* Alert Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-white font-mono text-sm font-bold tracking-wide">
                            {alert.callsign}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${getSeverityColor(alert.severity)}`}>
                            {alert.severity}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-400 text-xs font-mono">
                            {formatTime(alert.source_timestamp)}
                          </span>
                          <button
                            onClick={() => togglePin(alert.id)}
                            className={`p-1 rounded transition-colors ${alert.pinned ? 'text-yellow-400 bg-yellow-400/20' : 'text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10'}`}
                          >
                            📌
                          </button>
                        </div>
                      </div>

                      {/* Enhanced Alert Content */}
                      <div className="mb-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="text-gray-200 text-sm font-medium leading-snug mb-1">
                              {alert.description}
                            </div>
                            <div className="text-gray-400 text-xs italic bg-gray-900/40 p-2 rounded border-l-2 border-gray-600">
                              "{alert.original_message}"
                            </div>
                          </div>
                          <span className={`ml-3 text-xs px-2 py-1 rounded-full font-mono font-semibold border ${getCategoryColor(alert.category)}`}>
                            {alert.category}
                          </span>
                        </div>
                      </div>

                      {/* Enhanced Confidence & Type */}
                      <div className="flex items-center justify-between mb-3 text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-400 font-mono">
                            {getCategoryIcon(alert.category)} {alert.emergency_type.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500 font-mono">Confidence:</span>
                          <div className="w-16 bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                alert.confidence > 0.8 ? 'bg-green-400' : 
                                alert.confidence > 0.6 ? 'bg-yellow-400' : 'bg-orange-400'
                              }`}
                              style={{ width: `${alert.confidence * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-gray-400 font-mono font-semibold">
                            {Math.round(alert.confidence * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* Enhanced Actions */}
                      <div className="flex items-center gap-2">
                        {!alert.acknowledged && (
                          <button
                            onClick={() => handleAcknowledge(alert.id)}
                            className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs rounded font-mono font-semibold transition-all duration-200 flex items-center space-x-1"
                          >
                            <CheckIcon className="w-3 h-3" />
                            <span>ACK</span>
                          </button>
                        )}
                        
                        {alert.category === 'EMERGENCY' && !alert.dispatched && (
                          <button
                            onClick={() => handleDispatch(alert.id)}
                            disabled={dispatchingAlert === alert.id}
                            className="flex-1 px-3 py-1.5 bg-red-600/90 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded font-mono font-bold transition-all duration-200 flex items-center justify-center space-x-1.5 shadow-md"
                          >
                            {dispatchingAlert === alert.id ? (
                              <>
                                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>DISPATCHING...</span>
                              </>
                            ) : (
                              <>
                                <PhoneIcon className="w-3 h-3" />
                                <span>DISPATCH</span>
                              </>
                            )}
                          </button>
                        )}

                        {alert.dispatched && (
                          <div className="flex-1 px-3 py-1.5 bg-green-600/80 text-white text-xs rounded font-mono font-semibold flex items-center justify-center space-x-1.5">
                            <CheckIcon className="w-3 h-3" />
                            <span>DISPATCHED</span>
                          </div>
                        )}
                        
                        {/* Category-specific status for non-emergency alerts */}
                        {alert.category !== 'EMERGENCY' && !alert.dispatched && (
                          <div className={`flex-1 px-3 py-1.5 text-xs rounded font-mono text-center border ${getCategoryColor(alert.category)}`}>
                            {alert.category === 'WARNING' ? '⚠️ MONITORING' : 
                             alert.category === 'REPORT' ? '📋 LOGGED' : '📢 NOTED'}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
} 