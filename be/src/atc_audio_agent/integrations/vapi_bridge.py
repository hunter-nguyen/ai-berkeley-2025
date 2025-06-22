#!/usr/bin/env python3
"""
Vapi Bridge - AI-Powered Emergency Call Integration
Listens to MCP emergency triggers and makes outbound calls via Vapi
"""
import asyncio
import logging
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from uagents import Agent, Context, Model
from uagents.experimental.quota import QuotaProtocol

logger = logging.getLogger(__name__)

# Mock Vapi implementation for testing
class MockVapi:
    def __init__(self, token: str):
        self.token = token
        
    class Assistants:
        def list(self):
            return []
        
        def create(self, config):
            return {"id": "mock_assistant_123"}
    
    class Calls:
        def create(self, **kwargs):
            return {"id": "mock_call_456", "status": "initiated"}
    
    def __init__(self, token: str):
        self.token = token
        self.assistants = self.Assistants()
        self.calls = self.Calls()

# Try to import real Vapi, fallback to mock
try:
    from vapi import Vapi
    logger.info("Using real Vapi SDK")
except ImportError:
    logger.warning("Vapi SDK not found, using mock implementation")
    Vapi = MockVapi

@dataclass
class EmergencyContact:
    """Emergency contact configuration"""
    name: str
    phone: str
    emergency_types: List[str]  # Which emergencies this contact handles
    priority: int  # Lower number = higher priority

@dataclass
class VapiCallConfig:
    """Vapi call configuration"""
    assistant_id: Optional[str] = None
    voice_id: Optional[str] = None
    model: str = "gpt-3.5-turbo"
    temperature: float = 0.3
    max_duration_seconds: int = 300  # 5 minutes max

class EmergencyCallMessage(Model):
    """Emergency call message from MCP"""
    callsign: str
    emergency_type: str
    urgency_level: str
    reason: str
    timestamp: str
    metadata: Dict[str, Any]

class CallResult(Model):
    """Call result response"""
    call_id: str
    status: str
    callsign: str
    contact_called: str
    success: bool
    error_message: Optional[str]
    timestamp: str

