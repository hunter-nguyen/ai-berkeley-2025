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
  category: 'EMERGENCY' | 'ALERT' | 'WARNING';
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

interface GroqATCData {
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

    // Process with Groq AI for structured data extraction
    const groqData = await processWithGroq(transcript);
    console.log('🤖 Groq processed data:', groqData);

    // Only create emergency alert if it's detected as an emergency
    if (!isEmergency) {
      return NextResponse.json({ 
        success: true, 
        message: 'Transcript processed - no emergency detected',
        emergency_created: false,
        groq_data: groqData,
        aircraft_mentioned: groqData.callsigns.length > 0 ? groqData.callsigns[0].callsign : null
      });
    }

    // Extract flight information from Groq data or fallback to manual extraction
    const flightInfo = groqData.callsigns.length > 0 
      ? groqData.callsigns[0] 
      : extractFlightInfo(transcript);
    
    const emergencyType = groqData.emergencies || detectEmergencyType(transcript);
    
    // Create emergency alert
    const emergency: EmergencyAlert = {
      id: `emrg_mic_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      source_message_id: `mic_${Date.now()}`,
      source_timestamp: new Date().toISOString(),
      callsign: flightInfo.callsign,
      severity: determineSeverity(emergencyType),
      category: 'EMERGENCY',
      emergency_type: emergencyType,
      description: generateDescription(emergencyType, transcript),
      original_message: transcript,
      raw_transcript: transcript,
      recommended_actions: getRecommendedActions(emergencyType),
      confidence: 0.95, // High confidence since manually spoken
      status: 'ACTIVE',
      acknowledged: false,
      escalated: false,
      atc_data: groqData,
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
      severity: emergency.severity
    });

    return NextResponse.json({
      success: true,
      emergency_created: true,
      emergency_id: emergency.id,
      callsign: emergency.callsign,
      emergency_type: emergency.emergency_type,
      severity: emergency.severity,
      groq_data: groqData,
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

async function processWithGroq(transcript: string): Promise<GroqATCData> {
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      console.warn('⚠️ GROQ_API_KEY not found, using fallback processing');
      return createFallbackGroqData(transcript);
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

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content from Groq API');
    }

    // Clean and parse JSON
    let cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
    
    // Handle cases where Groq returns explanatory text before JSON
    const jsonStart = cleanContent.indexOf('{');
    const jsonEnd = cleanContent.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
    }
    
    const parsedData = JSON.parse(cleanContent);
    
    console.log('✅ Groq processing successful');
    return parsedData;

  } catch (error) {
    console.error('❌ Groq processing failed:', error);
    return createFallbackGroqData(transcript);
  }
}

function createFallbackGroqData(transcript: string): GroqATCData {
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
  
  for (const [type, keywords] of Object.entries(emergencyTypes)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return type;
    }
  }
  
  return 'general_emergency';
}

function determineSeverity(emergencyType: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const criticalTypes = ['mayday_call', 'engine_failure', 'fire_emergency', 'medical_emergency'];
  const highTypes = ['bird_strike', 'fuel_emergency', 'hydraulic_failure', 'security_threat'];
  
  if (criticalTypes.includes(emergencyType)) return 'CRITICAL';
  if (highTypes.includes(emergencyType)) return 'HIGH';
  return 'MEDIUM';
}

function generateDescription(emergencyType: string, transcript: string): string {
  const descriptions: Record<string, string> = {
    'mayday_call': 'MAYDAY emergency call - life threatening situation',
    'engine_failure': 'Engine failure reported - aircraft requesting emergency landing',
    'bird_strike': 'Bird strike on departure - aircraft returning to field',
    'medical_emergency': 'Medical emergency aboard - immediate medical response required',
    'fuel_emergency': 'Fuel emergency declared - minimum fuel remaining',
    'fire_emergency': 'Fire/smoke emergency - immediate response required',
    'hydraulic_failure': 'Hydraulic system failure - landing gear/control issues possible',
    'pressurization_emergency': 'Cabin pressurization emergency - descending to safe altitude',
    'security_threat': 'Security threat reported - law enforcement required',
    'general_emergency': 'General emergency declared - nature to be determined'
  };
  
  return descriptions[emergencyType] || 'Emergency situation reported';
}

function getRecommendedActions(emergencyType: string): string[] {
  const actions: Record<string, string[]> = {
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
    ]
  };
  
  return actions[emergencyType] || [
    'Monitor situation closely',
    'Coordinate appropriate response',
    'Maintain communication with aircraft'
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