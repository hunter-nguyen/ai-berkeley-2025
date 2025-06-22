import json
import os
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from groq import Groq
import logging

logger = logging.getLogger(__name__)

class EmergencyDetectionAgent:
    """
    Agent that monitors messages.json for emergencies, alerts, and warnings.
    Uses LLM to analyze messages and outputs to emergencies.json for frontend consumption.
    """
    
    def __init__(self, messages_file: str = "messages.json", emergencies_file: str = "emergencies.json"):
        self.messages_file = messages_file
        self.emergencies_file = emergencies_file
        self.processed_message_ids = set()
        self.last_check_time = datetime.now()
        
        # Initialize Groq client
        self.groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        # Load existing emergencies and processed IDs
        self._load_existing_emergencies()
        
    def _load_existing_emergencies(self):
        """Load existing emergencies file to avoid reprocessing"""
        try:
            if os.path.exists(self.emergencies_file):
                with open(self.emergencies_file, 'r') as f:
                    existing_emergencies = json.load(f)
                    # Track already processed message IDs
                    for emergency in existing_emergencies:
                        if 'source_message_id' in emergency:
                            self.processed_message_ids.add(emergency['source_message_id'])
                logger.info(f"Loaded {len(self.processed_message_ids)} previously processed messages")
        except Exception as e:
            logger.error(f"Error loading existing emergencies: {e}")
            
    def _analyze_message_with_llm(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Use LLM to analyze if a message contains emergency/alert/warning"""
        
        system_prompt = """You are an emergency detection agent for air traffic control communications. 
        
        Analyze the provided ATC message and determine if it contains:
        1. EMERGENCY - immediate danger requiring urgent response
        2. ALERT - important safety issue requiring attention
        3. WARNING - potential safety concern requiring monitoring
        
        Respond with JSON only:
        {
            "has_emergency": true/false,
            "severity": "CRITICAL/HIGH/MEDIUM/LOW",
            "category": "EMERGENCY/ALERT/WARNING/NONE",
            "emergency_type": "engine_failure/medical/weather/collision/fuel/radio/other",
            "description": "brief description of the emergency/alert/warning",
            "recommended_actions": ["action1", "action2"],
            "confidence": 0.0-1.0
        }
        
        Emergency keywords: MAYDAY, EMERGENCY, PAN-PAN, bird strike, engine failure, medical emergency, fuel emergency
        Alert keywords: traffic alert, weather warning, runway incursion, go around
        Warning keywords: turbulence, wind shear, visibility issues"""
        
        user_message = f"""Message to analyze:
        Callsign: {message.get('callsign', 'Unknown')}
        Message: {message.get('message', '')}
        Raw Transcript: {message.get('rawTranscript', '')}
        Is Urgent: {message.get('isUrgent', False)}
        Type: {message.get('type', '')}
        
        ATC Data: {json.dumps(message.get('atc_data', {}), indent=2)}"""
        
        try:
            response = self.groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            response_text = response.choices[0].message.content.strip()
            
            # Extract JSON from response
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]
                
            analysis = json.loads(response_text)
            
            logger.info(f"LLM Analysis for {message.get('callsign')}: {analysis.get('category')} - {analysis.get('description')}")
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing message with LLM: {e}")
            return None
            
    def _create_emergency_entry(self, message: Dict[str, Any], analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Create emergency entry for emergencies.json"""
        return {
            "id": f"emrg_{int(time.time())}_{message.get('id', '')[:8]}",
            "timestamp": datetime.now().isoformat(),
            "source_message_id": message.get('id'),
            "source_timestamp": message.get('timestamp'),
            "callsign": message.get('callsign'),
            "severity": analysis.get('severity'),
            "category": analysis.get('category'),
            "emergency_type": analysis.get('emergency_type'),
            "description": analysis.get('description'),
            "original_message": message.get('message'),
            "raw_transcript": message.get('rawTranscript'),
            "recommended_actions": analysis.get('recommended_actions', []),
            "confidence": analysis.get('confidence', 0.0),
            "status": "ACTIVE",
            "acknowledged": False,
            "escalated": False,
            "atc_data": message.get('atc_data', {}),
            "created_by": "emergency_detection_agent"
        }
        
    def _save_emergencies(self, emergencies: List[Dict[str, Any]]):
        """Save emergencies to JSON file"""
        try:
            with open(self.emergencies_file, 'w') as f:
                json.dump(emergencies, f, indent=2)
            logger.info(f"Saved {len(emergencies)} emergencies to {self.emergencies_file}")
        except Exception as e:
            logger.error(f"Error saving emergencies: {e}")
            
    def _load_emergencies(self) -> List[Dict[str, Any]]:
        """Load existing emergencies"""
        try:
            if os.path.exists(self.emergencies_file):
                with open(self.emergencies_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading emergencies: {e}")
        return []
        
    def process_new_messages(self) -> int:
        """Check for new messages and process them for emergencies"""
        try:
            if not os.path.exists(self.messages_file):
                logger.warning(f"Messages file {self.messages_file} not found")
                return 0
                
            with open(self.messages_file, 'r') as f:
                messages = json.load(f)
                
            new_emergencies_count = 0
            existing_emergencies = self._load_emergencies()
            
            # Process only new messages
            for message in messages:
                message_id = message.get('id')
                if message_id and message_id not in self.processed_message_ids:
                    
                    # Analyze with LLM
                    analysis = self._analyze_message_with_llm(message)
                    
                    if analysis and analysis.get('has_emergency', False):
                        # Create emergency entry
                        emergency_entry = self._create_emergency_entry(message, analysis)
                        existing_emergencies.append(emergency_entry)
                        new_emergencies_count += 1
                        
                        logger.info(f"NEW {analysis.get('category')}: {message.get('callsign')} - {analysis.get('description')}")
                        
                    # Mark as processed
                    self.processed_message_ids.add(message_id)
                    
            # Save updated emergencies
            if new_emergencies_count > 0:
                self._save_emergencies(existing_emergencies)
                
            self.last_check_time = datetime.now()
            return new_emergencies_count
            
        except Exception as e:
            logger.error(f"Error processing messages: {e}")
            return 0
            
    def run_monitoring_loop(self, check_interval: int = 5):
        """Run continuous monitoring loop"""
        logger.info(f"Starting emergency detection monitoring (checking every {check_interval}s)")
        
        while True:
            try:
                new_count = self.process_new_messages()
                if new_count > 0:
                    logger.info(f"Detected {new_count} new emergencies/alerts/warnings")
                    
                time.sleep(check_interval)
                
            except KeyboardInterrupt:
                logger.info("Emergency monitoring stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                time.sleep(check_interval)
                
    def get_active_emergencies(self) -> List[Dict[str, Any]]:
        """Get all active emergencies for API"""
        emergencies = self._load_emergencies()
        return [e for e in emergencies if e.get('status') == 'ACTIVE']
        
    def update_emergency_status(self, emergency_id: str, status: str, acknowledged: bool = None):
        """Update emergency status"""
        emergencies = self._load_emergencies()
        
        for emergency in emergencies:
            if emergency.get('id') == emergency_id:
                emergency['status'] = status
                if acknowledged is not None:
                    emergency['acknowledged'] = acknowledged
                emergency['updated_at'] = datetime.now().isoformat()
                break
                
        self._save_emergencies(emergencies)

if __name__ == "__main__":
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create and run agent
    agent = EmergencyDetectionAgent()
    
    # Check for new emergencies once
    new_count = agent.process_new_messages()
    print(f"Found {new_count} new emergencies/alerts/warnings")
    
    # Run continuous monitoring (uncomment for daemon mode)
    # agent.run_monitoring_loop(check_interval=5) 