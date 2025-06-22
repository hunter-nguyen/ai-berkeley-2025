"""
Audio processing service for ATC streams
"""
import asyncio
import subprocess
import pyaudio
from typing import AsyncGenerator, Optional, Callable, Any
from datetime import datetime

from ..utils.logging import get_logger

logger = get_logger(__name__)


class AudioProcessor:
    """Modern audio processing service"""
    
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.is_running = False
        self.stats = {
            "chunks_processed": 0,
            "bytes_processed": 0,
            "start_time": None,
        }
        
    async def stream_audio(
        self, 
        url: str, 
        chunk_duration: int = 5,
        play_audio: bool = True,
        chunk_callback: Optional[Callable[[bytes, int], Any]] = None
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream audio from URL and yield chunks
        
        Args:
            url: Audio stream URL
            chunk_duration: Duration of each chunk in seconds
            play_audio: Whether to play audio to speakers
            chunk_callback: Optional callback for each chunk
            
        Yields:
            Audio chunks as bytes
        """
        logger.info(f"Starting audio stream from {url}")
        self.is_running = True
        self.stats["start_time"] = datetime.now()
        
        # FFmpeg command for audio processing
        ffmpeg_cmd = [
            "ffmpeg",
            "-i", url,
            "-ac", "1",           # Mono
            "-ar", str(self.sample_rate),  # Sample rate
            "-acodec", "pcm_s16le", # 16-bit PCM
            "-f", "wav",          # WAV format
            "-loglevel", "error", # Suppress ffmpeg output
            "pipe:1"              # Output to stdout
        ]
        
        process = None
        audio_stream = None
        p = None
        
        try:
            # Start FFmpeg process
            process = subprocess.Popen(
                ffmpeg_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Initialize audio output if needed
            if play_audio:
                p = pyaudio.PyAudio()
                audio_stream = p.open(
                    format=pyaudio.paInt16,
                    channels=1,
                    rate=self.sample_rate,
                    output=True
                )
                logger.info("Audio playback initialized")
            
            # Calculate chunk size
            chunk_size = self.sample_rate * 1 * 2 * chunk_duration  # duration seconds of 16-bit audio
            audio_buffer = bytearray()
            
            while self.is_running and process.poll() is None:
                # Read audio data
                chunk = process.stdout.read(4096)
                if not chunk:
                    break
                
                # Play to speakers if enabled
                if play_audio and audio_stream:
                    audio_stream.write(chunk)
                
                # Add to buffer
                audio_buffer.extend(chunk)
                self.stats["bytes_processed"] += len(chunk)
                
                # Process when we have enough data
                if len(audio_buffer) >= chunk_size:
                    # Extract chunk
                    audio_chunk = bytes(audio_buffer[:chunk_size])
                    audio_buffer = audio_buffer[chunk_size:]
                    
                    self.stats["chunks_processed"] += 1
                    
                    # Call callback if provided
                    if chunk_callback:
                        try:
                            await chunk_callback(audio_chunk, self.stats["chunks_processed"])
                        except Exception as e:
                            logger.error(f"Chunk callback error: {e}")
                    
                    # Yield chunk
                    yield audio_chunk
                    
        except Exception as e:
            logger.error(f"Audio processing error: {e}")
        finally:
            # Cleanup
            self.is_running = False
            
            if audio_stream:
                audio_stream.stop_stream()
                audio_stream.close()
            if p:
                p.terminate()
            if process:
                process.terminate()
            
            logger.info("Audio processing stopped")
    
    def stop(self):
        """Stop audio processing"""
        self.is_running = False
        logger.info("Audio stop requested")
    
    def get_stats(self) -> dict:
        """Get processing statistics"""
        stats = self.stats.copy()
        if stats["start_time"]:
            runtime = datetime.now() - stats["start_time"]
            stats["runtime_seconds"] = runtime.total_seconds()
        return stats 