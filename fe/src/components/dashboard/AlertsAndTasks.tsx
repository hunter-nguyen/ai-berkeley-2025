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
  EyeIcon
} from '@heroicons/react/24/outline';

interface EmergencyAlert {
  id: string;
  timestamp: string;
  source_message_id: string;
  source_timestamp: string;
  callsign: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'EMERGENCY' | 'ALERT' | 'WARNING';
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

  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'text-red-400 border-red-500';
      case 'HIGH': return 'text-orange-400 border-orange-500';
      case 'MEDIUM': return 'text-yellow-400 border-yellow-500';
      case 'LOW': return 'text-blue-400 border-blue-500';
      default: return 'text-gray-400 border-gray-500';
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
        className="bg-gray-900 border border-gray-500 rounded-lg shadow-lg overflow-hidden h-full flex flex-col"
      >
        <div className="flex items-center justify-center p-4">
          <div className="text-gray-400 font-mono text-xs">Loading emergencies...</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      animate={{ height: isCollapsed ? 50 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={`bg-gray-900 border rounded-lg shadow-lg overflow-hidden h-full flex flex-col ${
        criticalAlerts.length > 0 ? 'border-red-500' : 'border-gray-500'
      }`}
    >
      {/* Compact Header */}
      <div 
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-800 transition-colors flex-shrink-0"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-2">
          <ExclamationTriangleIcon className={`w-4 h-4 ${criticalAlerts.length > 0 ? 'text-red-400' : 'text-gray-400'}`} />
          <h3 className={`font-semibold font-mono text-xs ${criticalAlerts.length > 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {criticalAlerts.length > 0 ? 'EMERGENCY' : 'ALERTS'}
          </h3>
          {criticalAlerts.length > 0 && (
            <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {criticalAlerts.length}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          {error && (
            <span className="text-red-400 text-xs">!</span>
          )}
          {isCollapsed ? 
            <ChevronDownIcon className="w-3 h-3 text-gray-400" /> : 
            <ChevronUpIcon className="w-3 h-3 text-gray-400" />
          }
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

            {/* Controls */}
            <div className="p-2 border-b border-gray-700 flex justify-between items-center">
              <div className="text-gray-400 text-xs font-mono">
                {alerts.length} total | {criticalAlerts.length} critical
              </div>
              <button
                onClick={() => setShowAllAlerts(!showAllAlerts)}
                className="text-gray-400 hover:text-white text-xs font-mono flex items-center space-x-1"
              >
                {showAllAlerts ? <EyeSlashIcon className="w-3 h-3" /> : <EyeIcon className="w-3 h-3" />}
                <span>{showAllAlerts ? 'Critical Only' : 'Show All'}</span>
              </button>
            </div>

            {/* Alerts List */}
            <div className="flex-1 overflow-y-auto">
              {visibleAlerts.length === 0 ? (
                <div className="p-4 text-center">
                  <CheckIcon className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <div className="text-green-400 text-xs font-mono">All Clear</div>
                  <div className="text-gray-500 text-xs">No active emergencies</div>
                </div>
              ) : (
                <div className="space-y-1 p-1">
                  {visibleAlerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ x: 300, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className={`p-2 rounded border-l-4 ${getAlertColor(alert.severity)} ${
                        alert.dispatched ? 'bg-gray-800/50' : 'bg-gray-800'
                      } hover:bg-gray-700 transition-colors`}
                    >
                      {/* Alert Header */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-white font-mono text-xs font-bold">
                            {alert.callsign}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${getAlertColor(alert.severity)} bg-opacity-20`}>
                            {alert.severity}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-gray-400 text-xs font-mono">
                            {formatTime(alert.source_timestamp)}
                          </span>
                          <button
                            onClick={() => togglePin(alert.id)}
                            className={`w-3 h-3 ${alert.pinned ? 'text-yellow-400' : 'text-gray-500'} hover:text-yellow-400`}
                          >
                            📌
                          </button>
                        </div>
                      </div>

                      {/* Alert Content */}
                      <div className="text-gray-300 text-xs mb-2">
                        <div className="font-semibold mb-1">{alert.description}</div>
                        <div className="text-gray-400 italic">"{alert.original_message}"</div>
                      </div>

                      {/* Confidence & Type */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-xs">
                          {alert.emergency_type.replace('_', ' ').toUpperCase()}
                        </span>
                        <div className="flex items-center space-x-1">
                          <div className="w-12 bg-gray-700 rounded-full h-1">
                            <div
                              className="bg-blue-500 h-1 rounded-full"
                              style={{ width: `${alert.confidence * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-400">
                            {Math.round(alert.confidence * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-1">
                        {!alert.acknowledged && (
                          <button
                            onClick={() => handleAcknowledge(alert.id)}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded font-mono"
                          >
                            ACK
                          </button>
                        )}
                        
                        {!alert.dispatched && alert.severity === 'CRITICAL' && (
                          <button
                            onClick={() => handleDispatch(alert.id)}
                            disabled={dispatchingAlert === alert.id}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-mono flex items-center space-x-1 disabled:opacity-50"
                          >
                            <PhoneIcon className="w-3 h-3" />
                            <span>{dispatchingAlert === alert.id ? 'DISPATCHING...' : 'DISPATCH'}</span>
                          </button>
                        )}

                        {alert.dispatched && (
                          <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-mono">
                            ✅ DISPATCHED
                          </span>
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