class VapiBridge:
    """Bridge between MCP emergency messages and Vapi outbound calls"""
    
    def __init__(self, vapi_token: str, agent_name: str = "Vapi_Emergency_Bridge"):
        self.vapi_client = Vapi(token=vapi_token)
        self.agent = Agent(name=agent_name, seed=f"{agent_name}_seed_2025")
        
        # Emergency contacts configuration
        self.emergency_contacts = [
            EmergencyContact(
                name="Emergency Services",
                phone="+1-911",  # Replace with actual emergency number
                emergency_types=["mayday", "fire", "medical"],
                priority=1
            ),
            EmergencyContact(
                name="Airport Operations",
                phone="+1-555-0100",  # Replace with actual airport ops
                emergency_types=["mechanical", "weather", "fuel"],
                priority=2
            ),
            EmergencyContact(
                name="Airline Dispatch",
                phone="+1-555-0200",  # Replace with actual airline dispatch
                emergency_types=["mechanical", "fuel", "weather"],
                priority=3
            )
        ]
        
        # Vapi call configuration
        self.call_config = VapiCallConfig()
        
        # Setup protocols
        self.setup_protocols()
    
    def setup_protocols(self):
        """Setup Vapi bridge protocols"""
        
        # MCP listener protocol
        mcp_protocol = QuotaProtocol(
            storage_reference=self.agent.storage,
            name="VapiMCPProtocol",
            version="1.0.0"
        )
        
        @mcp_protocol.on_message(EmergencyCallMessage, replies={CallResult})
        async def handle_emergency_call(ctx: Context, sender: str, msg: EmergencyCallMessage):
            """Handle emergency call requests from MCP"""
            ctx.logger.warning(f"📞 Vapi Bridge: Emergency call for {msg.callsign}")
            
            try:
                # Determine best contact
                contact = self._select_emergency_contact(msg.emergency_type, msg.urgency_level)
                
                if not contact:
                    raise Exception(f"No suitable contact found for {msg.emergency_type}")
                
                # Create emergency call via Vapi
                call_result = await self._make_emergency_call(ctx, msg, contact)
                
                await ctx.send(sender, call_result)
                
            except Exception as e:
                ctx.logger.error(f"Vapi Bridge error: {e}")
                
                error_result = CallResult(
                    call_id="error",
                    status="failed",
                    callsign=msg.callsign,
                    contact_called="none",
                    success=False,
                    error_message=str(e),
                    timestamp=datetime.now().isoformat()
                )
                
                await ctx.send(sender, error_result)
        
        self.agent.include(mcp_protocol, publish_manifest=True)
    
    def _select_emergency_contact(self, emergency_type: str, urgency_level: str) -> Optional[EmergencyContact]:
        """Select appropriate emergency contact based on emergency type and urgency"""
        
        # Filter contacts that handle this emergency type
        suitable_contacts = [
            contact for contact in self.emergency_contacts
            if emergency_type in contact.emergency_types
        ]
        
        if not suitable_contacts:
            # Fallback to first contact (highest priority)
            return self.emergency_contacts[0] if self.emergency_contacts else None
        
        # For critical/high urgency, prefer emergency services
        if urgency_level in ["critical", "high"]:
            emergency_services = [c for c in suitable_contacts if "Emergency Services" in c.name]
            if emergency_services:
                return emergency_services[0]
        
        # Otherwise, return highest priority suitable contact
        return min(suitable_contacts, key=lambda c: c.priority)
    
    async def _make_emergency_call(self, ctx: Context, emergency: EmergencyCallMessage, 
                                 contact: EmergencyContact) -> CallResult:
        """Make emergency call via Vapi"""
        
        try:
            # Build emergency message for the call
            emergency_message = self._build_emergency_message(emergency)
            
            # Create Vapi assistant for this call (if needed)
            assistant_id = await self._ensure_emergency_assistant(emergency_message)
            
            # Make the outbound call
            call_response = await self._create_vapi_call(
                contact.phone, 
                assistant_id, 
                emergency_message
            )
            
            ctx.logger.info(f"📞 Emergency call initiated: {call_response}")
            
            return CallResult(
                call_id=str(call_response.get('id', 'unknown')),
                status="initiated",
                callsign=emergency.callsign,
                contact_called=contact.name,
                success=True,
                error_message=None,
                timestamp=datetime.now().isoformat()
            )
            
        except Exception as e:
            ctx.logger.error(f"Emergency call failed: {e}")
            raise
    
    def _build_emergency_message(self, emergency: EmergencyCallMessage) -> str:
        """Build emergency message for the call"""
        
        urgency_prefix = {
            "critical": "🚨 CRITICAL EMERGENCY",
            "high": "⚠️ HIGH PRIORITY EMERGENCY", 
            "medium": "⚠️ PRIORITY ALERT",
            "low": "ℹ️ NOTIFICATION"
        }.get(emergency.urgency_level, "⚠️ EMERGENCY")
        
        message = f"""
{urgency_prefix}

Aircraft: {emergency.callsign}
Emergency Type: {emergency.emergency_type.upper()}
Time: {emergency.timestamp}

Details: {emergency.reason}

This is an automated emergency notification from the ATC monitoring system.
Please respond immediately and coordinate with air traffic control.

End of message.
"""
        return message.strip()
    
    async def _ensure_emergency_assistant(self, emergency_message: str) -> str:
        """Ensure emergency assistant exists, create if needed"""
        
        try:
            # Try to get existing emergency assistant
            assistants = self.vapi_client.assistants.list()
            
            # Look for existing emergency assistant
            for assistant in assistants:
                if isinstance(assistant, dict) and assistant.get('name') == 'Emergency_ATC_Assistant':
                    return assistant['id']
            
            # Create new emergency assistant
            assistant_config = {
                "name": "Emergency_ATC_Assistant",
                "model": {
                    "provider": "openai",
                    "model": self.call_config.model,
                    "temperature": self.call_config.temperature,
                    "systemMessage": f"""
You are an emergency notification assistant for air traffic control.

Your job is to clearly and urgently communicate emergency situations to emergency responders.

INSTRUCTIONS:
1. Speak clearly and slowly
2. State the emergency information exactly as provided
3. Ask for confirmation that the message was received
4. Do not add extra information or speculation
5. Be professional and urgent

EMERGENCY MESSAGE TO DELIVER:
{emergency_message}

Deliver this message, confirm receipt, and end the call.
"""
                },
                "voice": {
                    "provider": "11labs",
                    "voiceId": self.call_config.voice_id or "21m00Tcm4TlvDq8ikWAM"  # Default professional voice
                },
                "transcriber": {
                    "provider": "deepgram",
                    "model": "nova-2",
                    "language": "en-US"
                }
            }
            
            assistant_response = self.vapi_client.assistants.create(assistant_config)
            return assistant_response.get('id', 'mock_assistant')
            
        except Exception as e:
            logger.error(f"Failed to create emergency assistant: {e}")
            # Return mock ID for testing
            return "mock_assistant_123"
    
    async def _create_vapi_call(self, phone_number: str, assistant_id: Optional[str], 
                              emergency_message: str) -> Dict[str, Any]:
        """Create outbound call via Vapi"""
        
        call_config = {
            "phoneNumber": phone_number,
            "assistantId": assistant_id,
            "metadata": {
                "type": "emergency_notification",
                "timestamp": datetime.now().isoformat(),
                "message": emergency_message[:100]  # Truncated for metadata
            }
        }
        
        # Add additional config if no assistant ID
        if not assistant_id:
            call_config.update({
                "assistant": {
                    "model": {
                        "provider": "openai", 
                        "model": self.call_config.model,
                        "systemMessage": f"Deliver this emergency message: {emergency_message}"
                    }
                }
            })
        
        # Make the call
        response = await asyncio.to_thread(
            self.vapi_client.calls.create,
            **call_config
        )
        
        return response
    
    def run(self):
        """Run the Vapi bridge agent"""
        logger.info("📞 Starting Vapi Emergency Bridge...")
        self.agent.run()

