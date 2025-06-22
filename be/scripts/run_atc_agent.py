#!/usr/bin/env python3
"""
Simple ATC Audio Agent Runner
Easy-to-use script to start the ATC audio processing system
"""
import os
import sys
import asyncio
import logging
from dotenv import load_dotenv
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.atc_audio_agent.core.audio_processor import AudioProcessor
from src.atc_audio_agent.agents.atc_language_agent import ATCTranscriptProcessor

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration from .env file
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
LIVEATC_URL = os.getenv("LIVEATC_URL", "https://d.liveatc.net/ksfo_twr")
WEBSOCKET_PORT = int(os.getenv("WEBSOCKET_PORT", "8765"))

class ATCAudioSystem:
    def __init__(self):
        self.audio_processor = AudioProcessor(GROQ_API_KEY, WEBSOCKET_PORT)
        self.atc_language_processor = ATCTranscriptProcessor(GROQ_API_KEY)
        
    async def process_transcript_with_atc(self, transcript: str, chunk_count: int):
        """Process transcript through ATC Language Agent"""
        transcript_data = {
            "text": transcript,
            "frequency": "KSFO_TWR",
            "timestamp": None,
            "chunk": chunk_count,
            "engine": "groq_whisper"
        }
        
        result = await self.atc_language_processor.process_audio_transcript(transcript_data)
        
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
        
        return result
        
    async def enhanced_stream_audio(self, liveatc_url: str, chunk_duration: int = 5):
        """Enhanced audio streaming with ATC language processing"""
        import subprocess
        import pyaudio
        from datetime import datetime
        import json
        
        logger.info(f"🎵 Starting enhanced ATC audio stream from {liveatc_url}")
        
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
        logger.info(f"📝 Transcribing and analyzing {chunk_duration}-second chunks")
        
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
                    
                    if transcript and transcript.lower() != "thank you":
                        logger.info(f"✅ Raw transcript: '{transcript}'")
                        
                        # Process with ATC Language Agent
                        logger.info("🤖 Analyzing with ATC Language Agent...")
                        atc_result = await self.process_transcript_with_atc(transcript, chunk_count)
                        
                        # Broadcast complete result to WebSocket clients
                        message = {
                            "type": "atc_analysis",
                            "chunk": chunk_count,
                            "timestamp": datetime.now().isoformat(),
                            "raw_transcript": transcript,
                            **atc_result
                        }
                        
                        await self.audio_processor.broadcast_to_websockets(message)
                        logger.info(f"📡 Broadcasted to {len(self.audio_processor.websocket_clients)} clients")
                    else:
                        logger.info("❌ No meaningful transcription")
                        
        except KeyboardInterrupt:
            logger.info("\n🛑 Stopping ATC system...")
        except Exception as e:
            logger.error(f"Error in ATC system: {e}")
        finally:
            # Cleanup
            if stream:
                stream.stop_stream()
                stream.close()
            if p:
                p.terminate()
            if process:
                process.terminate()
            
            logger.info("🏁 ATC system stopped")

    async def run(self):
        """Run the complete ATC audio system"""
        logger.info("🚀 Starting ATC Audio System...")
        logger.info(f"   - Audio Source: {LIVEATC_URL}")
        logger.info(f"   - WebSocket Port: {WEBSOCKET_PORT}")
        logger.info("   - Real-time audio streaming")
        logger.info("   - Groq Whisper transcription")
        logger.info("   - ATC language processing")
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
    
    # Create and run ATC system
    atc_system = ATCAudioSystem()
    await atc_system.run()

if __name__ == "__main__":
    logger.info("🎧 ATC Audio System Starting...")
    asyncio.run(main()) 