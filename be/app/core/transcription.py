"""
Transcription service using Groq Whisper
"""
import asyncio
import io
import wave
from typing import Optional
from groq import Groq

from ..utils.logging import get_logger

logger = get_logger(__name__)


class TranscriptionService:
    """Modern transcription service using Groq Whisper"""
    
    def __init__(self, api_key: str, model: str = "whisper-large-v3-turbo"):
        self.client = Groq(api_key=api_key)
        self.model = model
        self.stats = {
            "total_transcriptions": 0,
            "successful_transcriptions": 0,
            "failed_transcriptions": 0,
        }
        logger.info(f"Initialized transcription service with model: {model}")
    
    async def transcribe_audio(self, audio_data: bytes, sample_rate: int = 16000) -> Optional[str]:
        """
        Transcribe audio data to text
        
        Args:
            audio_data: Raw audio bytes (16-bit PCM)
            sample_rate: Audio sample rate
            
        Returns:
            Transcribed text or None if failed
        """
        try:
            self.stats["total_transcriptions"] += 1
            
            # Create WAV file in memory
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(audio_data)
            
            wav_buffer.seek(0)
            
            # Transcribe with Groq
            response = await asyncio.to_thread(
                self.client.audio.transcriptions.create,
                file=("audio.wav", wav_buffer.read(), "audio/wav"),
                model=self.model,
                response_format="text",
                language="en"
            )
            
            transcript = response.strip() if response else ""
            
            if transcript and transcript.lower() not in ["thank you", "", " "]:
                self.stats["successful_transcriptions"] += 1
                logger.debug(f"Transcribed: '{transcript}'")
                return transcript
            else:
                logger.debug("Empty or meaningless transcription")
                return None
                
        except Exception as e:
            self.stats["failed_transcriptions"] += 1
            logger.error(f"Transcription failed: {e}")
            return None
    
    def get_stats(self) -> dict:
        """Get transcription statistics"""
        return self.stats.copy() 