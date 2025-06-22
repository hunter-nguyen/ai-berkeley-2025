#!/usr/bin/env python3
"""
ATC Language Processing Agent
Understands aviation terminology and extracts structured data from ATC transcriptions
"""
import asyncio
import logging
import json
import re
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from groq import Groq

logger = logging.getLogger(__name__)

class ATCLanguageAgent:
    """AI Agent that processes ATC transcriptions and extracts structured aviation data"""
    
    def __init__(self, groq_api_key: str, model: str = "llama3-70b-8192"):
        self.client = Groq(api_key=groq_api_key)
        self.model = model
        self.stats = {
            "processed_transcripts": 0,
            "extracted_callsigns": 0,
            "extracted_instructions": 0,
            "start_time": datetime.now()
        }
        
        # ATC terminology patterns
        self.phonetic_numbers = {
            "zero": "0", "one": "1", "two": "2", "tree": "3", "three": "3",
            "four": "4", "fife": "5", "five": "5", "six": "6", "seven": "7", 
            "eight": "8", "niner": "9", "nine": "9"
        }
        
        self.common_airlines = {
            # North American Carriers
            "alaska": "ASA", "american": "AAL", "breeze": "MX", "delta": "DAL", 
            "jetblue": "JBU", "porter": "POE", "southwest": "SWA", "sun country": "SCX",
            "united": "UAL", "westjet": "WJA",
            
            # Americas/Canada/Mexico  
            "aer lingus": "EIN", "shamrock": "EIN", "aeromexico": "AMX", "air canada": "ACA",
            "avianca": "AVA", "copa": "CMP",
            
            # Asia-Pacific & Oceania
            "air china": "CCA", "air india": "AIC", "air new zealand": "ANZ", "new zealand": "ANZ",
            "ana": "ANA", "all nippon": "ANA", "asiana": "AAR", "cathay": "CPA", "cathay pacific": "CPA",
            "china airlines": "CAL", "dynasty": "CAL", "china eastern": "CES", "china southern": "CSN",
            "eva": "EVA", "eva air": "EVA", "fiji": "FJI", "hawaiian": "HAL", "japan air": "JAL",
            "jal": "JAL", "korean": "KAL", "korean air": "KAL", "level": "LVL", "philippine": "PAL",
            "qantas": "QFA", "singapore": "SIA", "starlux": "JX", "vietnam": "HVN", "zipair": "TZP",
            
            # Europe & Middle East
            "air france": "AFR", "british": "BAW", "speedbird": "BAW", "condor": "CFG",
            "emirates": "UAE", "iberia": "IBE", "ita": "ITY", "klm": "KLM", "lufthansa": "DLH",
            "qatar": "QTR", "qatari": "QTR", "sas": "SAS", "scandinavian": "SAS", "swiss": "SWR",
            "tap": "TAP", "air portugal": "TAP", "turkish": "THY", "virgin": "VIR",
            
            # Low-cost/Specialized
            "air premia": "APZ", "flair": "FLE", "frenchbee": "BF", "frontier": "FFT"
        }
        
        logger.info(f"Initialized ATC Language Agent with model: {model}")
    
    async def process_transcript(self, transcript: str, frequency: str = "unknown") -> Dict[str, Any]:
        """
        Process an ATC transcript and extract structured aviation data
        
        Args:
            transcript: Raw ATC transcript text
            frequency: Radio frequency/tower identifier
            
        Returns:
            Structured data with callsigns, instructions, runway info, etc.
        """
        try:
            self.stats["processed_transcripts"] += 1
            
            # First, clean and normalize the transcript
            cleaned_transcript = self._preprocess_transcript(transcript)
            
            # Use Groq to extract structured data
            structured_data = await self._extract_with_groq(cleaned_transcript, frequency)
            
            # Post-process and enhance the data
            enhanced_data = self._enhance_extracted_data(structured_data, cleaned_transcript)
            
            # Add metadata
            enhanced_data.update({
                "original_transcript": transcript,
                "cleaned_transcript": cleaned_transcript,
                "frequency": frequency,
                "timestamp": datetime.now().isoformat(),
                "processing_agent": "ATC_Language_Agent"
            })
            
            logger.info(f"Processed ATC transcript: {len(enhanced_data.get('callsigns', []))} callsigns, "
                       f"{len(enhanced_data.get('instructions', []))} instructions")
            
            return enhanced_data
            
        except Exception as e:
            logger.error(f"Error processing transcript: {e}")
            return {
                "error": str(e),
                "original_transcript": transcript,
                "frequency": frequency,
                "timestamp": datetime.now().isoformat()
            }
    
    def _preprocess_transcript(self, transcript: str) -> str:
        """Clean and normalize ATC transcript text"""
        # Convert to lowercase for processing
        text = transcript.lower().strip()
        
        # Fix common ATC phonetic issues
        for phonetic, digit in self.phonetic_numbers.items():
            text = re.sub(rf'\b{phonetic}\b', digit, text)
        
        # Fix common number patterns
        text = re.sub(r'\b(\d+)-ride\b', r'\1\1', text)  # "2-ride" -> "22"
        text = re.sub(r'\b(\d)(\d)\s*ride\b', r'\1\1', text)  # "2 2 ride" -> "22"
        
        # Fix runway patterns
        text = re.sub(r'\brunway\s*(\d+)', r'runway \1', text)
        
        # Fix common phrases
        text = re.sub(r'\bline\s*up\s*and\s*wait\b', 'line up and wait', text)
        text = re.sub(r'\bcontact\s*departure\b', 'contact departure', text)
        text = re.sub(r'\btake\s*off\b', 'takeoff', text)
        
        return text
    
    async def _extract_with_groq(self, transcript: str, frequency: str) -> Dict[str, Any]:
        """Use Groq to extract structured data from ATC transcript"""
        
        prompt = f"""
You are an expert ATC (Air Traffic Control) language processor specialized in San Francisco International Airport (KSFO) operations. Analyze this ATC radio transcript and extract structured information specific to KSFO.

Transcript: "{transcript}"
Frequency: {frequency}

KSFO AIRPORT LAYOUT:
Runways:
- 10L/28R (11,870 x 200 ft) - Primary arrival runway 28R, departure runway 10L
- 10R/28L (11,381 x 200 ft) - Primary arrival runway 28L, departure runway 10R  
- 01R/19L (8,650 x 200 ft) - Primary departure runway 01R, arrival runway 19L
- 01L/19R (7,650 x 200 ft) - Primary departure runway 01L, arrival runway 19R

Major Taxiways: A, B, A1, B1, C, C3, E, F, M, U, Z
- Taxiway A: Terminal to departure runways
- Taxiway B: Arrival runways to terminals
- Taxiway Z: Between runways 28L/10R and 28R/10L

KSFO AIRLINES & CALLSIGNS:

NORTH AMERICAN CARRIERS:
- Alaska Airlines: ASA/Alaska (Terminal 1, 2)
- American Airlines: AAL/American (Terminal 1) 
- Breeze Airways: MX/Breeze (Various terminals)
- Delta Air Lines: DAL/Delta (Terminal 2)
- JetBlue Airways: JBU/JetBlue (Terminal 1)
- Porter Airlines: POE/Porter (Terminal 1, Intl A)
- Southwest Airlines: SWA/Southwest (Terminal 1)
- Sun Country Airlines: SCX/Sun Country (Intl G)
- United Airlines: UAL/United (Terminal 3 domestic, Intl G international)
- WestJet: WJA/WestJet (Intl A)

AMERICAS/CANADA/MEXICO:
- Aer Lingus: EIN/Shamrock (Terminal 1)
- AeroMexico: AMX/Aeromexico (Intl A)
- Air Canada: ACA/Air Canada (Terminal 2)
- Avianca: AVA/Avianca (Intl A)
- Copa Airlines: CMP/Copa (Intl A, Intl G)

ASIA-PACIFIC & OCEANIA:
- Air China: CCA/Air China (Intl G)
- Air India: AIC/Air India (Intl A)
- Air New Zealand: ANZ/New Zealand (Intl G)
- All Nippon Airways: ANA/All Nippon (Intl G)
- Asiana Airlines: AAR/Asiana (Intl G)
- Cathay Pacific: CPA/Cathay (Intl A)
- China Airlines: CAL/Dynasty (Intl A)
- China Eastern: CES/China Eastern (Intl A)
- China Southern: CSN/China Southern (Intl A)
- EVA Air: EVA/Eva (Intl A, Intl G)
- Fiji Airways: FJI/Fiji (Intl G)
- Hawaiian Airlines: HAL/Hawaiian (Intl G)
- Japan Airlines: JAL/Japan Air (Intl A)
- Korean Air: KAL/Korean Air (Intl A)
- LEVEL: LVL/Level (Intl A)
- Philippine Airlines: PAL/Philippine (Intl A)
- Qantas: QFA/Qantas (Intl A)
- Singapore Airlines: SIA/Singapore (Intl G)
- Starlux Airlines: JX/Starlux (Intl G)
- Vietnam Airlines: HVN/Vietnam (Intl G)
- ZIPAIR: TZP/Zipair (Intl G)

EUROPE & MIDDLE EAST:
- Air France: AFR/Air France (Intl A)
- British Airways: BAW/Speedbird (Intl A)
- Condor: CFG/Condor (Intl A)
- Emirates: UAE/Emirates (Intl A)
- Iberia: IBE/Iberia (Intl A)
- ITA Airways: ITY/Itavia (Intl A)
- KLM: KLM/KLM (Intl A)
- Lufthansa: DLH/Lufthansa (Intl G)
- Qatar Airways: QTR/Qatari (Intl A)
- SAS: SAS/Scandinavian (Intl G)
- Swiss Air: SWR/Swiss (Intl G)
- TAP Air Portugal: TAP/Air Portugal (Intl G)
- Turkish Airlines: THY/Turkish (Intl G)
- Virgin Atlantic: VIR/Virgin (Intl A)

LOW-COST/SPECIALIZED:
- Air Premia: APZ/Air Premia (Intl A)
- Flair Airlines: FLE/Flair (Seasonal)
- Frenchbee: BF/Frenchbee (Intl A)
- Frontier Airlines: FFT/Frontier (Intl A)

KSFO AIRCRAFT TYPES:
Heavy: Boeing 747, 777, 787, Airbus A330, A340, A350, A380
Medium: Boeing 737, 757, Airbus A320 family
Light: Regional jets, turboprops, general aviation

KSFO OPERATIONAL FLOWS:
West Plan (95-98% of time): Departures 01L/01R, Arrivals 28L/28R
Southeast Plan (<5% of time): Departures 10L/10R, Arrivals 19L/19R

Extract and return a JSON object with the following structure:
{{
    "callsigns": [
        {{
            "callsign": "United 297",
            "airline_code": "UAL",
            "airline": "United Airlines", 
            "flight_number": "297",
            "aircraft_type": "heavy|medium|light",
            "terminal": "Terminal_1|Terminal_2|Terminal_3|International_A|International_G|unknown"
        }}
    ],
    "instructions": [
        {{
            "type": "takeoff_clearance|landing_clearance|taxi|frequency_change|line_up_wait|hold_short|ground_stop|gate_assignment",
            "callsign": "United 297",
            "instruction": "runway 28R cleared to land",
            "runway": "28R|28L|01R|01L|19R|19L|10R|10L",
            "taxiway": "A|B|A1|B1|C|C3|E|F|M|U|Z",
            "gate": "gate number if mentioned",
            "details": "wind, weather, or other details"
        }}
    ],
    "runways": ["28R", "01L"],
    "taxiways": ["A", "B", "Z"],
    "operational_flow": "west_plan|southeast_plan|unknown",
    "frequencies": ["departure", "ground", "tower"],
    "weather_info": "wind direction/speed, visibility, conditions",
    "summary": "brief summary specific to KSFO operations"
}}

KSFO-Specific ATC Patterns:
- Heavy aircraft clearances: "United 297 Heavy runway 28R cleared to land", "Emirates 225 Heavy line up and wait"
- International arrivals: "Singapore 2 contact SFO ground point eight", "Lufthansa 441 taxi to International Terminal G"
- Domestic operations: "Alaska 567 runway 01L cleared for takeoff", "Southwest 1234 taxi to Terminal 1 gate B12"
- Taxi instructions: "American 1234 taxi to gate A12 via taxiway A", "Delta 567 hold short runway 28R"
- Frequency changes: "Contact SFO departure", "Switch to ground point eight", "NorCal approach"
- Terminal-specific operations: "Cathay 888 taxi to International Terminal A", "United 1844 Terminal 3 gate F20"
- Asian carriers: "ANA 7", "Korean Air 123", "Japan Air 456", "Asiana 789"
- European carriers: "British Airways 285", "Air France 83", "KLM 604", "Turkish 1"
- Cargo operations: "FedEx 1234 taxi via Zulu to cargo ramp", "UPS 567 runway 28R"

Important: 
- Match airline codes to KSFO terminal assignments when possible
- Recognize KSFO's specific runway configuration and operational flows
- Extract actual KSFO runway and taxiway identifiers
- Identify heavy aircraft designations common at KSFO
- Parse terminal-specific operations and gate assignments

Return ONLY the JSON object, no other text.
"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1000
            )
            
            # Parse the JSON response
            json_text = response.choices[0].message.content.strip()
            
            # Clean up the response if it has markdown formatting
            if json_text.startswith("```"):
                json_text = re.sub(r'^```json\s*', '', json_text)
                json_text = re.sub(r'\s*```$', '', json_text)
            
            return json.loads(json_text)
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Groq JSON response: {e}")
            return {"error": "Failed to parse AI response", "raw_response": json_text}
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            return {"error": str(e)}
    
    def _enhance_extracted_data(self, data: Dict[str, Any], transcript: str) -> Dict[str, Any]:
        """Post-process and enhance the extracted data"""
        if "error" in data:
            return data
        
        # Update statistics
        if "callsigns" in data:
            self.stats["extracted_callsigns"] += len(data["callsigns"])
        if "instructions" in data:
            self.stats["extracted_instructions"] += len(data["instructions"])
        
        # Add confidence scores and additional parsing
        enhanced = data.copy()
        
        # Extract additional patterns that might be missed
        additional_callsigns = self._extract_additional_callsigns(transcript)
        if additional_callsigns:
            existing_callsigns = {cs.get("callsign", "") for cs in enhanced.get("callsigns", [])}
            for callsign in additional_callsigns:
                if callsign not in existing_callsigns:
                    enhanced.setdefault("callsigns", []).append({
                        "callsign": callsign,
                        "source": "regex_extraction"
                    })
        
        # Add processing metadata
        enhanced["processing_stats"] = {
            "callsign_count": len(enhanced.get("callsigns", [])),
            "instruction_count": len(enhanced.get("instructions", [])),
            "runway_count": len(enhanced.get("runways", [])),
            "confidence": "high" if len(enhanced.get("callsigns", [])) > 0 else "low"
        }
        
        return enhanced
    
    def _extract_additional_callsigns(self, transcript: str) -> List[str]:
        """Extract additional callsigns using regex patterns"""
        callsigns = []
        
        # Pattern for airline + number (e.g., "United 297", "American 1234")
        airline_pattern = r'\b(united|american|delta|southwest|jetblue|alaska|spirit|frontier)\s+(\d+)\s*(heavy)?\b'
        matches = re.findall(airline_pattern, transcript.lower())
        
        for airline, number, heavy in matches:
            airline_code = self.common_airlines.get(airline, airline.upper())
            callsign = f"{airline_code}{number}"
            if heavy:
                callsign += " Heavy"
            callsigns.append(callsign)
        
        # Pattern for direct callsigns (e.g., "UAL297", "AAL1234")
        direct_pattern = r'\b([A-Z]{2,3})(\d{1,4})\b'
        matches = re.findall(direct_pattern, transcript.upper())
        
        for airline_code, number in matches:
            callsigns.append(f"{airline_code}{number}")
        
        return list(set(callsigns))  # Remove duplicates
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        runtime = datetime.now() - self.stats["start_time"]
        return {
            "processed_transcripts": self.stats["processed_transcripts"],
            "extracted_callsigns": self.stats["extracted_callsigns"],
            "extracted_instructions": self.stats["extracted_instructions"],
            "start_time": self.stats["start_time"].isoformat(),
            "runtime_seconds": runtime.total_seconds(),
            "avg_callsigns_per_transcript": (
                self.stats["extracted_callsigns"] / max(1, self.stats["processed_transcripts"])
            )
        }

# Integration with audio pipeline
class ATCTranscriptProcessor:
    """Processes audio transcripts through the ATC Language Agent"""
    
    def __init__(self, groq_api_key: str):
        self.atc_agent = ATCLanguageAgent(groq_api_key)
        self.processed_data = []
        
    async def process_audio_transcript(self, transcript_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a transcript from the audio pipeline"""
        try:
            # Extract the text and metadata
            text = transcript_data.get("text", "")
            frequency = transcript_data.get("frequency", "unknown")
            
            if not text.strip():
                return {"error": "Empty transcript", "original": transcript_data}
            
            # Process with ATC agent
            structured_data = await self.atc_agent.process_transcript(text, frequency)
            
            # Combine with original transcript metadata
            result = {
                **transcript_data,  # Original audio metadata
                "atc_analysis": structured_data,
                "processed_at": datetime.now().isoformat()
            }
            
            # Store for analysis
            self.processed_data.append(result)
            
            logger.info(f"ATC Analysis - Callsigns: {len(structured_data.get('callsigns', []))}, "
                       f"Instructions: {len(structured_data.get('instructions', []))}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error in transcript processor: {e}")
            return {"error": str(e), "original": transcript_data}
    
    def get_recent_data(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent processed data"""
        return self.processed_data[-limit:]
    
    def get_agent_stats(self) -> Dict[str, Any]:
        """Get ATC agent statistics"""
        return self.atc_agent.get_stats()

# Example usage and testing
if __name__ == "__main__":
    async def test_atc_agent():
        """Test the ATC Language Agent"""
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            raise ValueError("GROQ_API_KEY environment variable required")
        
        # Test transcripts
        test_transcripts = [
            "United 297 heavy runway 28R cleared to land",
            "Emirates 225 heavy contact SFO ground point eight",
            "Alaska 567 taxi to gate A12 via taxiway A, hold short runway 01L",
            "American 1234 runway 01R cleared for takeoff",
            "Singapore 2 heavy line up and wait runway 28L",
            "Lufthansa 441 contact departure, good day"
        ]
        
        processor = ATCTranscriptProcessor(groq_api_key)
        
        for i, transcript in enumerate(test_transcripts):
            print(f"\n--- Test {i+1} ---")
            print(f"Input: {transcript}")
            
            # Simulate transcript data from audio pipeline
            transcript_data = {
                "text": transcript,
                "frequency": "KEWR_TWR",
                "timestamp": datetime.now().isoformat(),
                "chunk": i+1
            }
            
            result = await processor.process_audio_transcript(transcript_data)
            
            if "atc_analysis" in result:
                analysis = result["atc_analysis"]
                print(f"Callsigns: {analysis.get('callsigns', [])}")
                print(f"Instructions: {analysis.get('instructions', [])}")
                print(f"Runways: {analysis.get('runways', [])}")
                print(f"Summary: {analysis.get('summary', 'N/A')}")
            else:
                print(f"Error: {result.get('error', 'Unknown error')}")
        
        # Print statistics
        print(f"\n--- Statistics ---")
        stats = processor.get_agent_stats()
        print(json.dumps(stats, indent=2))
    
    asyncio.run(test_atc_agent()) 