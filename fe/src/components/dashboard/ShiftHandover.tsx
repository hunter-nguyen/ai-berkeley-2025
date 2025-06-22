'use client';

import React from 'react';
import LettaChatWidget from './LettaChatWidget';

const ShiftHandover: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Chat Widget */}
        <div className="h-[calc(100vh-32px)]">
          <LettaChatWidget />
        </div>
      </div>
    </div>
  );
};

export default ShiftHandover; 