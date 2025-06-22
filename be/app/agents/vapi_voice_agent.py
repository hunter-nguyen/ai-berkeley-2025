"""
VAPI Voice Agent - Make calls to existing assistants with dynamic data
"""
import asyncio
import json
from datetime import datetime
from typing import Dict, List, Any, Optional
import httpx
from ..utils.logging import get_logger

logger = get_logger(__name__)


class VAPIVoiceAgent:
    """Agent for making voice calls via VAPI with dynamic data"""
    
    def __init__(self, api_key: str, base_url: str = "https://api.vapi.ai"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        self.stats = {
            "calls_initiated": 0,
            "calls_completed": 0,
            "calls_failed": 0,
            "start_time": datetime.now()
        }
        
        logger.info("Initialized VAPI Voice Agent")
    
    async def make_emergency_call(
        self,
        assistant_id: str,
        phone_number: str,
        emergency_data: Dict[str, Any],
        call_name: Optional[str] = None,
        phone_number_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Make an emergency call with dynamic data
        
        Args:
            assistant_id: VAPI assistant ID to use for the call
            phone_number: Phone number to call (e.g., "+1234567890")
            emergency_data: Emergency information to pass to assistant
            call_name: Optional name for the call
            phone_number_id: VAPI phone number ID to use for outbound calls
            
        Returns:
            Call response data including call ID and status
        """
        try:
            self.stats["calls_initiated"] += 1
            
            # Prepare the call payload
            call_payload = {
                "assistantId": assistant_id,
                "customer": {
                    "number": phone_number
                },
                "name": call_name or f"Emergency Call - {datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "assistantOverrides": {
                    "variableValues": {
                        "emergency_data": json.dumps(emergency_data),
                        "emergency_type": emergency_data.get("emergency_type", emergency_data.get("type", "unknown")),
                        "airport_code": emergency_data.get("airport_code", ""),
                        "timestamp": emergency_data.get("timestamp", datetime.now().isoformat()),
                        "urgency_level": emergency_data.get("urgency_level", "medium"),
                        "location": emergency_data.get("location", emergency_data.get("details", {}).get("location", "")),
                        "reported_by": emergency_data.get("reported_by", emergency_data.get("details", {}).get("reported_by", "ATC System"))
                    }
                }
            }
            
            # Add phone number ID if provided
            if phone_number_id:
                call_payload["phoneNumberId"] = phone_number_id
            
            # Make the API call
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/call",
                    headers=self.headers,
                    json=call_payload,
                    timeout=30.0
                )
                
                response.raise_for_status()
                result = response.json()
                
                self.stats["calls_completed"] += 1
                
                logger.info(f"Successfully initiated VAPI call: {result.get('id')}")
                logger.info(f"Call status: {result.get('status')}")
                
                return {
                    "success": True,
                    "call_id": result.get("id"),
                    "status": result.get("status"),
                    "call_data": result,
                    "emergency_data": emergency_data,
                    "timestamp": datetime.now().isoformat()
                }
                
        except httpx.HTTPStatusError as e:
            self.stats["calls_failed"] += 1
            error_msg = f"VAPI API error: {e.response.status_code} - {e.response.text}"
            logger.error(error_msg)
            
            return {
                "success": False,
                "error": error_msg,
                "status_code": e.response.status_code,
                "emergency_data": emergency_data,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            self.stats["calls_failed"] += 1
            error_msg = f"Error making VAPI call: {str(e)}"
            logger.error(error_msg)
            
            return {
                "success": False,
                "error": error_msg,
                "emergency_data": emergency_data,
                "timestamp": datetime.now().isoformat()
            }
    
    async def make_airport_emergency_call(
        self,
        assistant_id: str,
        phone_number: str,
        airport_code: str,
        emergency_type: str,
        details: Dict[str, Any],
        urgency_level: str = "high",
        phone_number_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Make a call for airport emergency situations
        
        Args:
            assistant_id: VAPI assistant ID
            phone_number: Emergency contact number
            airport_code: Airport identifier (e.g., "KSFO")
            emergency_type: Type of emergency ("fire", "medical", "security", "weather", etc.)
            details: Additional emergency details
            urgency_level: "low", "medium", "high", "critical"
            phone_number_id: VAPI phone number ID to use for outbound calls
        """
        emergency_data = {
            "type": "airport_emergency",
            "airport_code": airport_code,
            "emergency_type": emergency_type,
            "urgency_level": urgency_level,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "location": details.get("location", f"{airport_code} Airport"),
            "reported_by": details.get("reported_by", "ATC System"),
            "contact_info": details.get("contact_info", "")
        }
        
        call_name = f"EMERGENCY - {airport_code} - {emergency_type.upper()}"
        
        return await self.make_emergency_call(
            assistant_id=assistant_id,
            phone_number=phone_number,
            emergency_data=emergency_data,
            call_name=call_name,
            phone_number_id=phone_number_id
        )
    
    async def make_weather_alert_call(
        self,
        assistant_id: str,
        phone_number: str,
        airport_code: str,
        weather_data: Dict[str, Any],
        phone_number_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Make a call for severe weather alerts
        """
        emergency_data = {
            "type": "weather_alert",
            "airport_code": airport_code,
            "weather_data": weather_data,
            "urgency_level": "medium",
            "timestamp": datetime.now().isoformat(),
        }
        
        return await self.make_emergency_call(
            assistant_id=assistant_id,
            phone_number=phone_number,
            emergency_data=emergency_data,
            call_name=f"WEATHER - {airport_code}",
            phone_number_id=phone_number_id
        )
    
    async def get_call_status(self, call_id: str) -> Dict[str, Any]:
        """
        Get the status of a specific call
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/call/{call_id}",
                    headers=self.headers,
                    timeout=10.0
                )
                
                response.raise_for_status()
                return response.json()
                
        except Exception as e:
            logger.error(f"Error getting call status: {e}")
            return {"error": str(e)}
    
    async def list_assistants(self) -> Dict[str, Any]:
        """
        List available VAPI assistants
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/assistant",
                    headers=self.headers,
                    timeout=10.0
                )
                
                response.raise_for_status()
                return response.json()
                
        except Exception as e:
            logger.error(f"Error listing assistants: {e}")
            return {"error": str(e)}
    
    def get_stats(self) -> Dict[str, Any]:
        """Get agent statistics"""
        runtime = datetime.now() - self.stats["start_time"]
        return {
            **self.stats,
            "start_time": self.stats["start_time"].isoformat(),
            "runtime_seconds": runtime.total_seconds(),
            "success_rate": (
                self.stats["calls_completed"] / max(1, self.stats["calls_initiated"])
            ) * 100
        }


# Example usage functions
async def emergency_airport_fire(vapi_agent: VAPIVoiceAgent, assistant_id: str, phone_number: str, phone_number_id: Optional[str] = None):
    """Example: Airport fire emergency"""
    return await vapi_agent.make_airport_emergency_call(
        assistant_id=assistant_id,
        phone_number=phone_number,
        airport_code="KSFO",
        emergency_type="fire",
        details={
            "location": "Terminal 3, Gate B15",
            "severity": "major",
            "evacuations": "in_progress",
            "fire_department": "dispatched",
            "reported_by": "ATC Tower",
            "contact_info": "tower@ksfo.airport.gov"
        },
        urgency_level="critical",
        phone_number_id=phone_number_id
    )


async def emergency_medical(vapi_agent: VAPIVoiceAgent, assistant_id: str, phone_number: str, phone_number_id: Optional[str] = None):
    """Example: Medical emergency"""
    return await vapi_agent.make_airport_emergency_call(
        assistant_id=assistant_id,
        phone_number=phone_number,
        airport_code="KSFO",
        emergency_type="medical",
        details={
            "location": "Runway 28R",
            "aircraft": "UAL297",
            "passenger_count": 180,
            "medical_issue": "passenger_cardiac_arrest",
            "ambulance": "requested",
            "reported_by": "Flight Crew"
        },
        urgency_level="high",
        phone_number_id=phone_number_id
    ) 