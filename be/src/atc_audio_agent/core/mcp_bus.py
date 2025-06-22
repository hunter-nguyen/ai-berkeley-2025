#!/usr/bin/env python3
"""
MCP Orchestration Bus
Coordinates messages between ASI:One Agent, Vapi Bridge, and other system components
"""
import asyncio
import logging
import json
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, asdict
from uagents import Agent, Context, Model
from uagents.experimental.quota import QuotaProtocol

logger = logging.getLogger(__name__)

# MCP Message Models
class MCPMessage(Model):
    """Base MCP message format"""
    message_id: str
    topic: str
    sender: str
    timestamp: str
    payload: Dict[str, Any]

class EmergencyCallRequest(Model):
    """Emergency call request via MCP"""
    callsign: str
    emergency_type: str
    urgency_level: str
    reason: str
    contact_number: str
    timestamp: str
    metadata: Dict[str, Any]

class CallStatusResponse(Model):
    """Vapi call status response"""
    call_id: str
    status: str  # "initiated", "connected", "completed", "failed"
    callsign: str
    timestamp: str
    details: Dict[str, Any]

@dataclass
class MCPTopics:
    """MCP topic definitions"""
    EMERGENCY_DETECTED = "emergency.detected"
    CALL_EMERGENCY = "emergency.call"
    CALL_STATUS = "emergency.call.status"
    SYSTEM_STATUS = "system.status"
    AGENT_HEARTBEAT = "agent.heartbeat"

class MCPBus:
    """Message Coordination Protocol Bus"""
    
    def __init__(self, agent_name: str = "MCP_Orchestration_Bus"):
        self.agent = Agent(name=agent_name, seed=f"{agent_name}_seed_2025")
        self.subscribers: Dict[str, List[Callable]] = {}
        self.message_history: List[MCPMessage] = []
        self.setup_protocols()
        
    def setup_protocols(self):
        """Setup MCP protocols and message handlers"""
        
        # Main MCP protocol
        mcp_protocol = QuotaProtocol(
            storage_reference=self.agent.storage,
            name="MCPOrchestrationProtocol",
            version="1.0.0"
        )
        
        @mcp_protocol.on_message(MCPMessage)
        async def handle_mcp_message(ctx: Context, sender: str, msg: MCPMessage):
            """Handle incoming MCP messages"""
            ctx.logger.info(f"📡 MCP received: {msg.topic} from {sender}")
            
            # Store message in history
            self.message_history.append(msg)
            
            # Route to subscribers
            await self._route_message(ctx, msg)
            
        # Emergency call protocol
        emergency_protocol = QuotaProtocol(
            storage_reference=self.agent.storage,
            name="EmergencyCallProtocol",
            version="1.0.0"
        )
        
        @emergency_protocol.on_message(EmergencyCallRequest, replies={CallStatusResponse})
        async def handle_emergency_call_request(ctx: Context, sender: str, msg: EmergencyCallRequest):
            """Handle emergency call requests"""
            ctx.logger.warning(f"🚨 Emergency call request: {msg.callsign} - {msg.emergency_type}")
            
            # Broadcast to MCP bus
            mcp_msg = MCPMessage(
                message_id=f"emergency_call_{datetime.now().timestamp()}",
                topic=MCPTopics.CALL_EMERGENCY,
                sender=sender,
                timestamp=msg.timestamp,
                payload=asdict(msg)
            )
            
            await self._broadcast_message(ctx, mcp_msg)
            
            # Return acknowledgment (actual call handling is done by Vapi bridge)
            response = CallStatusResponse(
                call_id=f"call_{msg.callsign}_{datetime.now().timestamp()}",
                status="queued",
                callsign=msg.callsign,
                timestamp=datetime.now().isoformat(),
                details={"message": "Emergency call request queued for processing"}
            )
            
            await ctx.send(sender, response)
        
        self.agent.include(mcp_protocol, publish_manifest=True)
        self.agent.include(emergency_protocol, publish_manifest=True)
        
    async def _route_message(self, ctx: Context, message: MCPMessage):
        """Route message to topic subscribers"""
        if message.topic in self.subscribers:
            for callback in self.subscribers[message.topic]:
                try:
                    await callback(ctx, message)
                except Exception as e:
                    ctx.logger.error(f"Error in subscriber callback: {e}")
    
    async def _broadcast_message(self, ctx: Context, message: MCPMessage):
        """Broadcast message to all connected agents"""
        ctx.logger.info(f"📡 Broadcasting MCP message: {message.topic}")
        # In a real implementation, this would send to all known agents
        # For now, we log and store
        self.message_history.append(message)
    
    def subscribe(self, topic: str, callback: Callable):
        """Subscribe to MCP topic"""
        if topic not in self.subscribers:
            self.subscribers[topic] = []
        self.subscribers[topic].append(callback)
        logger.info(f"📡 Subscribed to MCP topic: {topic}")
    
    async def publish(self, topic: str, payload: Dict[str, Any], sender: str = "system"):
        """Publish message to MCP bus"""
        message = MCPMessage(
            message_id=f"{topic}_{datetime.now().timestamp()}",
            topic=topic,
            sender=sender,
            timestamp=datetime.now().isoformat(),
            payload=payload
        )
        
        # In a real implementation, this would send via uAgents
        logger.info(f"📡 Publishing to MCP: {topic}")
        self.message_history.append(message)
        
        # Route to local subscribers
        if topic in self.subscribers:
            for callback in self.subscribers[topic]:
                try:
                    await callback(None, message)  # No context for direct publish
                except Exception as e:
                    logger.error(f"Error in subscriber callback: {e}")
    
    def get_message_history(self, topic: Optional[str] = None, limit: int = 100) -> List[MCPMessage]:
        """Get message history, optionally filtered by topic"""
        if topic:
            filtered = [msg for msg in self.message_history if msg.topic == topic]
            return filtered[-limit:]
        return self.message_history[-limit:]
    
    def run(self):
        """Run the MCP bus agent"""
        logger.info("📡 Starting MCP Orchestration Bus...")
        self.agent.run()

