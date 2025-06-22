"""
ASI:One Central Reasoning Agent
===============================

The central intelligence agent that analyzes ATC communications for emergency situations
and can trigger real-world phone calls via Vapi MCP integration.

This agent serves as the decision-making brain that:
1. Analyzes transcribed ATC communications for emergency patterns
2. Evaluates context from multiple data sources (audio, radar, aircraft state)
3. Makes high-confidence emergency determinations
4. Triggers automated emergency calls via Vapi MCP when warranted
"""

import os
import json
import asyncio
import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from enum import Enum

from groq import Groq

# uAgents is optional - only needed for multi-agent scenarios
try:
    from uagents import Agent, Context, Model
    UAGENTS_AVAILABLE = True
except ImportError:
    UAGENTS_AVAILABLE = False

# MCP Client for Vapi integration
try:
    from mcp import Client as MCPClient
    from mcp.client.sse import SSEClientTransport
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False
    # Don't print warning during import - will be shown during initialization


class EmergencyLevel(Enum):
    """Emergency severity levels for escalation decisions"""
    CRITICAL = "critical"    # Life-threatening, immediate 911/emergency response
    HIGH = "high"           # Urgent safety issue, supervisor notification
    MEDIUM = "medium"       # Concerning situation, monitoring required
    LOW = "low"            # Minor issue, log for review
    NONE = "none"          # No emergency detected


class EmergencyType(Enum):
    """Types of aviation emergencies"""
    ENGINE_FAILURE = "engine_failure"
    FIRE = "fire"
    MEDICAL = "medical_emergency"
    FUEL_EMERGENCY = "fuel_emergency"
    HYDRAULIC_FAILURE = "hydraulic_failure"
    RUNWAY_INCURSION = "runway_incursion"
    BIRD_STRIKE = "bird_strike"
    WEATHER = "severe_weather"
    COMMUNICATION_FAILURE = "communication_failure"
    NAVIGATION_FAILURE = "navigation_failure"
    SECURITY_THREAT = "security_threat"
    UNKNOWN = "unknown_emergency"


@dataclass
class EmergencyContext:
    """Consolidated context for emergency analysis"""
    callsign: str
    transcript: str
    timestamp: datetime
    instructions: List[str]
    runways: List[str]
    aircraft_state: Optional[Dict[str, Any]] = None
    weather_conditions: Optional[Dict[str, Any]] = None
    radar_data: Optional[Dict[str, Any]] = None
    audio_analysis: Optional[Dict[str, Any]] = None


@dataclass
class EmergencyAssessment:
    """Emergency assessment result from ASI:One"""
    level: EmergencyLevel
    emergency_type: EmergencyType
    confidence: float  # 0.0 to 1.0
    reasoning: str
    recommended_actions: List[str]
    call_required: bool
    call_recipients: List[str]
    call_message: str
    context: EmergencyContext


