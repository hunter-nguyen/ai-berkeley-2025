'use client';

import { useState, useEffect } from 'react';

export default function ATCStatusBar() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
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

  return (
    <div className="bg-black text-white px-6 py-2 border-b border-green-500">
      <div className="flex items-center justify-between">
        {/* Left Section - Facility ID */}
        <div className="flex items-center space-x-8">
          <div className="text-lg font-bold text-green-400 font-mono tracking-wider">
            SFO TWR
          </div>
          <div className="flex items-center space-x-6 text-sm font-mono">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-green-400">ASDE-X</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-green-400">COMM</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              <span className="text-amber-400">WXALERT</span>
            </div>
          </div>
        </div>

        {/* Center Section - Operational Data */}
        <div className="flex items-center space-x-8 text-sm font-mono">
          <div className="text-center">
            <div className="text-xs text-gray-400">RWY</div>
            <div className="text-sm font-bold text-white">28L/R-10L/R</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">TRAFFIC</div>
            <div className="text-sm font-bold text-cyan-400">MODERATE</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">VIS</div>
            <div className="text-sm font-bold text-white">10SM</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">WIND</div>
            <div className="text-sm font-bold text-white">280/15G22</div>
          </div>
        </div>

        {/* Right Section - Time Info */}
        <div className="flex items-center space-x-6 text-sm font-mono">
          <div className="text-right">
            <div className="text-xs text-gray-400">UTC</div>
            <div className="text-sm font-bold text-green-400">{formatUTCTime(currentTime)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">LOCAL</div>
            <div className="text-sm font-bold text-white">{formatTime(currentTime)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">POS</div>
            <div className="text-sm font-bold text-cyan-400">LC1</div>
          </div>
        </div>
      </div>
    </div>
  );
} 