# MCP Bus Integration for existing system
class MCPIntegration:
    """Integration layer for existing ATC system with MCP"""
    
    def __init__(self, mcp_bus: MCPBus):
        self.mcp_bus = mcp_bus
        self.setup_subscriptions()
    
    def setup_subscriptions(self):
        """Setup MCP subscriptions for ATC system integration"""
        
        # Subscribe to emergency detection
        self.mcp_bus.subscribe(
            MCPTopics.EMERGENCY_DETECTED, 
            self.handle_emergency_detected
        )
        
        # Subscribe to call status updates
        self.mcp_bus.subscribe(
            MCPTopics.CALL_STATUS,
            self.handle_call_status
        )
    
    async def handle_emergency_detected(self, ctx: Optional[Context], message: MCPMessage):
        """Handle emergency detection messages"""
        payload = message.payload
        logger.warning(f"🚨 MCP Integration: Emergency detected for {payload.get('callsign')}")
        
        # Here you could:
        # 1. Update dashboard UI
        # 2. Send notifications
        # 3. Log to database
        # 4. Trigger additional monitoring
        
    async def handle_call_status(self, ctx: Optional[Context], message: MCPMessage):
        """Handle call status updates"""
        payload = message.payload
        logger.info(f"📞 MCP Integration: Call status update - {payload.get('status')}")
        
        # Here you could:
        # 1. Update UI with call progress
        # 2. Log call outcomes
        # 3. Send confirmations to stakeholders
    
    async def send_emergency_alert(self, callsign: str, emergency_type: str, 
                                 urgency_level: str, reason: str):
        """Send emergency alert through MCP"""
        await self.mcp_bus.publish(
            MCPTopics.EMERGENCY_DETECTED,
            {
                "callsign": callsign,
                "emergency_type": emergency_type,
                "urgency_level": urgency_level,
                "reason": reason,
                "source": "ATC_System"
            },
            sender="ATC_Integration"
        )

if __name__ == "__main__":
    # Example usage
    async def main():
        # Create MCP bus
        mcp_bus = MCPBus()
        
        # Create integration
        integration = MCPIntegration(mcp_bus)
        
        # Example: Send emergency alert
        await integration.send_emergency_alert(
            callsign="DAL1749",
            emergency_type="mechanical",
            urgency_level="high",
            reason="Engine failure reported"
        )
        
        # Run MCP bus
        mcp_bus.run()
    
    asyncio.run(main()) 