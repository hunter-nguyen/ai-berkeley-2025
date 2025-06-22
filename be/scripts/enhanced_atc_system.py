#!/usr/bin/env python3
"""
Enhanced ATC System with ASI:One Agent Integration
Integrates emergency detection, context collection, MCP orchestration, and Vapi calling
"""
import os
import sys
import asyncio
import logging
from dotenv import load_dotenv

# Add src to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.atc_audio_agent.core.audio_processor import AudioProcessor
from src.atc_audio_agent.agents.atc_language_agent import ATCTranscriptProcessor
from src.atc_audio_agent.agents.asi_one_agent import ASIOneAgent, ATCContextMessage, EmergencyRecommendation
from src.atc_audio_agent.core.context_collector import ContextCollector, ATCContextIntegration
from src.atc_audio_agent.core.mcp_bus import MCPBus, MCPIntegration, MCPTopics
from src.atc_audio_agent.integrations.vapi_bridge import VapiBridge, VapiMCPListener

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
VAPI_TOKEN = os.getenv("VAPI_TOKEN")
LIVEATC_URL = os.getenv("LIVEATC_URL", "https://d.liveatc.net/ksfo_twr")
WEBSOCKET_PORT = int(os.getenv("WEBSOCKET_PORT", "8765"))

class EnhancedATCSystem:
    """Enhanced ATC system with emergency detection and calling capabilities"""
    
    def __init__(self):
        # Core components
        self.audio_processor = AudioProcessor(GROQ_API_KEY, WEBSOCKET_PORT)
        self.atc_language_processor = ATCTranscriptProcessor(GROQ_API_KEY)
        
        # New AI agent components
        self.asi_one_agent = ASIOneAgent(GROQ_API_KEY)
        self.context_collector = ContextCollector()
        self.atc_integration = ATCContextIntegration(self.context_collector)
        
        # MCP orchestration
        self.mcp_bus = MCPBus()
        self.mcp_integration = MCPIntegration(self.mcp_bus)
        
        # Vapi integration (if token available)
        self.vapi_bridge = None
        self.vapi_listener = None
        if VAPI_TOKEN:
            self.vapi_bridge = VapiBridge(VAPI_TOKEN)
            self.vapi_listener = VapiMCPListener(self.vapi_bridge)
            # Subscribe to emergency calls
            self.mcp_bus.subscribe(MCPTopics.CALL_EMERGENCY, self.vapi_listener.handle_mcp_emergency)
        else:
            logger.warning("VAPI_TOKEN not set - emergency calling disabled")
    
    async def process_transcript_with_enhanced_analysis(self, transcript: str, chunk_count: int):
        """Enhanced transcript processing with emergency detection"""
        
        # Original ATC language processing
        transcript_data = {
            "text": transcript,
            "frequency": "KSFO_TWR",
            "timestamp": None,
            "chunk": chunk_count,
            "engine": "groq_whisper"
        }
        
        atc_result = await self.atc_language_processor.process_audio_transcript(transcript_data)
        
        # Log original results
        if "atc_analysis" in atc_result:
            analysis = atc_result["atc_analysis"]
            callsigns = analysis.get("callsigns", [])
            instructions = analysis.get("instructions", [])
            runways = analysis.get("runways", [])
            
            logger.info(f"🛩️  Callsigns: {[cs.get('callsign') if isinstance(cs, dict) else cs for cs in callsigns]}")
            logger.info(f"📋 Instructions: {[inst.get('type') if isinstance(inst, dict) else inst for inst in instructions]}")
            logger.info(f"🛬 Runways: {runways}")
            
            if analysis.get("summary"):
                logger.info(f"📝 Summary: {analysis['summary']}")
        
        # Feed into context collection
        await self.atc_integration.process_atc_result(
            chunk_count=chunk_count,
            transcript=transcript,
            atc_analysis=atc_result,
            confidence=0.8
        )
        
        # Check for emergency candidates
        emergency_candidates = await self.context_collector.get_emergency_candidates()
        
        if emergency_candidates:
            logger.warning(f"🚨 Emergency candidates detected: {emergency_candidates}")
            
            # Analyze each candidate with ASI:One
            for callsign in emergency_candidates:
                await self.analyze_emergency_candidate(callsign)
        
        return atc_result
    
    async def analyze_emergency_candidate(self, callsign: str):
        """Analyze potential emergency with ASI:One agent"""
        
        # Get consolidated context
        context = await self.context_collector.consolidate_context_for_callsign(callsign)
        
        if not context:
            logger.warning(f"No context available for emergency candidate {callsign}")
            return
        
        # Convert to ASI:One format
        atc_context = ATCContextMessage(
            callsign=context.callsign,
            raw_transcript=context.raw_transcript,
            structured_data=context.structured_data,
            metadata=context.metadata,
            timestamp=context.timestamp,
            confidence=context.confidence,
            aircraft_state=context.aircraft_state
        )
        
        # Get ASI:One analysis
        recommendation = await self.asi_one_agent.analyze_atc_context(atc_context)
        
        logger.info(f"🧠 ASI:One analysis for {callsign}:")
        logger.info(f"   Emergency: {recommendation.suggest_action}")
        logger.info(f"   Urgency: {recommendation.urgency_level}")
        logger.info(f"   Type: {recommendation.emergency_type}")
        logger.info(f"   Recommendation: {recommendation.recommendation}")
        
        # If emergency action is suggested, send to MCP
        if recommendation.suggest_action:
            await self.handle_emergency_recommendation(recommendation)
    
    async def handle_emergency_recommendation(self, recommendation: EmergencyRecommendation):
        """Handle emergency recommendation from ASI:One"""
        
        logger.warning(f"🚨 EMERGENCY ACTION RECOMMENDED for {recommendation.callsign}")
        logger.warning(f"   Type: {recommendation.emergency_type}")
        logger.warning(f"   Urgency: {recommendation.urgency_level}")
        logger.warning(f"   Reason: {recommendation.recommendation}")
        
        # Send alert through MCP
        await self.mcp_integration.send_emergency_alert(
            callsign=recommendation.callsign,
            emergency_type=recommendation.emergency_type,
            urgency_level=recommendation.urgency_level,
            reason=recommendation.recommendation
        )
        
        # For critical/high urgency, trigger emergency call
        if recommendation.urgency_level in ["critical", "high"] and self.vapi_bridge:
            await self.trigger_emergency_call(recommendation)
    
    async def trigger_emergency_call(self, recommendation: EmergencyRecommendation):
        """Trigger emergency call via Vapi"""
        
        logger.warning(f"📞 TRIGGERING EMERGENCY CALL for {recommendation.callsign}")
        
        # Send emergency call request through MCP
        call_payload = {
            "callsign": recommendation.callsign,
            "emergency_type": recommendation.emergency_type,
            "urgency_level": recommendation.urgency_level,
            "reason": recommendation.recommendation,
            "timestamp": recommendation.timestamp,
            "metadata": {
                "confidence": recommendation.confidence,
                "context_summary": recommendation.context_summary
            }
        }
        
        await self.mcp_bus.publish(
            MCPTopics.CALL_EMERGENCY,
            call_payload,
            sender="ASI_One_Emergency_System"
        )
    
    async def enhanced_stream_audio(self, liveatc_url: str, chunk_duration: int = 5):
        """Enhanced audio streaming with full AI pipeline"""
        import subprocess
        import pyaudio
        from datetime import datetime
        import json
        
        logger.info(f"🎵 Starting enhanced ATC system from {liveatc_url}")
        logger.info("🧠 AI Emergency Detection: ENABLED")
        logger.info("📡 MCP Orchestration: ENABLED")
        if self.vapi_bridge:
            logger.info("📞 Emergency Calling: ENABLED")
        else:
            logger.info("📞 Emergency Calling: DISABLED (no VAPI_TOKEN)")
        
        # Start FFmpeg process
        ffmpeg_cmd = [
            "ffmpeg",
            "-i", liveatc_url,
            "-ac", "1",           # Mono
            "-ar", "16000",       # 16kHz sample rate
            "-acodec", "pcm_s16le", # 16-bit PCM
            "-f", "wav",          # WAV format
            "-loglevel", "error", # Suppress ffmpeg output
            "pipe:1"              # Output to stdout
        ]
        
        process = subprocess.Popen(
            ffmpeg_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Initialize audio output
        p = pyaudio.PyAudio()
        stream = p.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=16000,
            output=True
        )
        
        logger.info("🔊 Audio streaming to speakers started")
        logger.info(f"📝 Processing {chunk_duration}-second chunks with AI analysis")
        
        audio_buffer = bytearray()
        chunk_size = 16000 * 1 * 2 * chunk_duration  # chunk_duration seconds of 16-bit audio
        chunk_count = 0
        
        try:
            while True:
                # Read audio data
                chunk = process.stdout.read(4096)
                if not chunk:
                    break
                
                # Play to speakers immediately
                stream.write(chunk)
                
                # Add to buffer for transcription
                audio_buffer.extend(chunk)
                
                # Process when we have enough data
                if len(audio_buffer) >= chunk_size:
                    chunk_count += 1
                    
                    # Extract chunk for transcription
                    audio_chunk = bytes(audio_buffer[:chunk_size])
                    audio_buffer = audio_buffer[chunk_size:]
                    
                    logger.info(f"\n🎯 Processing chunk #{chunk_count} ({len(audio_chunk)} bytes)")
                    
                    # Transcribe
                    logger.info("📡 Transcribing with Groq...")
                    transcript = await self.audio_processor.transcribe_audio(audio_chunk)
                    
                    if transcript and transcript.strip() not in [".", "thank you"]:
                        logger.info(f"✅ Raw transcript: '{transcript}'")
                        
                        # Enhanced processing with AI analysis
                        logger.info("🧠 Enhanced AI analysis...")
                        enhanced_result = await self.process_transcript_with_enhanced_analysis(
                            transcript, chunk_count
                        )
                        
                        # Broadcast enhanced result to WebSocket clients
                        message = {
                            "type": "enhanced_atc_analysis",
                            "chunk": chunk_count,
                            "timestamp": datetime.now().isoformat(),
                            "raw_transcript": transcript,
                            **enhanced_result,
                            "system_stats": self.context_collector.get_stats()
                        }
                        
                        await self.audio_processor.broadcast_to_websockets(message)
                        logger.info(f"📡 Broadcasted to {len(self.audio_processor.websocket_clients)} clients")
                    else:
                        logger.info("❌ No meaningful transcription")
                        
        except KeyboardInterrupt:
            logger.info("\n🛑 Stopping enhanced ATC system...")
        except Exception as e:
            logger.error(f"Error in enhanced ATC system: {e}")
        finally:
            # Cleanup
            if stream:
                stream.stop_stream()
                stream.close()
            if p:
                p.terminate()
            if process:
                process.terminate()
            
            logger.info("🏁 Enhanced ATC system stopped")
    
    async def run(self):
        """Run the complete enhanced ATC system"""
        logger.info("🚀 Starting Enhanced ATC System with AI Emergency Detection...")
        logger.info(f"   - Audio Source: {LIVEATC_URL}")
        logger.info(f"   - WebSocket Port: {WEBSOCKET_PORT}")
        logger.info("   - Real-time audio streaming")
        logger.info("   - Groq Whisper transcription")
        logger.info("   - ATC language processing")
        logger.info("   - 🧠 ASI:One emergency detection")
        logger.info("   - 📡 MCP orchestration bus")
        logger.info("   - 📞 Vapi emergency calling")
        logger.info("   - WebSocket broadcasting")
        
        # Start WebSocket server
        websocket_server = await self.audio_processor.start_websocket_server()
        
        try:
            # Start enhanced audio streaming
            await self.enhanced_stream_audio(LIVEATC_URL)
        finally:
            # Close WebSocket server
            websocket_server.close()
            await websocket_server.wait_closed()

async def main():
    """Main entry point"""
    # Check dependencies
    if not GROQ_API_KEY:
        logger.error("❌ GROQ_API_KEY not set!")
        sys.exit(1)
    
    # Create and run enhanced ATC system
    system = EnhancedATCSystem()
    await system.run()

if __name__ == "__main__":
    asyncio.run(main()) 