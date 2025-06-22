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
  type: 'emergency' | 'weather' | 'security' | 'maintenance';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  aircraft?: string;
  timestamp: string;
  requiresDispatch: boolean;
  dispatched: boolean;
  location?: string;
  frequency?: string;
  souls?: number;
  fuel?: string;
  fuelMinutes?: number; // For countdown
  pinned?: boolean;
}

interface AlertsAndTasksProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function AlertsAndTasks({ isCollapsed, onToggle }: AlertsAndTasksProps) {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([
    {
      id: '1',
      type: 'emergency',
      severity: 'critical',
      title: 'MAYDAY',
      description: 'Engine failure, requesting immediate landing',
      aircraft: 'UAL1549',
      timestamp: '14:32:15',
      requiresDispatch: true,
      dispatched: false,
      location: '15 NM NW SFO',
      frequency: '121.5',
      souls: 158,
      fuel: '45 min',
      fuelMinutes: 45,
      pinned: true
    },
    {
      id: '2',
      type: 'weather',
      severity: 'high',
      title: 'SEVERE WEATHER',
      description: 'Microburst detected on final approach RWY 28L',
      timestamp: '14:28:03',
      requiresDispatch: false,
      dispatched: false,
      location: 'SFO Final Approach'
    },
    {
      id: '3',
      type: 'security',
      severity: 'medium',
      title: 'SECURITY INCIDENT',
      description: 'Unattended bag reported at Gate B12',
      timestamp: '14:25:47',
      requiresDispatch: true,
      dispatched: false,
      location: 'Terminal 1, Gate B12'
    }
  ]);

