'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { 
  ChevronUpIcon, 
  ChevronDownIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon 
} from '@heroicons/react/24/outline';

interface Alert {
  id: string;
  type: 'conflict' | 'weather' | 'system';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  aircraft: string[];
  eta?: string;
  resolution?: string;
}

interface Task {
  id: string;
  title: string;
  urgency: 'high' | 'medium' | 'low';
  completed: boolean;
  aircraft?: string;
  deadline?: string;
}

interface AlertsAndTasksProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function AlertsAndTasks({ isCollapsed, onToggle }: AlertsAndTasksProps) {
  const [alerts] = useState<Alert[]>([
    {
      id: '1',
      type: 'conflict',
      severity: 'high',
      title: 'Collision Risk',
      description: 'Potential conflict detected between aircraft',
      aircraft: ['UAL123', 'DAL456'],
      eta: '2 min',
      resolution: 'Turn UAL123 left heading 060, descend DAL456 to FL330',
    },
    {
      id: '2',
      type: 'weather',
      severity: 'medium',
      title: 'Weather Deviation',
      description: 'Thunderstorm activity ahead',
      aircraft: ['AAL789'],
      resolution: 'Vector 20 degrees right for weather avoidance',
    },
  ]);

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Clear UAL123 for approach',
      urgency: 'high',
      completed: false,
      aircraft: 'UAL123',
      deadline: '14:45',
    },
    {
      id: '2',
      title: 'Coordinate with approach control',
      urgency: 'medium',
      completed: false,
      deadline: '15:00',
    },
    {
      id: '3',
      title: 'Update weather briefing',
      urgency: 'low',
      completed: true,
    },
  ]);

  const toggleTask = (taskId: string) => {
    setTasks(prev => 
      prev.map(task => 
        task.id === taskId ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'border-red-500 bg-red-900 bg-opacity-30 text-red-300';
      case 'medium': return 'border-yellow-500 bg-yellow-900 bg-opacity-30 text-yellow-300';
      case 'low': return 'border-green-500 bg-green-900 bg-opacity-30 text-green-300';
      default: return 'border-gray-500 bg-gray-800 text-gray-300';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <motion.div
      animate={{ height: isCollapsed ? 50 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-gray-900 border border-orange-500 rounded-lg shadow-lg overflow-hidden h-full flex flex-col"
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800 transition-colors flex-shrink-0"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-2">
          <ExclamationTriangleIcon className="w-4 h-4 text-orange-400" />
          <h3 className="font-semibold text-orange-400 font-mono text-sm">ALERTS & TASKS</h3>
          <span className="bg-red-600 text-white text-xs px-1 py-0.5 rounded-full font-mono">
            {alerts.length + tasks.filter(t => !t.completed).length}
          </span>
        </div>
        {isCollapsed ? (
          <ChevronUpIcon className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        )}
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-3 pb-3 flex-1 flex flex-col min-h-0">
          {/* Conflict Alerts */}
          <div className="mb-3 flex-shrink-0">
            <h4 className="text-xs font-semibold text-red-400 mb-2 font-mono border-b border-gray-700 pb-1">ACTIVE ALERTS</h4>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {alerts.map((alert, index) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`border rounded p-2 ${getSeverityColor(alert.severity)}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{alert.title}</span>
                    {alert.eta && (
                      <span className="text-xs bg-gray-800 bg-opacity-70 px-1 py-0.5 rounded font-mono">
                        {alert.eta}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mb-1 leading-tight">{alert.description}</div>
                  <div className="text-xs font-mono">
                    <strong>A/C:</strong> {alert.aircraft.join(', ')}
                  </div>
                  {alert.resolution && (
                    <div className="text-xs mt-1 p-1 bg-gray-800 bg-opacity-70 rounded font-mono leading-tight">
                      <strong>REC:</strong> {alert.resolution}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Action Queue */}
          <div className="flex-1 min-h-0">
            <h4 className="text-xs font-semibold text-blue-400 mb-2 font-mono border-b border-gray-700 pb-1">ACTION QUEUE</h4>
            <div className="space-y-1 overflow-y-auto h-full">
              {tasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.02 }}
                  className={`flex items-center space-x-2 p-2 rounded border ${
                    task.completed 
                      ? 'bg-gray-800 border-gray-600' 
                      : 'bg-gray-800 border-gray-600'
                  }`}
                >
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`flex-shrink-0 ${
                      task.completed ? 'text-green-400' : 'text-gray-500'
                    } hover:scale-110 transition-transform`}
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-mono leading-tight ${
                      task.completed ? 'line-through text-gray-500' : 'text-gray-300'
                    }`}>
                      {task.title}
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-gray-400 font-mono">
                      {task.aircraft && (
                        <span>A/C: {task.aircraft}</span>
                      )}
                      {task.deadline && (
                        <span className="flex items-center space-x-1">
                          <ClockIcon className="w-3 h-3" />
                          <span>{task.deadline}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
                    task.urgency === 'high' ? 'bg-red-400' :
                    task.urgency === 'medium' ? 'bg-yellow-400' : 'bg-green-400'
                  }`} />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
} 