import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface TranscriptRequest {
  transcript: string;
  isEmergency: boolean;
}

interface EmergencyAlert {
  id: string;
  timestamp: string;
  source_message_id: string;
  source_timestamp: string;
  callsign: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'EMERGENCY' | 'ALERT' | 'WARNING' | 'REPORT';
  emergency_type: string;
  description: string;
  original_message: string;
  raw_transcript: string;
  recommended_actions: string[];
  confidence: number;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledged: boolean;
  escalated: boolean;
  atc_data: any;
  created_by: string;
  updated_at: string;
}

interface ATCData {
  callsigns: Array<{
    callsign: string;
    airline?: string;
    flight_number?: string;
    aircraft_type?: string;
  }>;
  instructions: Array<{
    type: string;
    callsign: string;
    instruction: string;
    runway?: string;
    details?: string;
  }>;
  runways: string[];
  frequencies: string[];
  weather_info?: any;
  emergencies?: string;
  summary: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: TranscriptRequest = await request.json();
    const { transcript, isEmergency } = body;
    
    if (!transcript || transcript.length < 5) {
      return NextResponse.json(
        { error: 'Invalid transcript' },
        { status: 400 }
      );
    }

    console.log('🎤 Processing microphone transcript:', transcript);
    console.log('🚨 Emergency detected:', isEmergency);

    // Process with ASI:One AI for structured data extraction
    const asiOneData = await processWithASIOne(transcript);
    console.log('🤖 ASI:One processed data:', asiOneData);

    // Extract flight information from ASI:One data or fallback to manual extraction
    const flightInfo = asiOneData.callsigns.length > 0 
      ? asiOneData.callsigns[0] 
      : extractFlightInfo(transcript);
    
    const emergencyType = asiOneData.emergencies || detectEmergencyType(transcript);
    const category = determineCategory(emergencyType);
    
    // Check if we should create an alert (emergency, warning, or report)
    const shouldCreate = isEmergency || shouldCreateAlert(transcript, emergencyType);
    
    if (!shouldCreate) {
      return NextResponse.json({ 
        success: true, 
        message: 'Transcript processed - no alert needed',
        emergency_created: false,
        asiOne_data: asiOneData,
        aircraft_mentioned: asiOneData.callsigns.length > 0 ? asiOneData.callsigns[0].callsign : null
      });
    }

