#!/usr/bin/env python3
"""
Audio Processor for ATC Communications
Handles audio streaming, transcription, and WebSocket broadcasting
"""
import asyncio
import subprocess
import logging
import pyaudio
import io
import wave
import websockets
import json
from datetime import datetime
from groq import Groq

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioProcessor:
    def __init__(self, groq_api_key: str, websocket_port: int = 8765):
        self.groq_api_key = groq_api_key
        self.websocket_port = websocket_port
        self.websocket_clients = set()
        self.groq_client = Groq(api_key=groq_api_key)
        
    def create_wav_header(self, audio_data: bytes, sample_rate: int = 16000) -> bytes:
        """Create a proper WAV file with header from raw PCM data"""
        with io.BytesIO() as wav_buffer:
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)      # Mono
                wav_file.setsampwidth(2)      # 16-bit = 2 bytes
                wav_file.setframerate(sample_rate)  # 16kHz
                wav_file.writeframes(audio_data)
            
            wav_buffer.seek(0)
            return wav_buffer.getvalue()

    async def transcribe_audio(self, audio_data: bytes) -> str:
        """Transcribe audio using Groq Whisper"""
        try:
            # Create proper WAV file
            wav_data = self.create_wav_header(audio_data)
            
            # Create file-like object
            audio_file = io.BytesIO(wav_data)
            audio_file.name = "audio.wav"
            
            # Transcribe
            transcription = self.groq_client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-large-v3-turbo",
                response_format="text",
                language="en"
            )
            
            return transcription.strip()
            
        except Exception as e:
            logger.error(f"Groq transcription error: {e}")
            return ""

    async def broadcast_to_websockets(self, message: dict):
        """Broadcast message to all connected WebSocket clients"""
        if not self.websocket_clients:
            return
            
        message_json = json.dumps(message, indent=2)
        disconnected = set()
        
        for client in self.websocket_clients:
            try:
                await client.send(message_json)
            except websockets.exceptions.ConnectionClosed:
                disconnected.add(client)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                disconnected.add(client)
        
        # Remove disconnected clients
        self.websocket_clients -= disconnected

    async def websocket_handler(self, websocket, path):
        """Handle WebSocket connections"""
        self.websocket_clients.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.websocket_clients)}")
        
        try:
            await websocket.wait_closed()
        finally:
            self.websocket_clients.discard(websocket)
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.websocket_clients)}")

    async def start_websocket_server(self):
        """Start WebSocket server"""
        logger.info(f"🌐 Starting WebSocket server on port {self.websocket_port}")
        return await websockets.serve(
            self.websocket_handler,
            "localhost",
            self.websocket_port
        )

    async def stream_audio(self, liveatc_url: str, chunk_duration: int = 5):
        """Stream audio from LiveATC and process in chunks"""
        logger.info(f"🎵 Starting audio stream from {liveatc_url}")
        
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
        logger.info(f"📝 Transcribing {chunk_duration}-second chunks")
        
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
                    transcript = await self.transcribe_audio(audio_chunk)
                    
                    if transcript and transcript.lower() != "thank you":
                        logger.info(f"✅ Transcript: '{transcript}'")
                        
                        # Broadcast to WebSocket clients
                        message = {
                            "type": "transcript",
                            "chunk": chunk_count,
                            "timestamp": datetime.now().isoformat(),
                            "text": transcript,
                            "source": liveatc_url
                        }
                        
                        await self.broadcast_to_websockets(message)
                        logger.info(f"📡 Broadcasted to {len(self.websocket_clients)} clients")
                    else:
                        logger.info("❌ No meaningful transcription")
                        
        except KeyboardInterrupt:
            logger.info("\n🛑 Stopping audio processor...")
        except Exception as e:
            logger.error(f"Error in audio processor: {e}")
        finally:
            # Cleanup
            if stream:
                stream.stop_stream()
                stream.close()
            if p:
                p.terminate()
            if process:
                process.terminate()
            
            logger.info("🏁 Audio processor stopped") 