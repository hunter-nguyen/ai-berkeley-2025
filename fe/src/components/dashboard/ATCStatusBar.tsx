'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { loadAirportData, formatWindDisplay, formatTemperature, formatClouds, type AirportData } from '@/utils/airportData';

interface ATCStatusBarProps {
  aircraftCount?: number;
  selectedCallsign?: string | null;
  onClearSelection?: () => void;
}

export default function ATCStatusBar({ aircraftCount = 0, selectedCallsign, onClearSelection }: ATCStatusBarProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const [airportData, setAirportData] = useState<AirportData | null>(null);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    // Load airport data
    loadAirportData().then(setAirportData);
    
    // Refresh airport data every 5 minutes
    const airportTimer = setInterval(() => {
      loadAirportData().then(setAirportData);
    }, 5 * 60 * 1000);
    
    return () => {
      clearInterval(timer);
      clearInterval(airportTimer);
    };
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatUTCTime = (date: Date) => {
    return date.toISOString().substr(11, 8) + 'Z';
  };

  const getTrafficLevel = () => {
    if (aircraftCount === 0) return 'LOADING';
    if (aircraftCount < 5) return 'LIGHT';
    if (aircraftCount < 15) return 'MOD';
    return 'HEAVY';
  };

  const getTrafficColor = () => {
    const level = getTrafficLevel();
    if (level === 'LOADING') return 'text-gray-400';
    if (level === 'LIGHT') return 'text-green-400';
    if (level === 'MOD') return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-black text-white px-4 py-1.5 border-b border-green-500">
      <div className="flex items-center justify-between">
        {/* Left Section - Facility & Systems */}
        <div className="flex items-center space-x-6">
          <div className="text-lg font-bold text-green-400 font-mono tracking-wider">
            SFO TWR
          </div>
          <div className="flex items-center space-x-3 text-xs font-mono">
            <div className="flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-green-400">ASDE</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
              <span className="text-green-400">COMM</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
              <span className="text-amber-400">WX</span>
            </div>
          </div>
          
          {/* Selected Aircraft */}
          {selectedCallsign && (
            <div className="flex items-center space-x-2 bg-blue-900 bg-opacity-50 px-2 py-1 rounded border border-blue-500">
              <span className="text-blue-400 font-bold text-xs">SEL:</span>
              <span className="text-white font-mono text-sm">{selectedCallsign}</span>
              {onClearSelection && (
                <button
                  onClick={onClearSelection}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Center Section - Grouped Operational Data */}
        <div className="flex items-center space-x-6 text-sm font-mono">
          {/* Runway & Traffic Group */}
          <div 
            className="flex items-center space-x-2 cursor-help group relative"
            title={`${aircraftCount} aircraft tracked | Traffic level: ${getTrafficLevel()}`}
          >
            <span className="text-white">🛫</span>
            <span className="text-white">28L/R</span>
            <span className="text-gray-400">⎢</span>
            <span className={getTrafficColor()}>{getTrafficLevel()}</span>
            <span className="text-cyan-400 ml-1">{aircraftCount}</span>
            
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              Runways: 28L/R, 10L/R | {aircraftCount} Live Aircraft
            </div>
          </div>

          {/* Weather Group */}
          <div 
            className="flex items-center space-x-2 cursor-help group relative"
            title={`Weather conditions | Temp: ${airportData ? formatTemperature(airportData.airport_data.temp) : '--°C'} | Wind: ${airportData ? formatWindDisplay(airportData.airport_data.wdir, airportData.airport_data.wspd, airportData.airport_data.wgst) : '280/15'}`}
          >
            <span className="text-white">🌤️</span>
            <span className="text-cyan-400">
              {airportData ? formatClouds(airportData.airport_data.clouds) : 'CLR'}
            </span>
            <span className="text-gray-400">⎢</span>
            <span className="text-orange-400">
              {airportData ? formatTemperature(airportData.airport_data.temp) : '--°C'}
            </span>
            
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              Wind: {airportData ? formatWindDisplay(airportData.airport_data.wdir, airportData.airport_data.wspd, airportData.airport_data.wgst) : '280/15'} | 
              Vis: {airportData ? airportData.airport_data.visib : '10SM'} | 
              Sky: {airportData ? formatClouds(airportData.airport_data.clouds) : 'CLR'}
            </div>
          </div>
        </div>

        {/* Right Section - Time & Position */}
        <div className="flex items-center space-x-4 text-sm font-mono">
          <div className="text-center">
            <div className="text-xs text-gray-400">UTC</div>
            <div className="text-sm font-bold text-green-400">
              {mounted && currentTime ? formatUTCTime(currentTime) : '--:--:--Z'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">LOCAL</div>
            <div className="text-sm font-bold text-white">
              {mounted && currentTime ? formatTime(currentTime) : '--:--:--'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">POS</div>
            <div className="text-sm font-bold text-cyan-400">LC1</div>
          </div>
        </div>
      </div>
    </div>
  );
} 