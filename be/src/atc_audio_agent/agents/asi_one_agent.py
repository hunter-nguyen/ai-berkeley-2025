#!/usr/bin/env python3
"""
ASI:One Agent - Emergency Detection and Reasoning Layer
Analyzes ATC transcripts and decides if situations warrant emergency escalation
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from uagents import Agent, Context, Model
from uagents.experimental.quota import QuotaProtocol
from groq import Groq

logger = logging.getLogger(__name__)

# ASI:One Compatible Models
class ATCContextMessage(Model):
    """Structured ATC context for analysis"""
    callsign: str
    raw_transcript: str
    structured_data: Dict[str, Any]
    metadata: Dict[str, Any]
    timestamp: str
    confidence: float
    aircraft_state: Optional[Dict[str, Any]] = None

class EmergencyRecommendation(Model):
    """Emergency recommendation output"""
    suggest_action: bool
    recommendation: str
    callsign: str
    urgency_level: str  # "low", "medium", "high", "critical"
    emergency_type: str  # "mayday", "pan_pan", "medical", "mechanical", "weather"
    context_summary: str
    confidence: float
    timestamp: str

class ASIOneAgent:
    """ASI:One LLM Reasoning Layer for Emergency Detection"""
    
    def __init__(self, groq_api_key: str, model: str = "llama3-70b-8192"):
        self.client = Groq(api_key=groq_api_key)
        self.model = model
        self.emergency_keywords = {
            "critical": ["mayday", "emergency", "fire", "smoke", "engine failure"],
            "high": ["pan pan", "medical emergency", "fuel emergency", "hydraulic failure"],
            "medium": ["priority", "assistance", "divert", "return to field"],
            "low": ["maintenance", "precautionary", "request vectors"]
        }
        
    async def analyze_atc_context(self, context: ATCContextMessage) -> EmergencyRecommendation:
        """Analyze ATC context and determine if emergency action is needed"""
        try:
            # Create comprehensive analysis prompt
            prompt = self._build_analysis_prompt(context)
            
            # Get LLM analysis
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=500
            )
            
            analysis_text = response.choices[0].message.content.strip()
            
            # Parse emergency indicators
            emergency_detected = self._detect_emergency_indicators(
                context.raw_transcript, analysis_text
            )
            
            # Build recommendation
            recommendation = self._build_recommendation(
                context, analysis_text, emergency_detected
            )
            
            logger.info(f"ASI:One analysis for {context.callsign}: "
                       f"Emergency={recommendation.suggest_action}, "
                       f"Level={recommendation.urgency_level}")
            
            return recommendation
            
        except Exception as e:
            logger.error(f"ASI:One analysis failed: {e}")
            return EmergencyRecommendation(
                suggest_action=False,
                recommendation=f"Analysis failed: {str(e)}",
                callsign=context.callsign,
                urgency_level="low",
                emergency_type="unknown",
                context_summary="Error in analysis",
                confidence=0.0,
                timestamp=datetime.now().isoformat()
            )
    
    def _build_analysis_prompt(self, context: ATCContextMessage) -> str:
        """Build comprehensive analysis prompt for LLM"""
        return f"""
You are an expert aviation safety analyst. Analyze this ATC communication for emergency situations.

TRANSCRIPT: "{context.raw_transcript}"
CALLSIGN: {context.callsign}
STRUCTURED DATA: {context.structured_data}
AIRCRAFT STATE: {context.aircraft_state or "Unknown"}
CONFIDENCE: {context.confidence}

EMERGENCY INDICATORS TO DETECT:
- MAYDAY: Life-threatening emergency (engine failure, fire, structural damage)
- PAN-PAN: Urgent but not immediately life-threatening (medical, mechanical issues)
- FUEL EMERGENCY: Low fuel, diversion needed
- WEATHER EMERGENCY: Severe weather avoidance, icing, turbulence
- MEDICAL EMERGENCY: Passenger or crew medical issues
- SECURITY EMERGENCY: Hijacking, bomb threats, unruly passengers

ANALYSIS REQUIRED:
1. Does this communication indicate an emergency situation?
2. What type of emergency (if any)?
3. What is the urgency level (critical/high/medium/low)?
4. What immediate action should ATC take?
5. Should emergency services be notified?

Provide analysis focusing on aviation safety protocols and emergency procedures.
Be conservative - better to escalate unnecessarily than miss a real emergency.