    // Create alert (emergency, warning, or report)
    const emergency: EmergencyAlert = {
      id: `${category.toLowerCase()}_mic_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      source_message_id: `mic_${Date.now()}`,
      source_timestamp: new Date().toISOString(),
      callsign: flightInfo.callsign,
      severity: determineSeverity(emergencyType),
      category: category,
      emergency_type: emergencyType,
      description: generateDescription(emergencyType, transcript),
      original_message: transcript,
      raw_transcript: transcript,
      recommended_actions: getRecommendedActions(emergencyType),
      confidence: 0.95, // High confidence since manually spoken
      status: 'ACTIVE',
      acknowledged: false,
      escalated: false,
      atc_data: asiOneData,
      created_by: 'microphone_demo_system',
      updated_at: new Date().toISOString()
    };

    // Save to emergencies.json
    const emergenciesPath = path.join(process.cwd(), '..', 'be', 'emergencies.json');
    
    let emergencies: EmergencyAlert[] = [];
    if (fs.existsSync(emergenciesPath)) {
      const data = fs.readFileSync(emergenciesPath, 'utf8');
      emergencies = JSON.parse(data);
    }
    
    // Add new emergency at the beginning
    emergencies.unshift(emergency);
    
    // Keep only last 50 emergencies
    emergencies = emergencies.slice(0, 50);
    
    // Save back to file
    fs.writeFileSync(emergenciesPath, JSON.stringify(emergencies, null, 2));

    console.log('🚨 Emergency alert created:', emergency.id);
    console.log('📋 Alert details:', {
      callsign: emergency.callsign,
      type: emergency.emergency_type,
      severity: emergency.severity,
      category: emergency.category
    });

    return NextResponse.json({
      success: true,
      emergency_created: true,
      alert_created: true,
      emergency_id: emergency.id,
      alert_id: emergency.id,
      callsign: emergency.callsign,
      emergency_type: emergency.emergency_type,
      alert_type: emergency.emergency_type,
      severity: emergency.severity,
      category: emergency.category,
      asiOne_data: asiOneData,
      aircraft_mentioned: flightInfo.callsign
    });

  } catch (error) {
    console.error('❌ Error processing transcript:', error);
    return NextResponse.json(
      { error: 'Failed to process transcript' },
      { status: 500 }
    );
  }
}

async function processWithASIOne(transcript: string): Promise<ATCData> {
  try {
    const fetchApiKey = process.env.FETCH_API_KEY;
    if (!fetchApiKey) {
      console.warn('⚠️ FETCH_API_KEY not found, using fallback processing');
      return createFallbackATCData(transcript);
    }

    const prompt = `You are an expert Air Traffic Control (ATC) communication analyzer. Extract structured data from this radio communication transcript.

TRANSCRIPT: "${transcript}"

IMPORTANT CALLSIGN EXTRACTION RULES:
- "d a l 772" = "DAL772" (Delta Airlines)
- "u a l 1234" = "UAL1234" (United Airlines) 
- "a a l 445" = "AAL445" (American Airlines)
- "s w a 789" = "SWA789" (Southwest Airlines)
- "j b u 567" = "JBU567" (JetBlue)
- "a s a 890" = "ASA890" (Alaska Airlines)
- "cessna 1 2 3 4" = "CESSNA1234"
- "american 445" = "AAL445"
- "united 1234" = "UAL1234"
- "delta 567" = "DAL567"
- "southwest 789" = "SWA789"
- Any spaced 3-letter code like "x y z 123" = "XYZ123"

Extract and return ONLY a JSON object with this exact structure:
{
  "callsigns": [
    {
      "callsign": "EXACT_CALLSIGN_NO_SPACES",
      "airline": "airline_name_if_identifiable", 
      "flight_number": "number_only",
      "aircraft_type": "light|medium|heavy"
    }
  ],
  "instructions": [
    {
      "type": "emergency_type_or_instruction_type",
      "callsign": "EXACT_CALLSIGN_NO_SPACES",
      "instruction": "main_instruction_or_request",
      "runway": "runway_if_mentioned",
      "details": "additional_details"
    }
  ],
  "runways": ["runway_numbers_mentioned"],
  "frequencies": ["emergency_or_frequency_mentioned"],
  "weather_info": null,
  "emergencies": "emergency_type_if_present",
  "summary": "brief_summary_of_communication"
}

CRITICAL: 
- Convert spaced letters to proper callsigns (d a l 772 → DAL772)
- Identify emergency types: mayday_call, engine_failure, medical_emergency, fuel_emergency, etc.
- Include souls on board in details if mentioned
- Return ONLY valid JSON, no other text or explanations`;

    const response = await fetch('https://api.asi1.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fetchApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model: 'asi1-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error(`ASI:One API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content from ASI:One API');
    }

    // Clean and parse JSON
    let cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
    
    // Handle cases where ASI:One returns explanatory text before JSON
    const jsonStart = cleanContent.indexOf('{');
    const jsonEnd = cleanContent.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
    }
    
    const parsedData = JSON.parse(cleanContent);
    
    console.log('✅ ASI:One processing successful');
    return parsedData;

  } catch (error) {
    console.error('❌ ASI:One processing failed:', error);
    return createFallbackATCData(transcript);
  }
}

function createFallbackATCData(transcript: string): ATCData {
  const flightInfo = extractFlightInfo(transcript);
  const emergencyType = detectEmergencyType(transcript);
  const runway = extractRunway(transcript);
  
  return {
    callsigns: [{
      callsign: flightInfo.callsign,
      airline: flightInfo.airline || undefined,
      flight_number: flightInfo.flightNumber || undefined,
      aircraft_type: flightInfo.aircraftType
    }],
    instructions: [{
      type: emergencyType,
      callsign: flightInfo.callsign,
      instruction: extractInstruction(transcript),
      runway: runway || undefined,
      details: flightInfo.souls ? `${flightInfo.souls} souls on board` : undefined
    }],
    runways: runway ? [runway] : [],
    frequencies: ['emergency'],
    weather_info: null,
    emergencies: emergencyType,
    summary: `MICROPHONE TRANSCRIPT - ${emergencyType} detected for ${flightInfo.callsign}`
  };
}

