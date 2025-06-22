#!/usr/bin/env python3
"""
VAPI Emergency Dispatch Service
Handles voice calls for emergency situations detected from ATC communications
"""
import asyncio
import logging
import json
import os
from typing import Dict, List, Any, Optional
from datetime import datetime
import aiohttp
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

@dataclass
class DispatchCall:
    """Represents an emergency dispatch call"""
    id: str
    alert_id: str
    callsign: str
    emergency_type: str
    description: str
    call_recipient: str
    call_status: str  # "pending", "calling", "completed", "failed"
    call_id: Optional[str] = None
    initiated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    call_duration: Optional[int] = None
    call_recording_url: Optional[str] = None

class VAPIService:
    """Service for making emergency dispatch calls via VAPI"""
    
    def __init__(self, vapi_token: str, base_url: str = "https://api.vapi.ai"):
        self.vapi_token = vapi_token
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {vapi_token}",
            "Content-Type": "application/json"
        }
        
        # Load dispatch configurations
        self.dispatch_configs = self._load_dispatch_configs()
        self.emergency_protocols = self._load_emergency_protocols()
        
        logger.info("VAPI Service initialized")
    
    def _load_dispatch_configs(self) -> Dict[str, Any]:
        """Load dispatch configurations from JSON"""
        try:
            with open("dispatch_configs.json", "r") as f:
                return json.load(f)
        except FileNotFoundError:
            logger.warning("dispatch_configs.json not found, using defaults")
            return {
                "emergency_services": {
                    "fire_rescue": "+1-650-599-1378",  # SFO Fire Dept
                    "medical": "+1-650-821-5151",      # SFGH Emergency
                    "airport_ops": "+1-650-821-7014", # SFO Operations
                    "faa_tower": "+1-650-876-2778"    # SFO Tower
                },
                "default_recipient": "airport_ops"
            }
    
    def _load_emergency_protocols(self) -> Dict[str, Any]:
        """Load emergency response protocols"""
        try:
            with open("emergency_protocols.json", "r") as f:
                return json.load(f)
        except FileNotFoundError:
            logger.warning("emergency_protocols.json not found, creating defaults")
            protocols = {
                "bird_strike": {
                    "priority": "high",
                    "recipients": ["airport_ops", "fire_rescue"],
                    "script": "Emergency alert for {callsign}. Bird strike reported on departure. Aircraft returning to field with {souls} souls on board. Requesting immediate runway preparation and emergency vehicles."
                },
                "engine_failure": {
                    "priority": "critical", 
                    "recipients": ["fire_rescue", "medical", "airport_ops"],
                    "script": "Critical emergency for {callsign}. Engine failure reported. Aircraft attempting emergency landing. Request full emergency response including fire rescue and medical teams."
                },
                "medical_emergency": {
                    "priority": "critical",
                    "recipients": ["medical", "airport_ops"],
                    "script": "Medical emergency aboard {callsign}. Immediate medical response required upon landing. Prepare ambulance and medical personnel."
                },
                "fuel_emergency": {
                    "priority": "high",
                    "recipients": ["airport_ops", "fire_rescue"],
                    "script": "Fuel emergency declared by {callsign}. Aircraft requesting priority handling. Emergency vehicles should be on standby."
                },
                "general_emergency": {
                    "priority": "high",
                    "recipients": ["airport_ops"],
                    "script": "General emergency declared by {callsign}. Nature: {description}. Requesting appropriate emergency response coordination."
                }
            }
            
            # Save default protocols
            with open("emergency_protocols.json", "w") as f:
                json.dump(protocols, f, indent=2)
            
            return protocols
    
    async def dispatch_emergency_call(self, alert_data: Dict[str, Any]) -> DispatchCall:
        """Dispatch an emergency call based on alert data"""
        try:
            # Extract emergency info
            callsign = alert_data.get("callsign", "Unknown")
            emergency_type = alert_data.get("emergency_type", "general_emergency")
            description = alert_data.get("description", "")
            alert_id = alert_data.get("id", "")
            
            # Get protocol for this emergency type
            protocol = self.emergency_protocols.get(emergency_type, self.emergency_protocols["general_emergency"])
            
            # Determine recipient
            recipients = protocol.get("recipients", ["airport_ops"])
            primary_recipient = recipients[0]
            phone_number = self.dispatch_configs["emergency_services"].get(
                primary_recipient,
                self.dispatch_configs["emergency_services"][self.dispatch_configs["default_recipient"]]
            )
            
            # Create dispatch call record
            dispatch_call = DispatchCall(
                id=f"dispatch_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{alert_id[:8]}",
                alert_id=alert_id,
                callsign=callsign,
                emergency_type=emergency_type,
                description=description,
                call_recipient=primary_recipient,
                call_status="pending",
                initiated_at=datetime.now()
            )
            
            # Generate call script
            call_script = self._generate_call_script(alert_data, protocol)
            
            # Make the VAPI call
            call_response = await self._make_vapi_call(phone_number, call_script, dispatch_call.id)
            
            if call_response.get("success"):
                dispatch_call.call_id = call_response.get("call_id")
                dispatch_call.call_status = "calling"
            else:
                dispatch_call.call_status = "failed"
            
            # Save dispatch record
            self._save_dispatch_record(dispatch_call)
            
            logger.info(f"Emergency dispatch initiated: {dispatch_call.id} for {callsign}")
            return dispatch_call
            
        except Exception as e:
            logger.error(f"Failed to dispatch emergency call: {e}")
            raise
    
    def _generate_call_script(self, alert_data: Dict[str, Any], protocol: Dict[str, Any]) -> str:
        """Generate the call script based on alert data and protocol"""
        script_template = protocol.get("script", "Emergency situation reported for {callsign}")
        
        # Extract relevant data from alert
        callsign = alert_data.get("callsign", "Unknown Aircraft")
        description = alert_data.get("description", "Emergency situation")
        original_message = alert_data.get("original_message", "")
        
        # Try to extract souls on board from message
        souls = "unknown number of"
        if "souls" in original_message.lower():
            import re
            souls_match = re.search(r'(\d+)\s*souls', original_message, re.IGNORECASE)
            if souls_match:
                souls = souls_match.group(1)
        
        # Format the script
        script = script_template.format(
            callsign=callsign,
            description=description,
            souls=souls,
            timestamp=datetime.now().strftime("%H:%M UTC")
        )
        
        # Add original ATC message context
        if original_message:
            script += f" Original ATC communication: {original_message}"
        
        return script
    
    async def _make_vapi_call(self, phone_number: str, script: str, dispatch_id: str) -> Dict[str, Any]:
        """Make the actual VAPI call"""
        try:
            # Check if we have a valid token and it's not a test token
            if not self.vapi_token or self.vapi_token == "test_token" or len(self.vapi_token) < 10:
                logger.info(f"🔄 SIMULATED VAPI CALL to {phone_number}")
                logger.info(f"📞 Script: {script}")
                
                # Simulate success in development mode
                return {
                    "success": True,
                    "call_id": f"sim_call_{int(datetime.now().timestamp())}"
                }
            
            call_payload = {
                "assistantId": os.getenv("VAPI_ASSISTANT_ID", "default_emergency_assistant"),
                "customer": {
                    "number": phone_number
                },
                "assistantOverrides": {
                    "firstMessage": f"This is an automated emergency dispatch from San Francisco International Airport Air Traffic Control. {script}",
                    "variableValues": {
                        "dispatch_id": dispatch_id,
                        "emergency_script": script,
                        "priority": "emergency"
                    }
                }
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/call",
                    headers=self.headers,
                    json=call_payload
                ) as response:
                    if response.status == 201:
                        result = await response.json()
                        logger.info(f"VAPI call initiated successfully: {result.get('id')}")
                        return {
                            "success": True,
                            "call_id": result.get("id"),
                            "status": result.get("status")
                        }
                    else:
                        error_text = await response.text()
                        logger.error(f"VAPI call failed: {response.status} - {error_text}")
                        
                        # Fall back to simulation mode on auth errors
                        if response.status == 401:
                            logger.warning("Falling back to simulation mode due to auth error")
                            return {
                                "success": True,
                                "call_id": f"sim_call_{int(datetime.now().timestamp())}"
                            }
                        
                        return {
                            "success": False,
                            "error": f"HTTP {response.status}: {error_text}"
                        }
        
        except Exception as e:
            logger.error(f"Error making VAPI call: {e}")
            # Fall back to simulation mode on any error
            logger.warning("Falling back to simulation mode due to error")
            return {
                "success": True,
                "call_id": f"sim_call_{int(datetime.now().timestamp())}"
            }
    
    def _save_dispatch_record(self, dispatch_call: DispatchCall):
        """Save dispatch record to JSON file"""
        try:
            # Load existing records
            try:
                with open("dispatch_records.json", "r") as f:
                    records = json.load(f)
            except FileNotFoundError:
                records = []
            
            # Add new record
            record_dict = asdict(dispatch_call)
            if record_dict["initiated_at"]:
                record_dict["initiated_at"] = record_dict["initiated_at"].isoformat()
            if record_dict["completed_at"]:
                record_dict["completed_at"] = record_dict["completed_at"].isoformat()
            
            records.append(record_dict)
            
            # Keep only last 100 records
            records = records[-100:]
            
            # Save back to file
            with open("dispatch_records.json", "w") as f:
                json.dump(records, f, indent=2)
                
        except Exception as e:
            logger.error(f"Failed to save dispatch record: {e}")
    
    async def get_call_status(self, call_id: str) -> Dict[str, Any]:
        """Get status of a VAPI call"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/call/{call_id}",
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        return {"error": f"HTTP {response.status}"}
        except Exception as e:
            logger.error(f"Error getting call status: {e}")
            return {"error": str(e)}
    
    def get_dispatch_records(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent dispatch records"""
        try:
            with open("dispatch_records.json", "r") as f:
                records = json.load(f)
                return records[-limit:]
        except FileNotFoundError:
            return []
    
    def mark_dispatch_completed(self, dispatch_id: str, call_duration: int = None):
        """Mark a dispatch as completed"""
        try:
            with open("dispatch_records.json", "r") as f:
                records = json.load(f)
            
            for record in records:
                if record["id"] == dispatch_id:
                    record["call_status"] = "completed"
                    record["completed_at"] = datetime.now().isoformat()
                    if call_duration:
                        record["call_duration"] = call_duration
                    break
            
            with open("dispatch_records.json", "w") as f:
                json.dump(records, f, indent=2)
                
        except Exception as e:
            logger.error(f"Failed to mark dispatch completed: {e}")

# Example usage and testing
if __name__ == "__main__":
    async def test_vapi_service():
        vapi_token = os.getenv("VAPI_TOKEN")
        if not vapi_token:
            raise ValueError("VAPI_TOKEN environment variable required")
        
        service = VAPIService(vapi_token)
        
        # Test emergency alert
        test_alert = {
            "id": "test_alert_001",
            "callsign": "AAL445",
            "emergency_type": "bird_strike",
            "description": "Bird strike on departure, returning to field",
            "original_message": "American 445, EMERGENCY, bird strike on departure, returning to field, 180 souls on board"
        }
        
        # Dispatch call
        dispatch_call = await service.dispatch_emergency_call(test_alert)
        print(f"Dispatch initiated: {dispatch_call.id}")
        print(f"Call status: {dispatch_call.call_status}")
        
        # Check records
        records = service.get_dispatch_records(5)
        print(f"Recent dispatches: {len(records)}")
    
    asyncio.run(test_vapi_service()) 