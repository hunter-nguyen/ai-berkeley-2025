import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

try:
    from letta_client import Letta, MessageCreate, TextContent
    LETTA_AVAILABLE = True
except ImportError:
    print("Warning: Letta client not installed. Run 'pip install letta-client'")
    LETTA_AVAILABLE = False
    Letta = None
    MessageCreate = None
    TextContent = None


@dataclass
class ShiftEvent:
    timestamp: str
    callsign: str
    message: str
    event_type: str
    urgency: str
    summary: str


class LettaShiftAgent:
    def __init__(self, api_key: str):
        """Initialize Letta agent for ATC shift management"""
        if not LETTA_AVAILABLE:
            raise ImportError("Letta client not available. Please install with: pip install letta-client")
        
        # Initialize Letta client for cloud (uses token parameter)
        self.client = Letta(token=api_key)
        self.agent_id = None
        self.current_shift_events = []
        self.shift_memories = {}
        
        # Initialize agent
        self._create_agent()
    
    def _create_agent(self):
        """Create or retrieve Letta agent"""
        try:
            # Try to get existing agent
            agents = self.client.agents.list()
            for agent in agents:
                if agent.name == "ATC_Shift_Controller":
                    self.agent_id = agent.id
                    return
            
            # Create new agent if none exists using correct API
            agent = self.client.agents.create(
                name="ATC_Shift_Controller",
                system="You are an experienced ATC supervisor who tracks events during shifts and provides detailed handover summaries. You remember patterns, ongoing situations, and critical details that incoming controllers need to know. Focus on:\n"
                      "- Critical ongoing situations\n"
                      "- Aircraft requiring special attention\n" 
                      "- Weather or equipment issues\n"
                      "- Traffic patterns and volume\n"
                      "- Safety concerns or unusual events\n"
                      "- Frequency congestion or communication issues",
                description="ATC shift handover agent for tracking aviation communications and generating intelligent summaries",
                include_base_tools=True
            )
            self.agent_id = agent.id
            
        except Exception as e:
            print(f"Error creating Letta agent: {e}")
            raise
    
    def load_todays_messages(self, messages_file: str = "../messages.json") -> List[ShiftEvent]:
        """Load today's events from messages.json"""
        try:
            with open(messages_file, 'r') as f:
                messages = json.load(f)
            
            today = datetime.now().date()
            todays_events = []
            
            for msg in messages:
                msg_date = datetime.fromisoformat(msg['timestamp'].replace('Z', '+00:00')).date()
                if msg_date == today:
                    event = ShiftEvent(
                        timestamp=msg['timestamp'],
                        callsign=msg['callsign'],
                        message=msg['message'],
                        event_type=msg.get('type', 'communication'),
                        urgency='urgent' if msg.get('isUrgent', False) else 'normal',
                        summary=msg.get('atc_data', {}).get('summary', msg['message'])
                    )
                    todays_events.append(event)
            
            return sorted(todays_events, key=lambda x: x.timestamp)
            
        except Exception as e:
            print(f"Error loading messages: {e}")
            return []
    
    def update_agent_memory(self, events: List[ShiftEvent]):
        """Update agent memory with new events"""
        if not events:
            return
        
        # Group events by hour for better processing
        events_summary = self._summarize_events_by_hour(events)
        
        # Send events to agent
        for hour_summary in events_summary:
            try:
                message_content = f"Events for {hour_summary['hour']}:\n{hour_summary['summary']}\n" \
                                f"Key aircraft: {', '.join(hour_summary['key_callsigns'])}\n" \
                                f"Notable instructions: {', '.join(hour_summary['instructions'])}"
                
                self.client.agents.messages.create(
                    agent_id=self.agent_id,
                    messages=[MessageCreate(
                        role="user",
                        content=[TextContent(
                            type="text",
                            text=message_content
                        )]
                    )]
                )
            except Exception as e:
                print(f"Error updating agent memory: {e}")
    
    def _summarize_events_by_hour(self, events: List[ShiftEvent]) -> List[Dict]:
        """Group and summarize events by hour"""
        hourly_events = {}
        
        for event in events:
            hour = datetime.fromisoformat(event.timestamp.replace('Z', '+00:00')).strftime('%H:00')
            if hour not in hourly_events:
                hourly_events[hour] = {
                    'events': [],
                    'callsigns': set(),
                    'instructions': set(),
                    'urgent_count': 0
                }
            
            hourly_events[hour]['events'].append(event)
            hourly_events[hour]['callsigns'].add(event.callsign)
            if event.urgency == 'urgent':
                hourly_events[hour]['urgent_count'] += 1
        
        summaries = []
        for hour, data in hourly_events.items():
            summary = f"Hour {hour}: {len(data['events'])} communications"
            if data['urgent_count'] > 0:
                summary += f" ({data['urgent_count']} urgent)"
            
            summaries.append({
                'hour': hour,
                'summary': summary,
                'key_callsigns': list(data['callsigns'])[:5],  # Top 5 most active
                'instructions': [event.summary for event in data['events'][:3]]  # Top 3 summaries
            })
        
        return summaries
    
    def generate_shift_summary(self, shift_type: str = "handover") -> str:
        """Generate comprehensive shift summary"""
        try:
            prompt = f"""Please provide a comprehensive {shift_type} summary for the incoming controller. Include:

1. **Current Traffic Status**: Overall traffic volume and patterns
2. **Active Aircraft**: Key flights requiring ongoing attention
3. **Critical Issues**: Any ongoing problems, weather, or equipment issues  
4. **Watch Items**: Aircraft or situations that need monitoring
5. **Communication Notes**: Frequency issues, unusual communications
6. **Recommendations**: What the next controller should prioritize

Format this as a clear, actionable briefing that helps ensure safe and efficient operations."""

            response = self.client.agents.messages.create(
                agent_id=self.agent_id,
                messages=[MessageCreate(
                    role="user",
                    content=[TextContent(
                        type="text",
                        text=prompt
                    )]
                )]
            )
            
            return response.messages[-1].content
            
        except Exception as e:
            print(f"Error generating summary: {e}")
            return "Error generating shift summary. Please check manually."
    
    def add_manual_note(self, note: str, category: str = "general"):
        """Add manual note to agent memory"""
        try:
            formatted_note = f"[{category.upper()}] Manual note: {note}"
            self.client.agents.messages.create(
                agent_id=self.agent_id,
                messages=[MessageCreate(
                    role="user",
                    content=[TextContent(
                        type="text", 
                        text=formatted_note
                    )]
                )]
            )
        except Exception as e:
            print(f"Error adding manual note: {e}")
    
    def get_shift_patterns(self) -> Dict[str, Any]:
        """Analyze patterns from recent shifts"""
        try:
            response = self.client.agents.messages.create(
                agent_id=self.agent_id,
                messages=[MessageCreate(
                    role="user",
                    content=[TextContent(
                        type="text",
                        text="What patterns have you noticed in recent shifts? Any recurring issues or trends?"
                    )]
                )]
            )
            
            return {
                "patterns_analysis": response.messages[-1].content,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            print(f"Error getting patterns: {e}")
            return {"patterns_analysis": "Unable to analyze patterns", "timestamp": datetime.now().isoformat()}
    
    def load_comprehensive_data(self, messages_file: str = "../messages.json") -> Dict[str, Any]:
        """Load comprehensive data including messages, weather, and context"""
        try:
            # Load today's messages
            events = self.load_todays_messages(messages_file)
            
            # Load full message data
            with open(messages_file, 'r') as f:
                all_messages = json.load(f)
            
            today = datetime.now().date()
            todays_full_messages = [
                msg for msg in all_messages 
                if datetime.fromisoformat(msg['timestamp'].replace('Z', '+00:00')).date() == today
            ]
            
            # Create comprehensive data structure
            comprehensive_data = {
                "shift_date": today.isoformat(),
                "total_messages": len(todays_full_messages),
                "events_summary": events,
                "full_messages": todays_full_messages,
                "callsigns": list(set([msg.get('callsign', '') for msg in todays_full_messages if msg.get('callsign') != 'SYSTEM'])),
                "urgent_messages": [msg for msg in todays_full_messages if msg.get('isUrgent', False)],
                "runway_activity": list(set([runway for msg in todays_full_messages for runway in msg.get('runways', [])])),
                "instruction_types": list(set([inst for msg in todays_full_messages for inst in msg.get('instructions', [])])),
                "analysis_timestamp": datetime.now().isoformat()
            }
            
            return comprehensive_data
            
        except Exception as e:
            print(f"Error loading comprehensive data: {e}")
            return {"error": str(e)}
    
    def update_comprehensive_memory(self, comprehensive_data: Dict[str, Any]):
        """Update agent memory with comprehensive shift data"""
        try:
            # Create detailed memory update
            memory_content = f"""
# SHIFT DATA UPDATE - {comprehensive_data.get('shift_date', 'Unknown Date')}

## Summary Statistics
- **Total Communications**: {comprehensive_data.get('total_messages', 0)}
- **Active Callsigns**: {len(comprehensive_data.get('callsigns', []))}
- **Urgent Messages**: {len(comprehensive_data.get('urgent_messages', []))}
- **Runway Activity**: {', '.join(comprehensive_data.get('runway_activity', []))}
- **Instruction Types**: {', '.join(comprehensive_data.get('instruction_types', []))}

## Active Aircraft
{chr(10).join([f"- {callsign}" for callsign in comprehensive_data.get('callsigns', [])])}

## Recent Communications (Last 10)
{chr(10).join([
    f"**{msg.get('timestamp', '')}** - **{msg.get('callsign', '')}**: {msg.get('message', '')}"
    for msg in comprehensive_data.get('full_messages', [])[:10]
])}

## Critical Events
{chr(10).join([
    f"**URGENT** - {msg.get('timestamp', '')} - {msg.get('callsign', '')}: {msg.get('message', '')}"
    for msg in comprehensive_data.get('urgent_messages', [])
]) if comprehensive_data.get('urgent_messages') else "No urgent events recorded"}

Please analyze this data and be ready to provide shift handover summaries.
"""

            self.client.agents.messages.create(
                agent_id=self.agent_id,
                messages=[MessageCreate(
                    role="user",
                    content=[TextContent(
                        type="text",
                        text=memory_content
                    )]
                )]
            )
            
        except Exception as e:
            print(f"Error updating comprehensive memory: {e}")
    
    def generate_markdown_summary(self, shift_type: str = "handover", include_weather: bool = True) -> str:
        """Generate comprehensive markdown-style shift summary"""
        try:
            weather_context = ""
            if include_weather:
                weather_context = """
                
**Note**: Please also consider current KSFO weather conditions in your summary if available from recent communications or system data."""

            prompt = f"""Please provide a comprehensive {shift_type} summary in **MARKDOWN FORMAT** for the incoming controller. 

Generate a professional, well-structured summary using the following format:

# 🛩️ ATC Shift Handover Summary
**Date**: {datetime.now().strftime('%Y-%m-%d %H:%M')} UTC  
**Shift Type**: {shift_type.title()}

## 📊 Current Traffic Status
- Overall volume: [Assess from recent communications]
- Traffic patterns: [Describe arrival/departure flows]
- Active runways: [List from recent data]

## ✈️ Active Aircraft & Watch Items  
- **Priority Aircraft**: [Any aircraft requiring special attention]
- **Sequence Management**: [Current approach/departure sequences]
- **Special Handling**: [Medical, emergency, or priority flights]

## ⚠️ Critical Issues & Alerts
- **Weather Conditions**: [Current weather impact]
- **Equipment Status**: [Any equipment issues]
- **Airspace Restrictions**: [Active NOTAMs or restrictions]

## 📡 Communication Notes
- **Frequency Status**: [Any frequency congestion or issues]
- **Coordination**: [Inter-facility coordination notes]
- **Special Instructions**: [Non-standard procedures in effect]

## 🎯 Handover Recommendations
1. **Immediate Actions**: [What needs attention first]
2. **Watch Items**: [Situations to monitor]
3. **Expected Traffic**: [Anticipated arrivals/departures]
4. **Coordination Required**: [Who to contact and when]

## 📋 Additional Notes
[Any other relevant information for smooth shift transition]

---
*Generated by ATC Shift Agent at {datetime.now().strftime('%H:%M')} UTC*

Please fill in this template based on all the shift data and recent communications you have in memory.{weather_context}"""

            response = self.client.agents.messages.create(
                agent_id=self.agent_id,
                messages=[MessageCreate(
                    role="user",
                    content=[TextContent(
                        type="text",
                        text=prompt
                    )]
                )]
            )
            
            return response.messages[-1].content
            
        except Exception as e:
            print(f"Error generating markdown summary: {e}")
            return f"# ❌ Error Generating Summary\n\nUnable to generate shift summary: {str(e)}"


# Global instance
letta_agent: Optional[LettaShiftAgent] = None


def init_letta_agent(api_key: str) -> LettaShiftAgent:
    """Initialize global Letta agent"""
    if not LETTA_AVAILABLE:
        raise ImportError("Letta client not available. Please install with: pip install letta-client")
    
    global letta_agent
    if letta_agent is None:
        letta_agent = LettaShiftAgent(api_key)
    return letta_agent


def get_letta_agent() -> Optional[LettaShiftAgent]:
    """Get global Letta agent instance"""
    return letta_agent 