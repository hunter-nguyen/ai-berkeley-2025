#!/usr/bin/env python3
"""
Context Collection Pipeline
Aggregates data from AudioAgent, LanguageAgent, and other sources for ASI:One analysis
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from collections import defaultdict
import json

logger = logging.getLogger(__name__)

@dataclass
class AudioContext:
    """Context from audio processing"""
    chunk_id: int
    transcript: str
    confidence: float
    timestamp: str
    audio_quality: Optional[float] = None

@dataclass
class LanguageContext:
    """Context from ATC language analysis"""
    callsigns: List[str]
    instructions: List[str]
    runways: List[str]
    summary: str
    timestamp: str

@dataclass
class AircraftContext:
    """Aircraft state information"""
    callsign: str
    altitude: Optional[int] = None
    speed: Optional[int] = None
    heading: Optional[int] = None
    squawk: Optional[str] = None
    flight_plan: Optional[Dict[str, Any]] = None
    last_updated: Optional[str] = None

@dataclass
class SystemContext:
    """System-wide context"""
    active_flights: int
    emergency_count: int
    system_load: float
    timestamp: str

@dataclass
class ConsolidatedContext:
    """Consolidated context for ASI:One analysis"""
    callsign: str
    raw_transcript: str
    structured_data: Dict[str, Any]
    aircraft_state: Optional[Dict[str, Any]]
    system_context: Dict[str, Any]
    confidence: float
    timestamp: str
    metadata: Dict[str, Any]

class ContextCollector:
    """Collects and consolidates context from multiple agents"""
    
    def __init__(self, retention_hours: int = 24):
        self.retention_hours = retention_hours
        
        # Context storage
        self.audio_contexts: Dict[str, List[AudioContext]] = defaultdict(list)
        self.language_contexts: Dict[str, List[LanguageContext]] = defaultdict(list)
        self.aircraft_contexts: Dict[str, AircraftContext] = {}
        self.system_contexts: List[SystemContext] = []
        
        # Statistics
        self.stats = {
            "contexts_collected": 0,
            "consolidations_created": 0,
            "start_time": datetime.now()
        }
    
    async def add_audio_context(self, context: AudioContext):
        """Add audio processing context"""
        # Extract callsign from transcript if possible
        callsign = self._extract_callsign_from_transcript(context.transcript)
        
        if callsign:
            self.audio_contexts[callsign].append(context)
            logger.debug(f"Added audio context for {callsign}")
        else:
            # Store under generic key for orphaned transcripts
            self.audio_contexts["UNKNOWN"].append(context)
        
        self.stats["contexts_collected"] += 1
        await self._cleanup_old_contexts()
    
    async def add_language_context(self, context: LanguageContext):
        """Add language analysis context"""
        # Store context for each callsign mentioned
        for callsign in context.callsigns:
            self.language_contexts[callsign].append(context)
            logger.debug(f"Added language context for {callsign}")
        
        self.stats["contexts_collected"] += 1
    
    async def add_aircraft_context(self, callsign: str, context: AircraftContext):
        """Add or update aircraft state context"""
        context.last_updated = datetime.now().isoformat()
        self.aircraft_contexts[callsign] = context
        logger.debug(f"Updated aircraft context for {callsign}")
    
    async def add_system_context(self, context: SystemContext):
        """Add system-wide context"""
        self.system_contexts.append(context)
        
        # Keep only recent system contexts
        cutoff = datetime.now() - timedelta(hours=1)
        self.system_contexts = [
            ctx for ctx in self.system_contexts
            if datetime.fromisoformat(ctx.timestamp) > cutoff
        ]
    
    async def consolidate_context_for_callsign(self, callsign: str, 
                                             recent_minutes: int = 10) -> Optional[ConsolidatedContext]:
        """Consolidate all available context for a specific callsign"""
        
        cutoff = datetime.now() - timedelta(minutes=recent_minutes)
        
        # Get recent audio contexts
        recent_audio = [
            ctx for ctx in self.audio_contexts.get(callsign, [])
            if datetime.fromisoformat(ctx.timestamp) > cutoff
        ]
        
        # Get recent language contexts
        recent_language = [
            ctx for ctx in self.language_contexts.get(callsign, [])
            if datetime.fromisoformat(ctx.timestamp) > cutoff
        ]
        
        if not recent_audio and not recent_language:
            return None
        
        # Find the most recent transcript
        latest_audio = max(recent_audio, key=lambda x: x.timestamp) if recent_audio else None
        latest_language = max(recent_language, key=lambda x: x.timestamp) if recent_language else None
        
        # Build consolidated context
        raw_transcript = latest_audio.transcript if latest_audio else ""
        
        # Combine structured data from language analysis
        structured_data = {}
        if recent_language:
            all_callsigns = list(set([cs for ctx in recent_language for cs in ctx.callsigns]))
            all_instructions = list(set([inst for ctx in recent_language for inst in ctx.instructions]))
            all_runways = list(set([rw for ctx in recent_language for rw in ctx.runways]))
            
            structured_data = {
                "callsigns": all_callsigns,
                "instructions": all_instructions,
                "runways": all_runways,
                "recent_summaries": [ctx.summary for ctx in recent_language[-3:]]  # Last 3 summaries
            }
        
        # Get aircraft state
        aircraft_state = None
        if callsign in self.aircraft_contexts:
            aircraft_state = asdict(self.aircraft_contexts[callsign])
        
        # Get latest system context
        system_context = {}
        if self.system_contexts:
            latest_system = max(self.system_contexts, key=lambda x: x.timestamp)
            system_context = asdict(latest_system)
        
        # Calculate confidence (average of audio confidences)
        confidence = 0.8  # Default
        if recent_audio:
            confidence = sum(ctx.confidence for ctx in recent_audio) / len(recent_audio)
        
        # Create consolidated context
        consolidated = ConsolidatedContext(
            callsign=callsign,
            raw_transcript=raw_transcript,
            structured_data=structured_data,
            aircraft_state=aircraft_state,
            system_context=system_context,
            confidence=confidence,
            timestamp=datetime.now().isoformat(),
            metadata={
                "audio_contexts": len(recent_audio),
                "language_contexts": len(recent_language),
                "consolidation_window_minutes": recent_minutes
            }
        )
        
        self.stats["consolidations_created"] += 1
        logger.info(f"Consolidated context for {callsign}: "
                   f"{len(recent_audio)} audio + {len(recent_language)} language contexts")
        
        return consolidated
    
    async def get_emergency_candidates(self, lookback_minutes: int = 5) -> List[str]:
        """Get callsigns that might need emergency analysis"""
        
        cutoff = datetime.now() - timedelta(minutes=lookback_minutes)
        candidates = set()
        
        # Look for callsigns with recent activity
        for callsign, contexts in self.language_contexts.items():
            recent_contexts = [
                ctx for ctx in contexts
                if datetime.fromisoformat(ctx.timestamp) > cutoff
            ]
            
            if recent_contexts:
                # Check for emergency indicators in instructions
                emergency_instructions = ["emergency", "mayday", "pan_pan", "priority", "medical"]
                for ctx in recent_contexts:
                    if any(emergency_word in " ".join(ctx.instructions).lower() 
                          for emergency_word in emergency_instructions):
                        candidates.add(callsign)
                        break
                
                # Also add if multiple recent communications (could indicate issues)
                if len(recent_contexts) >= 3:
                    candidates.add(callsign)
        
        return list(candidates)
    
    def _extract_callsign_from_transcript(self, transcript: str) -> Optional[str]:
        """Extract callsign from transcript using simple patterns"""
        import re
        
        # Common airline patterns
        patterns = [
            r'\b(UAL|UNITED)\s*(\d+)\b',      # United 123
            r'\b(AAL|AMERICAN)\s*(\d+)\b',    # American 456
            r'\b(DAL|DELTA)\s*(\d+)\b',       # Delta 789
            r'\b(SWA|SOUTHWEST)\s*(\d+)\b',   # Southwest 101
            r'\b([A-Z]{2,3})\s*(\d{1,4})\b', # Generic airline codes
            r'\b([A-Z]\d{2,4})\b',            # General aviation N123AB
        ]
        
        transcript_upper = transcript.upper()
        
        for pattern in patterns:
            match = re.search(pattern, transcript_upper)
            if match:
                if len(match.groups()) == 2:
                    return f"{match.group(1)}{match.group(2)}"
                else:
                    return match.group(1)
        
        return None
    
    async def _cleanup_old_contexts(self):
        """Remove contexts older than retention period"""
        cutoff = datetime.now() - timedelta(hours=self.retention_hours)
        
        # Clean audio contexts
        for callsign in list(self.audio_contexts.keys()):
            self.audio_contexts[callsign] = [
                ctx for ctx in self.audio_contexts[callsign]
                if datetime.fromisoformat(ctx.timestamp) > cutoff
            ]
            if not self.audio_contexts[callsign]:
                del self.audio_contexts[callsign]
        
        # Clean language contexts
        for callsign in list(self.language_contexts.keys()):
            self.language_contexts[callsign] = [
                ctx for ctx in self.language_contexts[callsign]
                if datetime.fromisoformat(ctx.timestamp) > cutoff
            ]
            if not self.language_contexts[callsign]:
                del self.language_contexts[callsign]
        
        # Clean aircraft contexts (keep if updated recently)
        for callsign in list(self.aircraft_contexts.keys()):
            aircraft_ctx = self.aircraft_contexts[callsign]
            if (aircraft_ctx.last_updated and 
                datetime.fromisoformat(aircraft_ctx.last_updated) < cutoff):
                del self.aircraft_contexts[callsign]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get collector statistics"""
        return {
            **self.stats,
            "active_callsigns": len(set(list(self.audio_contexts.keys()) + 
                                       list(self.language_contexts.keys()))),
            "aircraft_tracked": len(self.aircraft_contexts),
            "uptime_hours": (datetime.now() - self.stats["start_time"]).total_seconds() / 3600
        }

