#!/usr/bin/env python3
"""
ATC Audio Agent using uAgents Framework
Handles live ATC audio streaming, transcription, and language processing
"""
import asyncio
import os
import json
from dotenv import load_dotenv
from uagents import Agent, Context
from .audio_processor import AudioProcessor
from ..agents.atc_language_agent import ATCTranscriptProcessor
import logging
from pathlib import Path

# Load environment variables from root .env file
load_dotenv(Path(__file__).parent.parent.parent.parent.parent / '.env')

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration from .env file
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
LIVEATC_URL = os.getenv("LIVEATC_URL", "https://d.liveatc.net/ksfo_twr")
WEBSOCKET_PORT = int(os.getenv("WEBSOCKET_PORT", "8765"))

# Create the ATC Agent
atc_agent = Agent(
    name="atc_audio_agent",
    seed="atc_audio_processing_seed_123",
    port=8001,
    endpoint=["http://localhost:8001/submit"]
)

# Global components
audio_processor = None
atc_language_processor = None

@atc_agent.on_event("startup")
async def startup_handler(ctx: Context):
    """Initialize the ATC audio processing system"""
    global audio_processor, atc_language_processor
    
    logger.info("🚀 Starting ATC Audio Agent...")
    
    # Initialize components
    audio_processor = AudioProcessor(GROQ_API_KEY, WEBSOCKET_PORT)
    atc_language_processor = ATCTranscriptProcessor(GROQ_API_KEY)
    
    logger.info("✅ ATC Audio Agent initialized")
    logger.info(f"   - Audio Source: {LIVEATC_URL}")
    logger.info(f"   - WebSocket Port: {WEBSOCKET_PORT}")
    logger.info(f"   - Agent Address: {ctx.address}")

@atc_agent.on_interval(period=1.0)
async def process_audio(ctx: Context):
    """Main audio processing loop"""
    global audio_processor
    
    if audio_processor is None:
        return
    
    try:
        # Start WebSocket server
        websocket_server = await audio_processor.start_websocket_server()
        
        # Start audio streaming
        await audio_processor.stream_audio(LIVEATC_URL)
        
        # Close WebSocket server
        websocket_server.close()
        await websocket_server.wait_closed()
        
    except Exception as e:
        logger.error(f"Error in audio processing: {e}")

@atc_agent.on_message(model=dict)
async def handle_transcript(ctx: Context, sender: str, msg: dict):
    """Handle transcript messages for ATC language processing"""
    global atc_language_processor
    
    if msg.get("type") == "transcript" and atc_language_processor:
        transcript_text = msg.get("text", "")
        
        if transcript_text:
            logger.info(f"🤖 Processing transcript: {transcript_text}")
            
            # Process with ATC language agent
            transcript_data = {
                "text": transcript_text,
                "frequency": "KSFO_TWR",
                "timestamp": msg.get("timestamp"),
                "chunk": msg.get("chunk"),
                "engine": "groq_whisper"
            }
            
            result = await atc_language_processor.process_audio_transcript(transcript_data)
            
            if "atc_analysis" in result:
                analysis = result["atc_analysis"]
                callsigns = analysis.get("callsigns", [])
                instructions = analysis.get("instructions", [])
                runways = analysis.get("runways", [])
                
                logger.info(f"🛩️  Callsigns: {[cs.get('callsign') for cs in callsigns]}")
                logger.info(f"📋 Instructions: {[inst.get('type') for inst in instructions]}")
                logger.info(f"🛬 Runways: {runways}")
                
                if analysis.get("summary"):
                    logger.info(f"📝 Summary: {analysis['summary']}")

if __name__ == "__main__":
    logger.info("🎧 ATC Audio Agent Starting...")
    logger.info("   - Real-time audio streaming")
    logger.info("   - Groq Whisper transcription")
    logger.info("   - ATC language processing")
    logger.info("   - WebSocket broadcasting")
    
    # Run the agent
    atc_agent.run() 