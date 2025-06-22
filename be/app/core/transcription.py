"""
Transcription service using Groq Whisper with ATC optimization
"""
import asyncio
import base64
import httpx
from typing import Optional

from ..utils.logging import get_logger
from .atc_models import ATCModelSelector, get_atc_model_info

logger = get_logger(__name__)


class TranscriptionService:
    """Modern transcription service with ATC-optimized model selection"""

    def __init__(self, agent_address: str, model: str = "whisper-large-v3-turbo"):
        self.agent_address = agent_address
        self.model = model
        self.atc_selector = ATCModelSelector(max_latency_ms=1000)
        self.stats = {
            "total_transcriptions": 0,
            "successful_transcriptions": 0,
            "failed_transcriptions": 0,
        }
        
        # Log ATC model capabilities
        atc_info = get_atc_model_info()
        logger.info(f"Initialized transcription service with ATC optimization")
        logger.info(f"ATC model available: {atc_info['model_name']} (WER: {atc_info['performance']['wer_fine_tuned']})")
        logger.info(f"Agent endpoint: {agent_address}")

    async def transcribe_audio(self, audio_data: bytes, sample_rate: int = 16000, context: str = "general") -> Optional[str]:
        """
        Transcribe audio data to text using ATC-optimized model selection
        
        Args:
            audio_data: Raw audio bytes (16-bit PCM)
            sample_rate: Audio sample rate
            context: Context hint for model selection
            
        Returns:
            Transcribed text or None if failed
        """
        try:
            self.stats["total_transcriptions"] += 1

            # Select optimal model based on context
            model_config, selection_reason = self.atc_selector.select_model(context)
            
            # Encode audio data to base64
            audio_base64 = base64.b64encode(audio_data).decode('utf-8')

            request_data = {
                "audio_base64": audio_base64,
                "sample_rate": sample_rate
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.agent_address,
                    json=request_data,
                    timeout=30.0
                )
                response.raise_for_status()

            response_data = response.json()
            transcript = response_data.get("transcript")

            if transcript and transcript.lower() not in ["thank you", "", " "]:
                self.stats["successful_transcriptions"] += 1
                logger.debug(f"Transcribed ({selection_reason}): '{transcript}'")
                return transcript
            else:
                logger.debug("Empty or meaningless transcription")
                return None

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error during transcription request: {e.response.status_code} - {e.response.text}")
            self.stats["failed_transcriptions"] += 1
            return None
        except Exception as e:
            self.stats["failed_transcriptions"] += 1
            logger.error(f"Transcription failed: {e}")
            return None

    def get_stats(self) -> dict:
        """Get transcription statistics including ATC model usage"""
        base_stats = self.stats.copy()
        atc_stats = self.atc_selector.get_stats()
        
        return {
            **base_stats,
            "model_selection": atc_stats
        } 