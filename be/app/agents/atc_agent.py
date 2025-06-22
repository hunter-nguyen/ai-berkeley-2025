"""
ATC Language Processing Agent - Modernized
"""
import asyncio
import json
import re
from datetime import datetime
from typing import Dict, List, Any, Optional
from groq import Groq

from ..utils.logging import get_logger

logger = get_logger(__name__)


class ATCAgent:
    """Modern ATC language processing agent"""
    
    def __init__(self, api_key: str, model: str = "llama3-70b-8192"):
        self.client = Groq(api_key=api_key)
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
            "united": "UAL", "american": "AAL", "delta": "DAL", "southwest": "SWA",
            "jetblue": "JBU", "alaska": "ASA", "spirit": "NKS", "frontier": "FFT"
        }
        
        logger.info(f"Initialized ATC Agent with model: {model}")
    
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
            
            # Clean and normalize the transcript
            cleaned_transcript = self._preprocess_transcript(transcript)
            
            # Extract structured data using Groq
            structured_data = await self._extract_with_groq(cleaned_transcript, frequency)
            
            # Post-process and enhance
            enhanced_data = self._enhance_extracted_data(structured_data, cleaned_transcript)
            
            # Add metadata
            enhanced_data.update({
                "original_transcript": transcript,
                "cleaned_transcript": cleaned_transcript,
                "frequency": frequency,
                "timestamp": datetime.now().isoformat(),
                "processing_agent": "ATC_Agent_v2"
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
        text = transcript.lower().strip()
        
        # Fix common ATC phonetic issues
        for phonetic, digit in self.phonetic_numbers.items():
            text = re.sub(rf'\b{phonetic}\b', digit, text)
        
        # Fix common number patterns
        text = re.sub(r'\b(\d+)-ride\b', r'\1\1', text)
        text = re.sub(r'\b(\d)(\d)\s*ride\b', r'\1\1', text)
        
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
You are an expert ATC (Air Traffic Control) language processor. Analyze this ATC radio transcript and extract structured information.

Transcript: "{transcript}"
Frequency: {frequency}

Extract and return a JSON object with the following structure:
{{
    "callsigns": [
        {{
            "callsign": "UAL297",
            "airline": "United",
            "flight_number": "297",
            "aircraft_type": "heavy"
        }}
    ],
    "instructions": [
        {{
            "type": "takeoff_clearance|landing_clearance|taxi|frequency_change|line_up_wait|hold_short",
            "callsign": "UAL297",
            "instruction": "runway 22R takeoff",
            "runway": "22R",
            "details": "additional details if any"
        }}
    ],
    "runways": ["22R", "04L"],
    "frequencies": ["departure", "ground"],
    "weather_info": "any weather mentioned",
    "emergencies": "any emergency situations",
    "summary": "brief summary of the communication"
}}

Common ATC patterns to recognize:
- Callsigns: "United 297", "American 1234 heavy", "Delta 567"
- Runway operations: "runway 22R takeoff", "land runway 04L"
- Taxi instructions: "taxi to gate", "hold short runway 22R"
- Frequency changes: "contact departure", "switch to ground"
- Line up and wait: "line up and wait runway 22R"

Important: 
- Extract actual callsigns, not just "297" but "United 297" or "UAL297"
- Recognize heavy aircraft designations
- Identify specific runway numbers
- Parse complex multi-part instructions

Return ONLY the JSON object, no other text.
"""

        try:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
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
        
        # Pattern for airline + number
        airline_pattern = r'\b(united|american|delta|southwest|jetblue|alaska|spirit|frontier)\s+(\d+)\s*(heavy)?\b'
        matches = re.findall(airline_pattern, transcript.lower())
        
        for airline, number, heavy in matches:
            airline_code = self.common_airlines.get(airline, airline.upper())
            callsign = f"{airline_code}{number}"
            if heavy:
                callsign += " Heavy"
            callsigns.append(callsign)
        
        # Pattern for direct callsigns
        direct_pattern = r'\b([A-Z]{2,3})(\d{1,4})\b'
        matches = re.findall(direct_pattern, transcript.upper())
        
        for airline_code, number in matches:
            callsigns.append(f"{airline_code}{number}")
        
        return list(set(callsigns))
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        runtime = datetime.now() - self.stats["start_time"]
        return {
            **self.stats,
            "start_time": self.stats["start_time"].isoformat(),
            "runtime_seconds": runtime.total_seconds(),
            "avg_callsigns_per_transcript": (
                self.stats["extracted_callsigns"] / max(1, self.stats["processed_transcripts"])
            )
        } 