class ASIOneAgent:
    """
    ASI:One - Advanced Safety Intelligence Agent
    
    Central reasoning agent that analyzes ATC communications and triggers
    emergency responses via Vapi MCP integration.
    """
    
    def __init__(self, groq_api_key: str, vapi_token: Optional[str] = None):
        self.logger = logging.getLogger(__name__)
        self.groq_client = Groq(api_key=groq_api_key)
        self.vapi_token = vapi_token or os.getenv("VAPI_TOKEN")
        # MCP integration handled by centralized manager
        
        # Emergency detection thresholds
        self.critical_threshold = 0.85
        self.high_threshold = 0.70
        self.medium_threshold = 0.50
        
        # Phone number to call when emergency detected
        self.receiver_phone_number = os.getenv("RECEIVER_PHONE_NUMBER", "+1234567890")
        
        # Single Vapi Assistant for all emergencies
        self.vapi_assistant_id = os.getenv("VAPI_ASSISTANT_ID", "your-assistant-id")
        
        self.vapi_phone_number_id = os.getenv("VAPI_PHONE_NUMBER_ID")
        
        # MCP integration will be handled by the main application
    
    # MCP connection is handled by the centralized MCP manager
    
    async def analyze_emergency(self, context: EmergencyContext) -> EmergencyAssessment:
        """
        Analyze ATC communication context for emergency situations
        
        Args:
            context: Consolidated context from ATC communications
            
        Returns:
            EmergencyAssessment with decision and recommended actions
        """
        try:
            # Prepare analysis prompt for Groq
            analysis_prompt = self._build_analysis_prompt(context)
            
            # Get emergency assessment from Groq
            response = await asyncio.to_thread(
                self.groq_client.chat.completions.create,
                model="llama3-70b-8192",
                messages=[
                    {
                        "role": "system",
                        "content": self._get_system_prompt()
                    },
                    {
                        "role": "user", 
                        "content": analysis_prompt
                    }
                ],
                temperature=0.1,  # Low temperature for consistent emergency detection
                max_tokens=1000
            )
            
            # Parse response
            assessment_data = self._parse_assessment_response(response.choices[0].message.content)
            
            # Create assessment object
            assessment = EmergencyAssessment(
                level=EmergencyLevel(assessment_data["level"]),
                emergency_type=EmergencyType(assessment_data["emergency_type"]),
                confidence=assessment_data["confidence"],
                reasoning=assessment_data["reasoning"],
                recommended_actions=assessment_data["recommended_actions"],
                call_required=assessment_data["call_required"],
                call_recipients=assessment_data["call_recipients"],
                call_message=assessment_data["call_message"],
                context=context
            )
            
            self.logger.info(f"🧠 ASI:One Assessment - {context.callsign}: {assessment.level.value} "
                           f"({assessment.confidence:.2f} confidence)")
            
            # Trigger emergency call if required
            if assessment.call_required and assessment.level in [EmergencyLevel.CRITICAL, EmergencyLevel.HIGH]:
                await self._trigger_emergency_call(assessment)
            
            return assessment
            
        except Exception as e:
            self.logger.error(f"❌ Error in emergency analysis: {e}")
            # Return safe default assessment
            return EmergencyAssessment(
                level=EmergencyLevel.NONE,
                emergency_type=EmergencyType.UNKNOWN,
                confidence=0.0,
                reasoning=f"Analysis failed: {str(e)}",
                recommended_actions=["Review manually"],
                call_required=False,
                call_recipients=[],
                call_message="",
                context=context
            )
    
    def _get_system_prompt(self) -> str:
        """Get the system prompt for emergency analysis"""
        return """You are ASI:One, an advanced aviation safety intelligence system analyzing ATC communications for emergency situations.

Your role is to:
1. Analyze ATC transcripts for emergency indicators
2. Assess severity and confidence levels
3. Determine if emergency calls are warranted
4. Provide clear reasoning for decisions

EMERGENCY KEYWORDS (HIGH PRIORITY):
- MAYDAY, PAN-PAN, EMERGENCY
- Engine failure, fire, smoke
- Medical emergency, passenger down
- Fuel emergency, minimum fuel
- Hydraulic failure, system failure
- Runway incursion, go around
- Bird strike, windshear
- Unable to comply, declaring emergency

SEVERITY LEVELS:
- CRITICAL (0.85+): Life-threatening, immediate 911 response
- HIGH (0.70+): Urgent safety issue, supervisor notification  
- MEDIUM (0.50+): Concerning situation, monitoring required
- LOW (0.30+): Minor issue, log for review
- NONE (<0.30): No emergency detected

 Respond ONLY with valid JSON in this exact format:
 {
   "level": "critical|high|medium|low|none",
   "emergency_type": "engine_failure|fire|medical_emergency|fuel_emergency|hydraulic_failure|runway_incursion|bird_strike|severe_weather|communication_failure|navigation_failure|security_threat|unknown_emergency",
   "confidence": 0.95,
   "reasoning": "Clear explanation of assessment",
   "recommended_actions": ["action1", "action2"],
   "call_required": true,
   "call_recipients": ["emergency_contact"],
   "call_message": "Emergency message for call"
 }"""
    
    def _build_analysis_prompt(self, context: EmergencyContext) -> str:
        """Build analysis prompt from context"""
        prompt = f"""ANALYZE THIS ATC COMMUNICATION FOR EMERGENCY:

CALLSIGN: {context.callsign}
TIMESTAMP: {context.timestamp.isoformat()}
TRANSCRIPT: "{context.transcript}"
INSTRUCTIONS: {context.instructions}
RUNWAYS: {context.runways}
"""
        
        if context.aircraft_state:
            prompt += f"\nAIRCRAFT STATE: {json.dumps(context.aircraft_state, indent=2)}"
            
        if context.weather_conditions:
            prompt += f"\nWEATHER: {json.dumps(context.weather_conditions, indent=2)}"
            
        if context.audio_analysis:
            prompt += f"\nAUDIO ANALYSIS: {json.dumps(context.audio_analysis, indent=2)}"
        
        prompt += "\n\nProvide emergency assessment as JSON:"
        return prompt
    
    def _parse_assessment_response(self, response: str) -> Dict[str, Any]:
        """Parse the assessment response from Groq"""
        try:
            # Extract JSON from response
            start_idx = response.find('{')
            end_idx = response.rfind('}') + 1
            
            if start_idx == -1 or end_idx == 0:
                raise ValueError("No JSON found in response")
                
            json_str = response[start_idx:end_idx]
            assessment = json.loads(json_str)
            
            # Validate required fields
            required_fields = ["level", "emergency_type", "confidence", "reasoning", 
                             "recommended_actions", "call_required", "call_recipients", "call_message"]
            
            for field in required_fields:
                if field not in assessment:
                    raise ValueError(f"Missing required field: {field}")
            
            return assessment
            
        except Exception as e:
            self.logger.error(f"❌ Error parsing assessment response: {e}")
            # Return safe default
            return {
                "level": "none",
                "emergency_type": "unknown_emergency",
                "confidence": 0.0,
                "reasoning": f"Failed to parse response: {str(e)}",
                "recommended_actions": ["Manual review required"],
                "call_required": False,
                "call_recipients": [],
                "call_message": ""
            }
    
    async def _trigger_emergency_call(self, assessment: EmergencyAssessment):
        """Trigger emergency call via centralized MCP manager"""
        try:
            # Import here to avoid circular imports
            from ..core.mcp_integration import get_mcp_manager
            
            mcp_manager = get_mcp_manager()
            
            if not mcp_manager.is_server_connected("vapi"):
                self.logger.warning("⚠️  Cannot trigger emergency call - Vapi MCP not connected")
                return
            
                        # Use single assistant and phone number for all emergencies
            if not self.vapi_assistant_id or not self.vapi_phone_number_id:
                self.logger.error("❌ Missing Vapi configuration (VAPI_ASSISTANT_ID or VAPI_PHONE_NUMBER_ID)")
                return
            
            # Make single emergency call
            try:
                call_response = await mcp_manager.create_vapi_call(
                    assistant_id=self.vapi_assistant_id,
                    phone_number_id=self.vapi_phone_number_id,
                    customer_number=self.receiver_phone_number,
                    metadata={
                        "emergency_call": True,
                        "emergency_level": assessment.level.value,
                        "emergency_type": assessment.emergency_type.value,
                        "callsign": assessment.context.callsign,
                        "confidence": assessment.confidence,
                        "reasoning": assessment.reasoning,
                        "transcript": assessment.context.transcript,
                        "timestamp": assessment.context.timestamp.isoformat()
                    }
                )
                
                if call_response.success:
                    self.logger.info(f"📞 Emergency call initiated to {self.receiver_phone_number} "
                                   f"for {assessment.context.callsign} "
                                   f"({assessment.level.value} - {assessment.confidence:.2f} confidence)")
                else:
                    self.logger.error(f"❌ Failed to create emergency call: {call_response.error}")
                
            except Exception as e:
                self.logger.error(f"❌ Failed to create emergency call: {e}")
                    
        except Exception as e:
            self.logger.error(f"❌ Error triggering emergency call: {e}")
    
    # Simplified - single assistant for all emergency levels
    
    async def test_emergency_call(self, test_number: str, message: str = "Test emergency call"):
        """Test emergency calling functionality"""
        try:
            from ..core.mcp_integration import get_mcp_manager
            
            mcp_manager = get_mcp_manager()
            
            if not mcp_manager.is_server_connected("vapi"):
                self.logger.error("❌ Cannot test emergency call - Vapi MCP not connected")
                return False
            
            call_response = await mcp_manager.create_vapi_call(
                assistant_id=self.vapi_assistant_id,
                phone_number_id=self.vapi_phone_number_id,
                customer_number=test_number,
                metadata={
                    "test_call": True,
                    "message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
            
            if call_response.success:
                self.logger.info(f"✅ Test emergency call successful to {test_number}")
                return True
            else:
                self.logger.error(f"❌ Test emergency call failed: {call_response.error}")
                return False
            
        except Exception as e:
            self.logger.error(f"❌ Test emergency call failed: {e}")
            return False


# Create global ASI:One instance
asi_one_agent = None

def get_asi_one_agent() -> ASIOneAgent:
    """Get or create ASI:One agent instance"""
    global asi_one_agent
    
    if asi_one_agent is None:
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            raise ValueError("GROQ_API_KEY environment variable required")
            
        asi_one_agent = ASIOneAgent(groq_api_key)
    
    return asi_one_agent


async def analyze_atc_emergency(callsign: str, transcript: str, instructions: List[str], 
                               runways: List[str], **kwargs) -> EmergencyAssessment:
    """
    Convenience function to analyze ATC communication for emergencies
    
    Args:
        callsign: Aircraft callsign
        transcript: Raw ATC transcript
        instructions: Extracted ATC instructions
        runways: Runway information
        **kwargs: Additional context (aircraft_state, weather_conditions, etc.)
        
    Returns:
        EmergencyAssessment from ASI:One
    """
    agent = get_asi_one_agent()
    
    context = EmergencyContext(
        callsign=callsign,
        transcript=transcript,
        timestamp=datetime.now(timezone.utc),
        instructions=instructions,
        runways=runways,
        aircraft_state=kwargs.get("aircraft_state"),
        weather_conditions=kwargs.get("weather_conditions"),
        radar_data=kwargs.get("radar_data"),
        audio_analysis=kwargs.get("audio_analysis")
    )
    
    return await agent.analyze_emergency(context)


if __name__ == "__main__":
    # Test the ASI:One agent
    async def test_asi_one():
        agent = get_asi_one_agent()
        
        # Test emergency detection
        test_context = EmergencyContext(
            callsign="UAL123",
            transcript="MAYDAY MAYDAY UAL123 experiencing engine failure requesting immediate landing",
            timestamp=datetime.now(timezone.utc),
            instructions=["emergency_landing"],
            runways=["28L"]
        )
        
        assessment = await agent.analyze_emergency(test_context)
        print(f"Assessment: {assessment.level.value} - {assessment.reasoning}")
        
        # Test emergency call (if configured)
        test_number = os.getenv("TEST_PHONE_NUMBER")
        if test_number:
            await agent.test_emergency_call(test_number, "ASI:One test call")
    
    asyncio.run(test_asi_one()) 