# Integration helper
class VapiMCPListener:
    """Helper to listen to MCP messages and trigger Vapi calls"""
    
    def __init__(self, vapi_bridge: VapiBridge, mcp_topic: str = "emergency.call"):
        self.vapi_bridge = vapi_bridge
        self.mcp_topic = mcp_topic
    
    async def handle_mcp_emergency(self, ctx: Optional[Context], message):
        """Handle MCP emergency messages"""
        payload = message.payload
        
        # Convert MCP message to EmergencyCallMessage
        emergency_call = EmergencyCallMessage(
            callsign=payload.get('callsign', 'UNKNOWN'),
            emergency_type=payload.get('emergency_type', 'unknown'),
            urgency_level=payload.get('urgency_level', 'medium'),
            reason=payload.get('reason', 'Emergency situation detected'),
            timestamp=payload.get('timestamp', datetime.now().isoformat()),
            metadata=payload.get('metadata', {})
        )
        
        logger.warning(f"📞 MCP Emergency received: {emergency_call.callsign}")
        
        # This would normally send to the Vapi bridge agent
        # For now, we'll call directly
        # await self.vapi_bridge.handle_emergency_call(ctx, "mcp", emergency_call)

if __name__ == "__main__":
    # Example usage
    vapi_token = os.getenv("VAPI_TOKEN", "mock_token")
    
    bridge = VapiBridge(vapi_token)
    bridge.run() 