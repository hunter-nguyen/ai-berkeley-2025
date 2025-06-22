import { NextRequest, NextResponse } from 'next/server';

interface ShiftEvent {
  timestamp: string;
  callsign: string;
  message: string;
  isUrgent: boolean;
  runway?: string;
  instruction?: string;
}

interface ShiftData {
  totalMessages: number;
  urgentMessages: number;
  activeAircraft: string[];
  runwayActivity: string[];
  recentEvents: ShiftEvent[];
  lastUpdated: string;
}

// In-memory storage (in production, use a database)
let shiftData: ShiftData = {
  totalMessages: 0,
  urgentMessages: 0,
  activeAircraft: [],
  runwayActivity: [],
  recentEvents: [],
  lastUpdated: new Date().toISOString()
};

export async function GET() {
  return NextResponse.json({
    success: true,
    data: shiftData
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.type === 'add_event') {
      const event: ShiftEvent = {
        timestamp: new Date().toISOString(),
        callsign: body.callsign,
        message: body.message,
        isUrgent: body.isUrgent || false,
        runway: body.runway,
        instruction: body.instruction
      };
      
      // Add to recent events (keep last 20)
      shiftData.recentEvents = [event, ...shiftData.recentEvents.slice(0, 19)];
      
      // Update counters
      shiftData.totalMessages += 1;
      if (event.isUrgent) {
        shiftData.urgentMessages += 1;
      }
      
      // Update active aircraft
      if (!shiftData.activeAircraft.includes(event.callsign)) {
        shiftData.activeAircraft.push(event.callsign);
      }
      
      // Update runway activity
      if (event.runway && !shiftData.runwayActivity.includes(event.runway)) {
        shiftData.runwayActivity.push(event.runway);
      }
      
      shiftData.lastUpdated = new Date().toISOString();
      
      return NextResponse.json({
        success: true,
        message: 'Event added successfully',
        data: shiftData
      });
    }
    
    if (body.type === 'update_data') {
      // Allow bulk updates
      shiftData = {
        ...shiftData,
        ...body.data,
        lastUpdated: new Date().toISOString()
      };
      
      return NextResponse.json({
        success: true,
        message: 'Data updated successfully',
        data: shiftData
      });
    }
    
    if (body.type === 'reset') {
      // Reset all data
      shiftData = {
        totalMessages: 0,
        urgentMessages: 0,
        activeAircraft: [],
        runwayActivity: [],
        recentEvents: [],
        lastUpdated: new Date().toISOString()
      };
      
      return NextResponse.json({
        success: true,
        message: 'Data reset successfully',
        data: shiftData
      });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Invalid request type'
    }, { status: 400 });
    
  } catch (error) {
    console.error('Error processing shift data:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}

export async function DELETE() {
  // Reset data
  shiftData = {
    totalMessages: 0,
    urgentMessages: 0,
    activeAircraft: [],
    runwayActivity: [],
    recentEvents: [],
    lastUpdated: new Date().toISOString()
  };
  
  return NextResponse.json({
    success: true,
    message: 'All data cleared',
    data: shiftData
  });
} 