  const [dispatchingAlert, setDispatchingAlert] = useState<string | null>(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [fuelCountdowns, setFuelCountdowns] = useState<Record<string, number>>({});

  // Initialize fuel countdowns
  useEffect(() => {
    const initialCountdowns: Record<string, number> = {};
    alerts.forEach(alert => {
      if (alert.fuelMinutes) {
        initialCountdowns[alert.id] = alert.fuelMinutes * 60; // Convert to seconds
      }
    });
    setFuelCountdowns(initialCountdowns);
  }, []);

  // Live fuel countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setFuelCountdowns(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(alertId => {
          if (updated[alertId] > 0) {
            updated[alertId] -= 1;
          }
        });
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd' && !dispatchingAlert) {
        const criticalAlert = alerts.find(a => a.severity === 'critical' && !a.dispatched && a.requiresDispatch);
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

    // Simulate dispatch process
    setTimeout(() => {
      setAlerts(prev => 
        prev.map(a => 
          a.id === alertId ? { ...a, dispatched: true } : a
        )
      );
      setDispatchingAlert(null);

      // Show toast notification
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg font-mono text-sm z-[9999] shadow-lg';
      toast.textContent = `✅ Emergency Services Dispatched for ${alert.aircraft || alert.title}`;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 3000);

      // Console log for demonstration
      console.log(`🚨 EMERGENCY DISPATCH INITIATED for ${alert.aircraft || alert.title}`);
    }, 1500);
  };

  const togglePin = (alertId: string) => {
    setAlerts(prev => 
      prev.map(a => 
        a.id === alertId ? { ...a, pinned: !a.pinned } : a
      )
    );
  };

  const formatFuelCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getAlertPriority = (alert: EmergencyAlert) => {
    if (alert.pinned) return 0;
    if (alert.severity === 'critical') return 1;
    if (alert.severity === 'high') return 2;
    return 3;
  };

  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && !a.dispatched);
  const sortedAlerts = alerts.sort((a, b) => getAlertPriority(a) - getAlertPriority(b));
  const visibleAlerts = showAllAlerts ? sortedAlerts : sortedAlerts.filter(a => a.severity === 'critical' || a.pinned);

  return (
    <motion.div
      animate={{ height: isCollapsed ? 50 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-gray-900 border border-red-500 rounded-lg shadow-lg overflow-hidden h-full flex flex-col"
    >
      {/* Compact Header */}
      <div 
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-800 transition-colors flex-shrink-0"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-2">
          <ExclamationTriangleIcon className="w-4 h-4 text-red-400" />
          <h3 className="font-semibold text-red-400 font-mono text-xs">EMERGENCY</h3>
          {criticalAlerts.length > 0 && (
            <motion.span 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="bg-red-600 text-white text-xs px-1 py-0.5 rounded font-mono font-bold"
            >
              {criticalAlerts.length}
            </motion.span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAllAlerts(!showAllAlerts);
            }}
            className="text-gray-400 hover:text-white text-xs"
            title={showAllAlerts ? "Show critical only" : "Show all alerts"}
          >
            {showAllAlerts ? <EyeSlashIcon className="w-3 h-3" /> : <EyeIcon className="w-3 h-3" />}
          </button>
          {isCollapsed ? (
            <ChevronUpIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-2 pb-2 flex-1 flex flex-col min-h-0">
          <div className="space-y-1 overflow-y-auto flex-1">
            <AnimatePresence>
              {visibleAlerts.map((alert, index) => {
                const isExpanded = alert.severity === 'critical' || alert.pinned;
                
                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`border rounded p-2 ${
                      alert.severity === 'critical' 
                        ? 'border-red-600 bg-red-950 bg-opacity-60' 
                        : alert.severity === 'high'
                        ? 'border-orange-500 bg-orange-950 bg-opacity-40'
                        : 'border-yellow-500 bg-yellow-950 bg-opacity-30'
                    } ${alert.dispatched ? 'opacity-50' : ''} ${
                      alert.pinned ? 'ring-1 ring-blue-500' : ''
                    }`}
                  >
                    {/* Compact Header */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-1">
                        {alert.severity === 'critical' && (
                          <span className="bg-red-600 text-white text-xs px-1 rounded font-mono font-bold">
                            {alert.title}
                          </span>
                        )}
                        {alert.severity !== 'critical' && (
                          <span className="text-xs font-mono text-gray-300">{alert.title}</span>
                        )}
                        {alert.dispatched && <CheckIcon className="w-3 h-3 text-green-400" />}
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => togglePin(alert.id)}
                          className={`text-xs ${alert.pinned ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'}`}
                          title="Pin alert"
                        >
                          <MapPinIcon className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-mono text-gray-500">{alert.timestamp}</span>
                      </div>
                    </div>

                    {/* Primary Data Block - Condensed */}
                    {alert.aircraft && (
                      <div className="text-sm font-mono text-white mb-2">
                        <strong>{alert.aircraft}</strong> – <span className="text-gray-300">{alert.location}</span>
                        {alert.souls && alert.fuel && (
                          <div className="text-xs text-gray-200">
                            <strong>{alert.souls} pax</strong> | 
                            {fuelCountdowns[alert.id] ? (
                              <motion.span 
                                animate={{ color: fuelCountdowns[alert.id] < 1800 ? '#ef4444' : '#22c55e' }}
                                className="font-bold ml-1"
                              >
                                {formatFuelCountdown(fuelCountdowns[alert.id])} fuel
                              </motion.span>
                            ) : (
                              <span className="ml-1">{alert.fuel} fuel</span>
                            )}
                            {alert.frequency && (
                              <span className="ml-2 bg-gray-700 px-1 rounded text-xs">
                                {alert.frequency}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Description - Only if expanded */}
                    {isExpanded && (
                      <div className="text-xs text-gray-300 mb-2 opacity-80">
                        {alert.description}
                      </div>
                    )}

                    {/* Action Buttons */}
                    {alert.requiresDispatch && !alert.dispatched && (
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleDispatch(alert.id)}
                        disabled={dispatchingAlert === alert.id}
                        className={`w-full py-1.5 px-2 rounded font-mono text-xs font-bold transition-all ${
                          alert.severity === 'critical' 
                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                        } disabled:opacity-50 flex items-center justify-center space-x-1`}
                      >
                        {dispatchingAlert === alert.id ? (
                          <>
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="w-2 h-2 border border-white border-t-transparent rounded-full"
                            />
                            <SpeakerWaveIcon className="w-3 h-3" />
                            <span>DISPATCHING...</span>
                          </>
                        ) : (
                          <>
                            <PhoneIcon className="w-3 h-3" />
                            <span>DISPATCH (D)</span>
                          </>
                        )}
                      </motion.button>
                    )}

                    {alert.dispatched && (
                      <div className="w-full py-1 px-2 rounded bg-green-800 bg-opacity-50 border border-green-600 text-green-200 font-mono text-xs text-center">
                        ✅ DISPATCHED
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Quick Reference Footer */}
          <div className="mt-2 pt-2 border-t border-gray-700 flex-shrink-0">
            <div className="text-xs font-mono text-gray-500 text-center space-y-0.5">
              <div>🚨 911 | 📻 121.5 | 🏥 ARFF (650) 821-7300</div>
              <div className="text-gray-600">Press 'D' to dispatch critical alerts</div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
} 