Response format: Clear analysis explaining your reasoning and recommended actions.
"""
    
    def _detect_emergency_indicators(self, transcript: str, analysis: str) -> Dict[str, Any]:
        """Detect emergency indicators in transcript and analysis"""
        transcript_lower = transcript.lower()
        analysis_lower = analysis.lower()
        
        emergency_indicators = {
            "mayday_declared": any(word in transcript_lower for word in ["mayday", "emergency"]),
            "pan_pan_declared": "pan pan" in transcript_lower,
            "fuel_emergency": any(word in transcript_lower for word in ["fuel", "low fuel", "minimum fuel"]),
            "medical_emergency": any(word in transcript_lower for word in ["medical", "sick", "heart attack"]),
            "mechanical_issue": any(word in transcript_lower for word in ["engine", "hydraulic", "gear", "flaps"]),
            "weather_emergency": any(word in transcript_lower for word in ["icing", "turbulence", "storm"]),
            "fire_smoke": any(word in transcript_lower for word in ["fire", "smoke", "burning"]),
            "priority_landing": any(word in transcript_lower for word in ["priority", "straight in", "vectors"])
        }
        
        # Analyze LLM response for emergency recommendations
        emergency_in_analysis = any(word in analysis_lower for word in [
            "emergency", "urgent", "immediate", "critical", "evacuate", "alert"
        ])
        
        return {
            **emergency_indicators,
            "analysis_suggests_emergency": emergency_in_analysis,
            "total_indicators": sum(emergency_indicators.values())
        }
    
    def _build_recommendation(self, context: ATCContextMessage, 
                            analysis: str, indicators: Dict[str, Any]) -> EmergencyRecommendation:
        """Build emergency recommendation based on analysis"""
        
        # Determine if action is needed
        suggest_action = (
            indicators["mayday_declared"] or
            indicators["pan_pan_declared"] or
            indicators["fire_smoke"] or
            indicators["total_indicators"] >= 2 or
            indicators["analysis_suggests_emergency"]
        )
        
        # Determine urgency level
        if indicators["mayday_declared"] or indicators["fire_smoke"]:
            urgency_level = "critical"
        elif indicators["pan_pan_declared"] or indicators["medical_emergency"]:
            urgency_level = "high"
        elif indicators["fuel_emergency"] or indicators["mechanical_issue"]:
            urgency_level = "medium"
        else:
            urgency_level = "low"
        
        # Determine emergency type
        emergency_type = "unknown"
        if indicators["mayday_declared"]:
            emergency_type = "mayday"
        elif indicators["pan_pan_declared"]:
            emergency_type = "pan_pan"
        elif indicators["medical_emergency"]:
            emergency_type = "medical"
        elif indicators["mechanical_issue"]:
            emergency_type = "mechanical"
        elif indicators["weather_emergency"]:
            emergency_type = "weather"
        elif indicators["fuel_emergency"]:
            emergency_type = "fuel"
        
        # Build recommendation text
        if suggest_action:
            recommendation = f"EMERGENCY DETECTED: {analysis[:200]}..."
        else:
            recommendation = "Normal communication - no emergency action required"
        
        return EmergencyRecommendation(
            suggest_action=suggest_action,
            recommendation=recommendation,
            callsign=context.callsign,
            urgency_level=urgency_level,
            emergency_type=emergency_type,
            context_summary=context.raw_transcript[:100],
            confidence=min(context.confidence + 0.1, 1.0),
            timestamp=datetime.now().isoformat()
        )

# Create ASI:One compatible uAgent
def create_asi_one_agent(groq_api_key: str, agent_name: str = "ASI_One_Emergency_Agent") -> Agent:
    """Create ASI:One compatible uAgent for emergency detection"""
    
    agent = Agent(name=agent_name, seed=f"{agent_name}_seed_2025")
    asi_one = ASIOneAgent(groq_api_key)
    
    # Protocol for emergency analysis
    emergency_protocol = QuotaProtocol(
        storage_reference=agent.storage,
        name="EmergencyAnalysisProtocol", 
        version="1.0.0"
    )
    
    @emergency_protocol.on_message(ATCContextMessage, replies={EmergencyRecommendation})
    async def handle_atc_context(ctx: Context, sender: str, msg: ATCContextMessage):
        """Handle ATC context analysis requests"""
        ctx.logger.info(f"🧠 ASI:One analyzing context for {msg.callsign}")
        
        try:
            recommendation = await asi_one.analyze_atc_context(msg)
            
            if recommendation.suggest_action:
                ctx.logger.warning(f"🚨 EMERGENCY DETECTED: {msg.callsign} - {recommendation.urgency_level}")
                ctx.logger.warning(f"   Recommendation: {recommendation.recommendation}")
            else:
                ctx.logger.info(f"✅ Normal operation: {msg.callsign}")
            
            await ctx.send(sender, recommendation)
            
        except Exception as e:
            ctx.logger.error(f"ASI:One analysis error: {e}")
            error_recommendation = EmergencyRecommendation(
                suggest_action=False,
                recommendation=f"Analysis error: {str(e)}",
                callsign=msg.callsign,
                urgency_level="low",
                emergency_type="unknown",
                context_summary="Error",
                confidence=0.0,
                timestamp=datetime.now().isoformat()
            )
            await ctx.send(sender, error_recommendation)
    
    agent.include(emergency_protocol, publish_manifest=True)
    return agent

if __name__ == "__main__":
    import os
    from dotenv import load_dotenv
    load_dotenv()
    
    # Create and run ASI:One agent
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        logger.error("GROQ_API_KEY not set!")
        exit(1)
    
    agent = create_asi_one_agent(groq_key)
    logger.info("🧠 Starting ASI:One Emergency Detection Agent...")
    agent.run() 