// Debug utility for aircraft rendering
import { flightRadar24, AIRCRAFT_CONFIG } from './api/flightradar24';

export const debugAircraft = {
  async checkAircraftData() {
    console.log('🔍 Debugging Aircraft Data:');
    console.log('=====================================');
    
    // Check configuration
    console.log('📊 Configuration:');
    console.log('   - Max aircraft display:', AIRCRAFT_CONFIG.MAX_AIRCRAFT_DISPLAY);
    console.log('   - API fetch limit:', AIRCRAFT_CONFIG.API_FETCH_LIMIT);
    console.log('   - Min altitude:', AIRCRAFT_CONFIG.MIN_ALTITUDE);
    console.log('   - NO MOCK DATA - Only real FlightRadar24 data');
    
    // Check API key
    const hasApiKey = !!process.env.NEXT_PUBLIC_FLIGHTRADAR24_API_KEY;
    console.log('🔑 API Key Status:', hasApiKey ? '✅ Present' : '❌ Missing');
    if (hasApiKey) {
      const key = process.env.NEXT_PUBLIC_FLIGHTRADAR24_API_KEY!;
      console.log('🔑 API Key preview:', key.substring(0, 20) + '...');
    }
    
    try {
      // Fetch aircraft data
      const aircraft = await flightRadar24.getAircraftInSFOArea();
      console.log('✈️ Aircraft Data:');
      console.log(`   - Total aircraft: ${aircraft.length}`);
      console.log(`   - Data source: ${hasApiKey && aircraft.length > 0 ? 'REAL FlightRadar24' : 'EMPTY (no mock data)'}`);
      
      // Show sample aircraft
      if (aircraft.length > 0) {
        aircraft.slice(0, 3).forEach((plane, index) => {
          console.log(`   ${index + 1}. ${plane.callsign} - Alt: ${plane.altitude}ft - Pos: ${plane.lat.toFixed(3)}, ${plane.lng.toFixed(3)}`);
        });
      } else {
        console.log('   - No aircraft to display (API may have failed or no flights in area)');
      }
      
      // Cache info
      const cacheInfo = flightRadar24.getCacheInfo();
      console.log('💾 Cache Info:');
      console.log('   - Cache age:', Math.round(cacheInfo.cacheAge / 1000), 'seconds');
      console.log('   - Cache size:', cacheInfo.cacheSize);
      console.log('   - Error count:', cacheInfo.errorCount);
      console.log('   - Page visible:', cacheInfo.isVisible);
      
      return aircraft;
    } catch (error) {
      console.error('❌ Error fetching aircraft:', error);
      return [];
    }
  },
  
  async testDirectAPI() {
    console.log('🧪 Testing Official FlightRadar24 API:');
    console.log('=====================================');
    
    const apiKey = process.env.NEXT_PUBLIC_FLIGHTRADAR24_API_KEY;
    if (!apiKey) {
      console.log('❌ No API key found in environment variables');
      return;
    }
    
    // Test the official FlightRadar24 API
    const endpoint = 'https://fr24api.flightradar24.com/api/live/flight-positions/light';
    const bounds = `37.9,37.6,-122.7,-122.2`; // SFO area
    const fullUrl = `${endpoint}?bounds=${bounds}`;
    
    try {
      console.log('📡 Testing official authenticated endpoint...');
      console.log('🔗 URL:', fullUrl);
      console.log('🔑 API Key:', apiKey.substring(0, 20) + '...');
      
      const response = await fetch(fullUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept-Version': 'v1',
          'Content-Type': 'application/json',
        },
      });
      
      console.log('📊 Response status:', response.status, response.statusText);
      console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const responseText = await response.text();
        console.log('📊 Raw response length:', responseText.length);
        console.log('📊 Response preview:', responseText.substring(0, 300));
        
        try {
          const data = JSON.parse(responseText);
          console.log('✅ Official API Success!');
          console.log('   - Response structure:', Object.keys(data));
          
          // Count aircraft
          let aircraftCount = 0;
          if (data.data && Array.isArray(data.data)) {
            aircraftCount = data.data.length;
            console.log(`   - Aircraft in data array: ${aircraftCount}`);
            if (aircraftCount > 0) {
              console.log('   - Sample aircraft:', data.data[0]);
            }
          } else if (Array.isArray(data)) {
            aircraftCount = data.length;
            console.log(`   - Aircraft in direct array: ${aircraftCount}`);
          } else {
            const keys = Object.keys(data).filter(key => typeof data[key] === 'object');
            aircraftCount = keys.length;
            console.log(`   - Aircraft as object keys: ${aircraftCount}`);
            if (keys.length > 0) {
              console.log('   - Sample aircraft:', data[keys[0]]);
            }
          }
          
          return data;
        } catch (parseError) {
          console.error('❌ JSON Parse failed:', parseError);
          console.error('❌ Raw text was:', responseText.substring(0, 500));
        }
      } else {
        const errorText = await response.text();
        console.log('❌ Official API failed with status:', response.status);
        console.log('❌ Error body:', errorText);
        
        // Specific error handling
        if (response.status === 401) {
          console.log('🔍 Authentication failed - your API key might be invalid or expired');
        } else if (response.status === 402) {
          console.log('🔍 Insufficient credits - check your subscription balance');
        } else if (response.status === 403) {
          console.log('🔍 Access forbidden - check your subscription plan permissions');
        }
        
        console.log('❌ Response headers:', Object.fromEntries(response.headers.entries()));
      }
    } catch (error) {
      console.error('❌ Fetch failed completely:', error);
      console.error('❌ Error type:', (error as Error).name);
      console.error('❌ Error message:', (error as Error).message);
      
      // Check if it's a network error
      if ((error as Error).message.includes('fetch') || (error as Error).message.includes('network')) {
        console.log('🔍 This might be a network connectivity issue');
      }
    }
  },
  
  async forceRealData() {
    console.log('🔄 FORCING REAL DATA REFRESH...');
    console.log('=====================================');
    
    // Clear any cached data
    (flightRadar24 as any).cache = [];
    (flightRadar24 as any).lastFetch = 0;
    (flightRadar24 as any).errorCount = 0;
    
    // Force fresh fetch
    const aircraft = await flightRadar24.forceRefresh();
    
    console.log(`📊 Force refresh result: ${aircraft.length} aircraft`);
    aircraft.forEach((plane, index) => {
      if (index < 5) {
        console.log(`   ${index + 1}. ${plane.callsign} at ${plane.lat.toFixed(3)}, ${plane.lng.toFixed(3)} - ${plane.altitude}ft`);
      }
    });
    
    return aircraft;
  },
  
  logAircraftPositions(aircraft: any[]) {
    console.log('📍 Aircraft Positions:');
    aircraft.forEach(plane => {
      console.log(`${plane.callsign}: [${plane.lat}, ${plane.lng}] Alt: ${plane.altitude}ft Hdg: ${plane.heading}°`);
    });
  },
  
  async forceRefresh() {
    console.log('🔄 Force refreshing aircraft data...');
    return await flightRadar24.forceRefresh();
  }
};

// Expose to window for browser console access
if (typeof window !== 'undefined') {
  (window as any).debugAircraft = debugAircraft;
  console.log('🔧 Debug utilities available at window.debugAircraft');
  console.log('   Commands:');
  console.log('   - await window.debugAircraft.checkAircraftData()');
  console.log('   - await window.debugAircraft.testDirectAPI()');
  console.log('   - await window.debugAircraft.forceRealData()');
} 