import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface DispatchRequest {
  alertId: string;
  callsign: string;
  emergencyType: string;
  description: string;
  originalMessage: string;
}

interface DispatchRecord {
  id: string;
  alert_id: string;
  callsign: string;
  emergency_type: string;
  description: string;
  call_recipient: string;
  call_status: string;
  call_id?: string;
  initiated_at: string;
  completed_at?: string;
  call_duration?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: DispatchRequest = await request.json();
    const { alertId, callsign, emergencyType, description, originalMessage } = body;
    
    if (!alertId || !callsign || !emergencyType) {
      return NextResponse.json(
        { error: 'Missing required fields: alertId, callsign, emergencyType' },
        { status: 400 }
      );
    }

    // Load emergency protocols
    const protocolsPath = path.join(process.cwd(), '..', 'be', 'emergency_protocols.json');
    const configsPath = path.join(process.cwd(), '..', 'be', 'dispatch_configs.json');
    
    let protocols: any = {};
    let configs: any = {};
    
    try {
      if (fs.existsSync(protocolsPath)) {
        protocols = JSON.parse(fs.readFileSync(protocolsPath, 'utf8'));
      }
      if (fs.existsSync(configsPath)) {
        configs = JSON.parse(fs.readFileSync(configsPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading dispatch configurations:', error);
    }

    // Get protocol for this emergency type
    const protocol = protocols[emergencyType] || protocols['general_emergency'] || {
      priority: 'high',
      recipients: ['airport_ops'],
      script: 'General emergency declared by {callsign}. Nature: {description}.'
    };

    // Determine recipient
    const recipients = protocol.recipients || ['airport_ops'];
    const primaryRecipient = recipients[0];
    const emergencyServices = configs.emergency_services || {
      airport_ops: '+1-650-821-7014',
      fire_rescue: '+1-650-599-1378',
      medical: '+1-650-821-5151'
    };
    
    const phoneNumber = emergencyServices[primaryRecipient] || emergencyServices['airport_ops'];

    // Generate call script
    const script = generateCallScript({
      callsign,
      description,
      originalMessage,
      protocol
    });

    // Create dispatch record
    const dispatchRecord: DispatchRecord = {
      id: `dispatch_${Date.now()}_${alertId.slice(0, 8)}`,
      alert_id: alertId,
      callsign,
      emergency_type: emergencyType,
      description,
      call_recipient: primaryRecipient,
      call_status: 'pending',
      initiated_at: new Date().toISOString()
    };

    // Simulate VAPI call (replace with actual VAPI integration)
    const vapiSuccess = await makeRealVAPICall(phoneNumber, script, dispatchRecord.id);
    
    if (vapiSuccess.success) {
      dispatchRecord.call_status = 'calling';
      dispatchRecord.call_id = vapiSuccess.callId;
    } else {
      dispatchRecord.call_status = 'failed';
    }

    // Save dispatch record
    saveDispatchRecord(dispatchRecord);

    // Update the original emergency as dispatched
    updateEmergencyStatus(alertId, 'dispatched');

    console.log(`🚨 EMERGENCY DISPATCH: ${callsign} - ${emergencyType} - ${dispatchRecord.call_status}`);

    return NextResponse.json({
      success: true,
      dispatch_id: dispatchRecord.id,
      call_status: dispatchRecord.call_status,
      call_id: dispatchRecord.call_id,
      recipient: primaryRecipient,
      script: script
    });

  } catch (error) {
    console.error('Error dispatching emergency call:', error);
    return NextResponse.json(
      { error: 'Failed to dispatch emergency call' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Read dispatch records
    const recordsPath = path.join(process.cwd(), '..', 'be', 'dispatch_records.json');
    
    if (!fs.existsSync(recordsPath)) {
      return NextResponse.json([], { status: 200 });
    }
    
    const recordsData = fs.readFileSync(recordsPath, 'utf8');
    const records = JSON.parse(recordsData);
    
    // Return most recent records
    const recentRecords = records.slice(-limit).reverse();
    
    return NextResponse.json(recentRecords, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error fetching dispatch records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dispatch records' },
      { status: 500 }
    );
  }
}

function generateCallScript(data: {
  callsign: string;
  description: string;
  originalMessage: string;
  protocol: any;
}): string {
  const { callsign, description, originalMessage, protocol } = data;
  
  // Extract souls on board if mentioned
  let souls = 'unknown number of';
  if (originalMessage && originalMessage.toLowerCase().includes('souls')) {
    const soulsMatch = originalMessage.match(/(\d+)\s*souls/i);
    if (soulsMatch) {
      souls = soulsMatch[1];
    }
  }

  // Format the script
  let script = protocol.script || 'Emergency situation reported for {callsign}';
  script = script
    .replace('{callsign}', callsign)
    .replace('{description}', description)
    .replace('{souls}', souls)
    .replace('{timestamp}', new Date().toLocaleTimeString('en-US', {
      hour12: false,
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' UTC');

  // Add original ATC message context
  if (originalMessage) {
    script += ` Original ATC communication: "${originalMessage}"`;
  }

  return script;
}

async function makeRealVAPICall(phoneNumber: string, script: string, dispatchId: string): Promise<{
  success: boolean;
  callId?: string;
  error?: string;
}> {
  // Get VAPI credentials from environment
  const vapiToken = process.env.VAPI_API_KEY || process.env.VAPI_TOKEN;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  
  if (!vapiToken || !assistantId) {
    console.log(`🔄 SIMULATED VAPI CALL to ${phoneNumber} (Missing credentials)`);
    console.log(`📞 Script: ${script}`);
    
    // Fallback to simulation if credentials missing
    return {
      success: true,
      callId: `sim_call_${Date.now()}`
    };
  }

  try {
    console.log(`📞 MAKING REAL VAPI CALL to ${phoneNumber}`);
    console.log(`🎯 Assistant ID: ${assistantId}`);
    console.log(`📜 Script: ${script}`);

    // Real VAPI call to their API
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: assistantId,
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: phoneNumber
        },
        assistantOverrides: {
          firstMessage: `This is an automated emergency dispatch from San Francisco International Airport Air Traffic Control. ${script}`,
          variableValues: {
            dispatch_id: dispatchId,
            emergency_script: script,
            priority: 'emergency',
            caller_id: 'SFO_ATC_Emergency_Dispatch'
          }
        }
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ VAPI CALL SUCCESS: ${result.id}`);
      return {
        success: true,
        callId: result.id
      };
    } else {
      const errorText = await response.text();
      console.error(`❌ VAPI CALL FAILED: ${response.status} - ${errorText}`);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }

  } catch (error) {
    console.error('❌ VAPI call exception:', error);
    return {
      success: false,
      error: String(error)
    };
  }
}

function saveDispatchRecord(record: DispatchRecord) {
  try {
    const recordsPath = path.join(process.cwd(), '..', 'be', 'dispatch_records.json');
    
    let records: DispatchRecord[] = [];
    if (fs.existsSync(recordsPath)) {
      const data = fs.readFileSync(recordsPath, 'utf8');
      records = JSON.parse(data);
    }
    
    records.push(record);
    
    // Keep only last 100 records
    if (records.length > 100) {
      records = records.slice(-100);
    }
    
    fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
  } catch (error) {
    console.error('Error saving dispatch record:', error);
  }
}

function updateEmergencyStatus(alertId: string, status: string) {
  try {
    const emergenciesPath = path.join(process.cwd(), '..', 'be', 'emergencies.json');
    
    if (!fs.existsSync(emergenciesPath)) {
      return;
    }
    
    const data = fs.readFileSync(emergenciesPath, 'utf8');
    const emergencies = JSON.parse(data);
    
    const updatedEmergencies = emergencies.map((emergency: any) => {
      if (emergency.id === alertId) {
        return {
          ...emergency,
          dispatched: true,
          escalated: true,
          status: 'DISPATCHED',
          updated_at: new Date().toISOString()
        };
      }
      return emergency;
    });
    
    fs.writeFileSync(emergenciesPath, JSON.stringify(updatedEmergencies, null, 2));
  } catch (error) {
    console.error('Error updating emergency status:', error);
  }
} 