# Integration with existing ATC system
class ATCContextIntegration:
    """Integration layer for ATC system with context collection"""
    
    def __init__(self, context_collector: ContextCollector):
        self.collector = context_collector
    
    async def process_atc_result(self, chunk_count: int, transcript: str, 
                               atc_analysis: Dict[str, Any], confidence: float = 0.8):
        """Process results from existing ATC system"""
        
        timestamp = datetime.now().isoformat()
        
        # Add audio context
        audio_ctx = AudioContext(
            chunk_id=chunk_count,
            transcript=transcript,
            confidence=confidence,
            timestamp=timestamp
        )
        await self.collector.add_audio_context(audio_ctx)
        
        # Add language context if analysis is available
        if "atc_analysis" in atc_analysis:
            analysis = atc_analysis["atc_analysis"]
            
            # Extract callsigns from analysis
            callsigns = []
            if "callsigns" in analysis:
                for cs in analysis["callsigns"]:
                    if isinstance(cs, dict) and "callsign" in cs:
                        callsigns.append(cs["callsign"])
                    elif isinstance(cs, str):
                        callsigns.append(cs)
            
            # Extract instructions
            instructions = []
            if "instructions" in analysis:
                for inst in analysis["instructions"]:
                    if isinstance(inst, dict) and "type" in inst:
                        instructions.append(inst["type"])
                    elif isinstance(inst, str):
                        instructions.append(inst)
            
            language_ctx = LanguageContext(
                callsigns=callsigns,
                instructions=instructions,
                runways=analysis.get("runways", []),
                summary=analysis.get("summary", ""),
                timestamp=timestamp
            )
            await self.collector.add_language_context(language_ctx)
        
        # Update system context
        system_ctx = SystemContext(
            active_flights=len(self.collector.aircraft_contexts),
            emergency_count=0,  # Would be calculated from emergency states
            system_load=0.5,    # Would be calculated from system metrics
            timestamp=timestamp
        )
        await self.collector.add_system_context(system_ctx)

if __name__ == "__main__":
    # Example usage
    async def main():
        collector = ContextCollector()
        integration = ATCContextIntegration(collector)
        
        # Simulate ATC result processing
        await integration.process_atc_result(
            chunk_count=1,
            transcript="United 1749, one more arrival, 5 miles on it. Prior.",
            atc_analysis={
                "atc_analysis": {
                    "callsigns": ["UAL1749"],
                    "instructions": ["arrival"],
                    "runways": [],
                    "summary": "Arrival instructions for UAL1749"
                }
            }
        )
        
        # Get consolidated context
        consolidated = await collector.consolidate_context_for_callsign("UAL1749")
        if consolidated:
            print(f"Consolidated context: {consolidated}")
        
        # Get emergency candidates
        candidates = await collector.get_emergency_candidates()
        print(f"Emergency candidates: {candidates}")
        
        # Get stats
        stats = collector.get_stats()
        print(f"Collector stats: {stats}")
    
    asyncio.run(main()) 