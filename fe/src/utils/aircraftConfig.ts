import { AIRCRAFT_CONFIG } from './api/flightradar24';

// Utility to adjust aircraft display count at runtime
export function setAircraftCount(count: number) {
  if (count < 1 || count > 50) {
    console.error('❌ Aircraft count must be between 1 and 50');
    return false;
  }
  
  // Update the config
  (AIRCRAFT_CONFIG as any).MAX_AIRCRAFT_DISPLAY = count;
  
  console.log(`✅ Aircraft display limit set to ${count}`);
  console.log('🔄 Refresh the page or wait for next data fetch to see changes');
  return true;
}

export function getAircraftConfig() {
  return {
    ...AIRCRAFT_CONFIG,
    instructions: {
      'Change aircraft count': 'setAircraftCount(15)',
      'View config': 'getAircraftConfig()',
      'Valid range': '1-50 aircraft'
    }
  };
}

// Make functions available in browser console
if (typeof window !== 'undefined') {
  (window as any).setAircraftCount = setAircraftCount;
  (window as any).getAircraftConfig = getAircraftConfig;
  
  console.log('🛩️ Aircraft Configuration Available:');
  console.log('   - setAircraftCount(15) - Change aircraft display limit');
  console.log('   - getAircraftConfig() - View current settings');
} 