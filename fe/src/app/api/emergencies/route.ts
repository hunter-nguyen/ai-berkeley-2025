import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    // Path to the backend emergencies.json file
    const emergenciesPath = path.join(process.cwd(), '..', 'be', 'emergencies.json');
    
    // Check if file exists
    if (!fs.existsSync(emergenciesPath)) {
      return NextResponse.json([], { status: 200 });
    }
    
    // Read and parse the emergencies file
    const emergenciesData = fs.readFileSync(emergenciesPath, 'utf8');
    const emergencies = JSON.parse(emergenciesData);
    
    // Filter for active emergencies only
    const activeEmergencies = emergencies.filter((emergency: any) => 
      emergency.status === 'ACTIVE'
    );
    
    return NextResponse.json(activeEmergencies, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error reading emergencies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch emergencies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emergencyId, action } = body;
    
    if (!emergencyId || !action) {
      return NextResponse.json(
        { error: 'Missing emergencyId or action' },
        { status: 400 }
      );
    }
    
    // Path to the backend emergencies.json file
    const emergenciesPath = path.join(process.cwd(), '..', 'be', 'emergencies.json');
    
    if (!fs.existsSync(emergenciesPath)) {
      return NextResponse.json(
        { error: 'Emergencies file not found' },
        { status: 404 }
      );
    }
    
    // Read current emergencies
    const emergenciesData = fs.readFileSync(emergenciesPath, 'utf8');
    const emergencies = JSON.parse(emergenciesData);
    
    // Update the emergency based on action
    const updatedEmergencies = emergencies.map((emergency: any) => {
      if (emergency.id === emergencyId) {
        switch (action) {
          case 'acknowledge':
            return {
              ...emergency,
              acknowledged: true,
              status: 'ACKNOWLEDGED',
              updated_at: new Date().toISOString(),
            };
          case 'escalate':
            return {
              ...emergency,
              escalated: true,
              updated_at: new Date().toISOString(),
            };
          case 'resolve':
            return {
              ...emergency,
              status: 'RESOLVED',
              updated_at: new Date().toISOString(),
            };
          default:
            return emergency;
        }
      }
      return emergency;
    });
    
    // Write back to file
    fs.writeFileSync(emergenciesPath, JSON.stringify(updatedEmergencies, null, 2));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating emergency:', error);
    return NextResponse.json(
      { error: 'Failed to update emergency' },
      { status: 500 }
    );
  }
} 