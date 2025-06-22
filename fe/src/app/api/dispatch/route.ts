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

function getEmergencyProtocols(): any {
  const protocolsPath = path.join(process.cwd(), '..', 'be', 'emergency_protocols.json');
  try {
    if (fs.existsSync(protocolsPath)) {
      return JSON.parse(fs.readFileSync(protocolsPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading emergency protocols:', error);
  }
  
  // Default protocols
  return {
    'general_emergency': {
      priority: 'high',
      recipients: ['airport_ops'],
      script: 'General emergency declared by {callsign}. Nature: {description}.'
    }
  };
}

function getDispatchConfigs(): any {
  const configsPath = path.join(process.cwd(), '..', 'be', 'dispatch_configs.json');
  try {
    if (fs.existsSync(configsPath)) {
      return JSON.parse(fs.readFileSync(configsPath, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading dispatch configs:', error);
  }
  
  // Default configs
  return {
    emergency_services: {
      airport_ops: '+1-650-821-7014',
      fire_rescue: '+1-650-599-1378',
      medical: '+1-650-821-5151'
    },
    default_recipient: 'airport_ops'
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alertId, callsign, emergencyType, description, originalMessage } = body;

    console.log(`🚨 DISPATCH REQUEST: ${callsign} - ${emergencyType}`);

    // Load emergency protocols
    const protocols = getEmergencyProtocols();
    const protocol = protocols[emergencyType] || protocols['general_emergency'];

    // Determine recipient and phone number
    const recipients = protocol.recipients || ['airport_ops'];
    const primaryRecipient = recipients[0];
    
    const dispatchConfigs = getDispatchConfigs();
    const phoneNumber = dispatchConfigs.emergency_services[primaryRecipient] || 
                       dispatchConfigs.emergency_services[dispatchConfigs.default_recipient];

    // Generate emergency script
    const script = protocol.script
      .replace('{callsign}', callsign)
      .replace('{description}', description)
      .replace('{emergency_type}', emergencyType);

    // Create emergency data structure for MayDay assistant
    const emergencyData = {
      dispatch_id: `dispatch_${Date.now()}_${alertId.slice(0, 8)}`,
      alert_id: alertId,
      callsign: callsign,
      emergency_type: emergencyType,
      airport_code: "KSFO", // Could be dynamic based on your setup
      urgency_level: protocol.priority === 'critical' ? 'critical' : 
                    protocol.priority === 'high' ? 'high' : 'medium',
      timestamp: new Date().toISOString(),
      description: description,
      original_message: originalMessage,
      recipients: recipients,
      protocol: protocol,
      details: {
        location: "KSFO Tower Control",
        reported_by: "ATC System",
        contact_info: "KSFO Tower +1-650-876-2778",
        script: script
      }
    };

    // Create dispatch record
    const dispatchRecord: DispatchRecord = {
      id: emergencyData.dispatch_id,
      alert_id: alertId,
      callsign,
      emergency_type: emergencyType,
      description,
      call_recipient: primaryRecipient,
      call_status: 'pending',
      initiated_at: new Date().toISOString()
    };

    // Make VAPI call with proper emergency data
    const vapiSuccess = await makeRealVAPICall(phoneNumber, emergencyData, script);
    
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
      emergency_data: emergencyData,
      mayday_variables: {
        emergency_data: JSON.stringify(emergencyData),
        emergency_type: emergencyType,
        airport_code: emergencyData.airport_code,
        urgency_level: emergencyData.urgency_level,
        timestamp: emergencyData.timestamp
      }
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

async function makeRealVAPICall(phoneNumber: string, emergencyData: any, script: string): Promise<{
  success: boolean;
  callId?: string;
  error?: string;
}> {
  // Get VAPI credentials from environment
  const vapiToken = process.env.VAPI_API_KEY || process.env.VAPI_TOKEN;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID; // Your VAPI phone number ID
  
  if (!vapiToken || !assistantId) {
    console.log(`🔄 SIMULATED VAPI CALL to ${phoneNumber} (Missing credentials)`);
    console.log(`🔧 Variables would be passed to MayDay assistant:`);
    console.log(`   - emergency_type: ${emergencyData.emergency_type}`);
    console.log(`   - airport_code: ${emergencyData.airport_code}`);
    console.log(`   - urgency_level: ${emergencyData.urgency_level}`);
    console.log(`   - callsign: ${emergencyData.callsign}`);
    
    // Fallback to simulation if credentials missing
    return {
      success: true,
      callId: `sim_call_${Date.now()}`
    };
  }

  try {
    console.log(`📞 MAKING REAL VAPI CALL to ${phoneNumber}`);
    console.log(`🎯 Assistant ID: ${assistantId.slice(0, 8)}...`);
    console.log(`🚨 Emergency Data:`, emergencyData);

    // Correct VAPI API call format for MayDay assistant
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: assistantId,
        customer: {
          number: phoneNumber
        },
        phoneNumberId: vapiPhoneNumberId,
        assistantOverrides: {
          variableValues: {
            // MayDay assistant expected variables
            emergency_data: JSON.stringify(emergencyData),
            emergency_type: emergencyData.emergency_type,
            airport_code: emergencyData.airport_code,
            urgency_level: emergencyData.urgency_level,
            timestamp: emergencyData.timestamp,
            
            // Additional context
            dispatch_id: emergencyData.dispatch_id,
            phone_number: phoneNumber,
            script_details: script
          }
        }
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ VAPI CALL SUCCESS: ${result.id}`);
      console.log(`📋 Variables passed to MayDay assistant:
        - emergency_data: ${JSON.stringify(emergencyData)}
        - emergency_type: ${emergencyData.emergency_type}
        - airport_code: ${emergencyData.airport_code}
        - urgency_level: ${emergencyData.urgency_level}
        - timestamp: ${emergencyData.timestamp}`);
      
      return {
        success: true,
        callId: result.id
      };
    } else {
      const errorText = await response.text();
      console.error(`❌ VAPI CALL FAILED: ${response.status} - ${errorText}`);
      return {
        success: false,
        error: `${response.status} - ${errorText}`
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