function extractFlightInfo(transcript: string) {
  const text = transcript.toLowerCase();
  
  // Extract callsign patterns - IMPROVED for spaced letters
  const callsignPatterns = [
    // Normal airline names
    /\b(american|united|delta|southwest|alaska|jetblue|spirit|frontier)\s+(\d+)/i,
    
    // Standard ICAO codes
    /\b(aal|ual|dal|swa|asa|jbu|nks|fft)\s*(\d+)/i,
    
    // General aviation
    /\b(cessna|piper|beech|cirrus)\s+(\d+)/i,
    
    // Fallback patterns
    /\b([a-z]{2,3})\s*(\d{1,4})\b/i
  ];
  
  let callsign = 'UNKNOWN';
  let airline = '';
  let flightNumber = '';
  
  // Check for spaced airline codes first
  const spacedDalMatch = text.match(/\bd\s+a\s+l\s+(\d+)/i);
  if (spacedDalMatch) {
    airline = 'DAL';
    flightNumber = spacedDalMatch[1];
    callsign = `DAL${flightNumber}`;
    console.log('🎯 Matched spaced DAL:', callsign);
  } else {
    const spacedUalMatch = text.match(/\bu\s+a\s+l\s+(\d+)/i);
    if (spacedUalMatch) {
      airline = 'UAL';
      flightNumber = spacedUalMatch[1];
      callsign = `UAL${flightNumber}`;
      console.log('🎯 Matched spaced UAL:', callsign);
    } else {
      const spacedAalMatch = text.match(/\ba\s+a\s+l\s+(\d+)/i);
      if (spacedAalMatch) {
        airline = 'AAL';
        flightNumber = spacedAalMatch[1];
        callsign = `AAL${flightNumber}`;
        console.log('🎯 Matched spaced AAL:', callsign);
      } else {
        const spacedSwaMatch = text.match(/\bs\s+w\s+a\s+(\d+)/i);
        if (spacedSwaMatch) {
          airline = 'SWA';
          flightNumber = spacedSwaMatch[1];
          callsign = `SWA${flightNumber}`;
          console.log('🎯 Matched spaced SWA:', callsign);
        } else {
          // Check for other common spaced patterns
          const spacedJbuMatch = text.match(/\bj\s+b\s+u\s+(\d+)/i); // JetBlue
          if (spacedJbuMatch) {
            airline = 'JBU';
            flightNumber = spacedJbuMatch[1];
            callsign = `JBU${flightNumber}`;
            console.log('🎯 Matched spaced JBU:', callsign);
          } else {
            const spacedAsaMatch = text.match(/\ba\s+s\s+a\s+(\d+)/i); // Alaska
            if (spacedAsaMatch) {
              airline = 'ASA';
              flightNumber = spacedAsaMatch[1];
              callsign = `ASA${flightNumber}`;
              console.log('🎯 Matched spaced ASA:', callsign);
            } else {
              // Check for spaced cessna: "cessna 1 2 3 4"
              const spacedCessnaMatch = text.match(/\b(cessna|piper|beech|cirrus)\s+(\d+|\d\s+\d\s+\d\s+\d|\d\s+\d\s+\d|\d\s+\d)/i);
              if (spacedCessnaMatch) {
                airline = spacedCessnaMatch[1].toUpperCase();
                flightNumber = spacedCessnaMatch[2].replace(/\s+/g, ''); // Remove spaces from number
                callsign = `${airline}${flightNumber}`;
                console.log('🎯 Matched spaced GA aircraft:', callsign);
              } else {
                // Check for generic 3-letter spaced codes: "x y z 123"
                const genericSpacedMatch = text.match(/\b([a-z])\s+([a-z])\s+([a-z])\s+(\d+)/i);
                if (genericSpacedMatch) {
                  airline = `${genericSpacedMatch[1]}${genericSpacedMatch[2]}${genericSpacedMatch[3]}`.toUpperCase();
                  flightNumber = genericSpacedMatch[4];
                  callsign = `${airline}${flightNumber}`;
                  console.log('🎯 Matched generic spaced code:', callsign);
                } else {
                  // Fall back to regular patterns
                  for (const pattern of callsignPatterns) { // Use all patterns now
                    const match = transcript.match(pattern);
                    if (match) {
                      airline = match[1];
                      flightNumber = match[2];
                      callsign = `${airline.toUpperCase()}${flightNumber}`;
                      console.log('🎯 Matched regular pattern:', callsign);
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Extract souls on board
  const soulsMatch = transcript.match(/(\d+)\s*souls/i);
  const souls = soulsMatch ? soulsMatch[1] : null;
  
  // Determine aircraft type based on souls or aircraft type
  let aircraftType = 'medium';
  if (souls) {
    const soulCount = parseInt(souls);
    if (soulCount > 200) aircraftType = 'heavy';
    else if (soulCount < 100) aircraftType = 'light';
  } else if (airline.toLowerCase().includes('cessna') || airline.toLowerCase().includes('piper') || airline.toLowerCase().includes('beech') || airline.toLowerCase().includes('cirrus')) {
    aircraftType = 'light';
  }
  
  console.log('🛩️ Extracted flight info:', { callsign, airline, flightNumber, souls, aircraftType });
  
  return { callsign, airline, flightNumber, souls, aircraftType };
}

function detectEmergencyType(transcript: string): string {
  const text = transcript.toLowerCase();
  
  // Emergency types (highest priority)
  const emergencyTypes = {
    'mayday_call': ['mayday'],
    'engine_failure': ['engine failure', 'engine fire', 'lost engine', 'engine out'],
    'bird_strike': ['bird strike', 'bird hit'],
    'medical_emergency': ['medical emergency', 'cardiac arrest', 'passenger down', 'medical'],
    'fuel_emergency': ['fuel emergency', 'minimum fuel', 'low fuel'],
    'fire_emergency': ['fire', 'smoke in cabin', 'smoke'],
    'hydraulic_failure': ['hydraulic failure', 'hydraulic'],
    'pressurization_emergency': ['pressurization', 'cabin pressure'],
    'security_threat': ['hijack', 'security threat', 'suspicious'],
    'general_emergency': ['emergency', 'pan pan', 'declaring emergency']
  };
  
  // Warning types (medium priority)
  const warningTypes = {
    'weather_warning': ['severe weather', 'turbulence', 'windshear', 'microburst', 'thunderstorm'],
    'equipment_warning': ['equipment malfunction', 'system failure', 'warning light', 'caution'],
    'traffic_warning': ['traffic alert', 'tcas', 'collision avoidance', 'traffic'],
    'altitude_warning': ['altitude deviation', 'wrong altitude', 'climb immediately'],
    'navigation_warning': ['navigation error', 'off course', 'waypoint', 'gps'],
    'communication_warning': ['radio failure', 'comm failure', 'lost communication']
  };
  
  // Report types (informational)
  const reportTypes = {
    'pirep_turbulence': ['pirep', 'pilot report', 'turbulence report', 'smooth', 'light chop', 'moderate turbulence'],
    'pirep_weather': ['icing', 'cloud tops', 'visibility', 'weather report'],
    'pirep_winds': ['wind report', 'headwind', 'tailwind', 'crosswind'],
    'incident_report': ['incident', 'unusual occurrence', 'deviation', 'violation'],
    'maintenance_report': ['maintenance', 'mechanical issue', 'inspection', 'logbook'],
    'operational_report': ['delay', 'gate change', 'passenger issue', 'ground stop']
  };
  
  // Check emergencies first
  for (const [type, keywords] of Object.entries(emergencyTypes)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return type;
    }
  }
  
  // Check warnings
  for (const [type, keywords] of Object.entries(warningTypes)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return type;
    }
  }
  
  // Check reports
  for (const [type, keywords] of Object.entries(reportTypes)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return type;
    }
  }
  
  return 'general_communication';
}

function determineSeverity(emergencyType: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const criticalTypes = ['mayday_call', 'engine_failure', 'fire_emergency', 'medical_emergency'];
  const highTypes = ['bird_strike', 'fuel_emergency', 'hydraulic_failure', 'security_threat', 'weather_warning', 'equipment_warning'];
  const mediumTypes = ['traffic_warning', 'altitude_warning', 'navigation_warning', 'communication_warning', 'incident_report'];
  
  if (criticalTypes.includes(emergencyType)) return 'CRITICAL';
  if (highTypes.includes(emergencyType)) return 'HIGH';
  if (mediumTypes.includes(emergencyType)) return 'MEDIUM';
  return 'LOW';
}

function determineCategory(emergencyType: string): 'EMERGENCY' | 'WARNING' | 'REPORT' | 'ALERT' {
  const emergencyTypes = ['mayday_call', 'engine_failure', 'fire_emergency', 'medical_emergency', 'bird_strike', 'fuel_emergency', 'hydraulic_failure', 'pressurization_emergency', 'security_threat', 'general_emergency'];
  const warningTypes = ['weather_warning', 'equipment_warning', 'traffic_warning', 'altitude_warning', 'navigation_warning', 'communication_warning'];
  const reportTypes = ['pirep_turbulence', 'pirep_weather', 'pirep_winds', 'incident_report', 'maintenance_report', 'operational_report'];
  
  if (emergencyTypes.includes(emergencyType)) return 'EMERGENCY';
  if (warningTypes.includes(emergencyType)) return 'WARNING';
  if (reportTypes.includes(emergencyType)) return 'REPORT';
  return 'ALERT';
}

function shouldCreateAlert(transcript: string, emergencyType: string): boolean {
  // Don't create alerts for general communication
  if (emergencyType === 'general_communication') return false;
  
  // Create alerts for all emergencies, warnings, and reports
  return true;
}

function generateDescription(emergencyType: string, transcript: string): string {
  const descriptions: Record<string, string> = {
    // Emergency descriptions
    'mayday_call': 'MAYDAY emergency call - life threatening situation',
    'engine_failure': 'Engine failure reported - aircraft requesting emergency landing',
    'bird_strike': 'Bird strike on departure - aircraft returning to field',
    'medical_emergency': 'Medical emergency aboard - immediate medical response required',
    'fuel_emergency': 'Fuel emergency declared - minimum fuel remaining',
    'fire_emergency': 'Fire/smoke emergency - immediate response required',
    'hydraulic_failure': 'Hydraulic system failure - landing gear/control issues possible',
    'pressurization_emergency': 'Cabin pressurization emergency - descending to safe altitude',
    'security_threat': 'Security threat reported - law enforcement required',
    'general_emergency': 'General emergency declared - nature to be determined',
    
    // Warning descriptions
    'weather_warning': 'Severe weather conditions reported - possible hazard to flight',
    'equipment_warning': 'Equipment malfunction or system warning - monitoring required',
    'traffic_warning': 'Traffic conflict or TCAS alert - separation issue',
    'altitude_warning': 'Altitude deviation or clearance issue - immediate correction needed',
    'navigation_warning': 'Navigation system issue or course deviation',
    'communication_warning': 'Radio or communication system failure',
    
    // Report descriptions
    'pirep_turbulence': 'Pilot report - turbulence conditions',
    'pirep_weather': 'Pilot report - weather conditions (icing, visibility, clouds)',
    'pirep_winds': 'Pilot report - wind conditions and advisories',
    'incident_report': 'Incident or unusual occurrence reported',
    'maintenance_report': 'Maintenance issue or mechanical problem reported',
    'operational_report': 'Operational report - delays, gate changes, or passenger issues'
  };
  
  return descriptions[emergencyType] || 'Alert reported - details in transcript';
}

function getRecommendedActions(emergencyType: string): string[] {
  const actions: Record<string, string[]> = {
    // Emergency actions
    'mayday_call': [
      'Deploy all emergency services immediately',
      'Clear airspace for priority approach',
      'Alert fire rescue, medical, and airport operations',
      'Prepare for emergency landing'
    ],
    'engine_failure': [
      'Deploy emergency vehicles to runway',
      'Clear runway for emergency approach',
      'Alert fire rescue teams',
      'Coordinate emergency landing approach'
    ],
    'bird_strike': [
      'Inspect aircraft for damage assessment',
      'Prepare runway for emergency return',
      'Alert fire rescue as precaution',
      'Coordinate with pilot for approach'
    ],
    'medical_emergency': [
      'Alert medical emergency teams',
      'Prepare ambulance at gate',
      'Priority landing clearance',
      'Coordinate with paramedics'
    ],
    'fuel_emergency': [
      'Clear airspace for priority approach',
      'Prepare for immediate landing',
      'Alert emergency vehicles as precaution',
      'Monitor fuel status'
    ],
    
    // Warning actions
    'weather_warning': [
      'Issue weather advisories to other aircraft',
      'Monitor conditions closely',
      'Consider alternate routing',
      'Update ATIS/weather information'
    ],
    'equipment_warning': [
      'Monitor aircraft status',
      'Provide vectors as needed',
      'Alert maintenance when aircraft lands',
      'Consider priority handling if needed'
    ],
    'traffic_warning': [
      'Verify aircraft separation',
      'Issue traffic advisories',
      'Provide vectors for separation',
      'Monitor closely until resolved'
    ],
    'altitude_warning': [
      'Issue immediate altitude correction',
      'Verify pilot acknowledgment',
      'Monitor compliance',
      'Coordinate with other sectors if needed'
    ],
    'navigation_warning': [
      'Provide vectors to correct course',
      'Verify navigation equipment status',
      'Offer alternate navigation aids',
      'Monitor until back on course'
    ],
    'communication_warning': [
      'Attempt contact on alternate frequencies',
      'Coordinate with adjacent sectors',
      'Monitor for restoration of communications',
      'Use light signals if necessary'
    ],
    
    // Report actions
    'pirep_turbulence': [
      'Disseminate turbulence report to other aircraft',
      'Update weather briefings',
      'Consider altitude changes for affected aircraft',
      'Log report for meteorological services'
    ],
    'pirep_weather': [
      'Distribute weather information to pilots',
      'Update ATIS if significant',
      'Coordinate with weather services',
      'Document for future reference'
    ],
    'pirep_winds': [
      'Update wind information for departures/arrivals',
      'Adjust runway configuration if needed',
      'Inform tower of wind conditions',
      'Log for meteorological analysis'
    ],
    'incident_report': [
      'Document incident details',
      'Notify appropriate authorities',
      'Coordinate investigation if required',
      'Follow up on corrective actions'
    ],
    'maintenance_report': [
      'Log maintenance issue',
      'Coordinate with ground crew',
      'Schedule inspection upon landing',
      'Monitor flight progress'
    ],
    'operational_report': [
      'Update operational status',
      'Coordinate with ground operations',
      'Communicate delays to affected flights',
      'Monitor for resolution'
    ]
  };
  
  return actions[emergencyType] || [
    'Monitor situation closely',
    'Coordinate appropriate response',
    'Maintain communication with aircraft',
    'Document for follow-up'
  ];
}

function extractInstruction(transcript: string): string {
  const text = transcript.toLowerCase();
  
  if (text.includes('returning to field')) return 'returning to field';
  if (text.includes('requesting vectors')) return 'requesting vectors';
  if (text.includes('priority landing')) return 'priority landing';
  if (text.includes('emergency landing')) return 'emergency landing';
  if (text.includes('immediate landing')) return 'immediate landing';
  
  return 'emergency assistance requested';
}

function extractRunway(transcript: string): string | null {
  const runwayMatch = transcript.match(/runway\s*(\d+[LRC]?)/i);
  return runwayMatch ? runwayMatch[1].toUpperCase() : null;
} 