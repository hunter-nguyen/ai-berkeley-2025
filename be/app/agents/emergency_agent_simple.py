import json
import os
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class SimpleEmergencyDetectionAgent:
    """
    Simple rule-based emergency detection agent that doesn't require LLM.
    Detects emergencies based on keywords and patterns.
    """
    
    def __init__(self, messages_file: str = "messages.json", emergencies_file: str = "emergencies.json"):
        self.messages_file = messages_file
        self.emergencies_file = emergencies_file
        self.processed_message_ids = set()
        
        # Emergency detection rules
        self.emergency_keywords = {
            'CRITICAL': ['mayday', 'emergency', 'pan-pan', 'distress'],
            'HIGH': ['bird strike', 'engine failure', 'medical emergency', 'fuel emergency', 'fire'],
            'MEDIUM': ['go around', 'missed approach', 'traffic alert', 'wind shear'],
            'LOW': ['turbulence', 'visibility', 'weather']
        }
        
        self.emergency_types = {
            'engine': ['engine failure', 'engine', 'power loss'],
            'medical': ['medical emergency', 'medical', 'passenger ill', 'heart attack'],
            'weather': ['bird strike', 'wind shear', 'turbulence', 'weather'],
            'fuel': ['fuel emergency', 'low fuel', 'fuel leak'],
            'collision': ['traffic alert', 'collision', 'near miss'],
            'radio': ['radio failure', 'communication', 'transponder'],
            'other': ['emergency', 'mayday', 'pan-pan']
        }
        
        # Load existing emergencies
        self._load_existing_emergencies()
        
    def _load_existing_emergencies(self):
        """Load existing emergencies file to avoid reprocessing"""
        try:
            if os.path.exists(self.emergencies_file):
                with open(self.emergencies_file, 'r') as f:
                    existing_emergencies = json.load(f)
                    for emergency in existing_emergencies:
                        if 'source_message_id' in emergency:
                            self.processed_message_ids.add(emergency['source_message_id'])
                logger.info(f"Loaded {len(self.processed_message_ids)} previously processed messages")
        except Exception as e:
            logger.error(f"Error loading existing emergencies: {e}")
            
    def _detect_emergency_simple(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Simple rule-based emergency detection"""
        
        # Combine message text for analysis
        text_to_analyze = (
            f"{message.get('message', '')} "
            f"{message.get('rawTranscript', '')} "
            f"{message.get('callsign', '')}"
        ).lower()
        
        # Check if already marked as urgent
        is_urgent = message.get('isUrgent', False)
        has_emergency_in_atc = message.get('atc_data', {}).get('emergencies', False)
        
        # Detect severity and type
        severity = 'LOW'
        category = 'NONE'
        emergency_type = 'other'
        confidence = 0.1
        
        # Check for emergency keywords
        for sev_level, keywords in self.emergency_keywords.items():
            for keyword in keywords:
                if keyword in text_to_analyze:
                    severity = sev_level
                    category = 'EMERGENCY' if sev_level in ['CRITICAL', 'HIGH'] else 'ALERT' if sev_level == 'MEDIUM' else 'WARNING'
                    confidence = max(confidence, 0.9 if sev_level == 'CRITICAL' else 0.8 if sev_level == 'HIGH' else 0.6)
                    break
                    
        # Detect emergency type
        for etype, keywords in self.emergency_types.items():
            for keyword in keywords:
                if keyword in text_to_analyze:
                    emergency_type = etype
                    break
                    
        # Boost confidence if marked urgent or has emergency flag
        if is_urgent or has_emergency_in_atc:
            confidence = min(confidence + 0.3, 1.0)
            if category == 'NONE':
                category = 'ALERT'
                severity = 'MEDIUM'
                
        # Determine if this qualifies as emergency/alert/warning
        has_emergency = category != 'NONE' or is_urgent or has_emergency_in_atc
        
        if not has_emergency:
            return None
            
        # Generate description
        description = f"{emergency_type.replace('_', ' ').title()} detected"
        if 'emergency' in text_to_analyze:
            description += " - declared emergency"
        if 'mayday' in text_to_analyze:
            description += " - MAYDAY call"
            
        # Generate recommended actions
        actions = []
        if severity == 'CRITICAL':
            actions = ["Alert emergency services", "Clear runway", "Coordinate emergency response"]
        elif severity == 'HIGH':
            actions = ["Monitor closely", "Prepare emergency services", "Coordinate with pilot"]
        elif severity == 'MEDIUM':
            actions = ["Continue monitoring", "Update flight plan if needed"]
        else:
            actions = ["Log incident", "Monitor situation"]
            
        return {
            "has_emergency": True,
            "severity": severity,
            "category": category,
            "emergency_type": emergency_type,
            "description": description,
            "recommended_actions": actions,
            "confidence": confidence
        }
        
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
            "created_by": "simple_emergency_agent"
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
                    
                    # Analyze with simple rules
                    analysis = self._detect_emergency_simple(message)
                    
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
                
            return new_emergencies_count
            
        except Exception as e:
            logger.error(f"Error processing messages: {e}")
            return 0
            
    def get_active_emergencies(self) -> List[Dict[str, Any]]:
        """Get all active emergencies for API"""
        emergencies = self._load_emergencies()
        return [e for e in emergencies if e.get('status') == 'ACTIVE']

if __name__ == "__main__":
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create and run agent
    agent = SimpleEmergencyDetectionAgent()
    
    # Check for new emergencies once
    new_count = agent.process_new_messages()
    print(f"Found {new_count} new emergencies/alerts/warnings") 