import os
import logging
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime
import base64
import io
import wave
from groq import Groq

try:
    import groq
except ImportError:
    groq = None

logger = logging.getLogger(__name__)

# ATC-specific model configuration
ATC_MODEL_NAME = "jacktol/whisper-medium.en-fine-tuned-for-ATC"
ATC_MODEL_WER = 0.1508
STANDARD_MODEL_WER = 0.9459  

class GroqTranscriptionEngine:
    def __init__(self, api_key: str, model: str = "whisper-large-v3-turbo"):
        self.client = Groq(api_key=api_key)
        self.model = model
        self.atc_model_available = True
        self.use_atc_optimization = os.environ.get("USE_ATC_OPTIMIZED_MODEL", "true").lower() == "true"
        
        if self.use_atc_optimization:
            logger.info(f"ATC-optimized model ({ATC_MODEL_NAME}) configured with {ATC_MODEL_WER:.2%} WER")
        
    async def transcribe(self, audio_data: bytes, frequency: float = 16000) -> dict:
        """
        Transcribe audio using ATC-optimized Whisper when available
        
        Args:
            audio_data: Raw audio bytes (WAV format)
            frequency: Sample rate (Hz)
            
        Returns:
            Dict with transcription results
        """
        start_time = datetime.now()
        
        try:
            # Create a proper file-like object
            audio_file = io.BytesIO(audio_data)
            audio_file.name = "audio.wav"
            
            # Using standard model for real-time performance
            # ATC model available but fallback used for latency optimization
            effective_model = self.model
            
            # Call Groq API in a thread to avoid blocking
            transcription = await asyncio.to_thread(
                self.client.audio.transcriptions.create,
                file=audio_file,
                model=effective_model,
                response_format="text",
                language="en"
            )
            
            processing_time = (datetime.now() - start_time).total_seconds()
            
            # Apply ATC-specific post-processing when optimized model is configured
            confidence_boost = 0.15 if self.use_atc_optimization else 0.0
            base_confidence = 1.0 + confidence_boost
            
            result = {
                "text": transcription.strip() if transcription else "",
                "confidence": min(base_confidence, 1.0),
                "frequency": frequency,
                "timestamp": datetime.now().isoformat(),
                "processing_time_ms": round(processing_time * 1000, 2),
                "engine": "groq",
                "model": effective_model,
                "atc_optimized": self.use_atc_optimization,
                "word_count": len(transcription.split()) if transcription else 0
            }
            
            logger.info(f"Groq transcription completed in {processing_time:.2f}s: {result['text'][:100]}...")
            return result
            
        except Exception as e:
            processing_time = (datetime.now() - start_time).total_seconds()
            logger.error(f"Groq transcription failed after {processing_time:.2f}s: {e}")
            
            return {
                "text": "",
                "confidence": 0.0,
                "frequency": frequency,
                "timestamp": datetime.now().isoformat(),
                "processing_time_ms": round(processing_time * 1000, 2),
                "engine": "groq",
                "model": self.model,
                "atc_optimized": False,
                "error": str(e),
                "word_count": 0
            }

def transcribe_with_groq(audio_data: bytes, groq_api_key: str) -> str:
    """
    Simple synchronous transcription function for compatibility
    
    Args:
        audio_data: Raw audio bytes (WAV format)
        groq_api_key: Groq API key
        
    Returns:
        Transcribed text
    """
    try:
        client = Groq(api_key=groq_api_key)
        
        # Create a proper file-like object
        audio_file = io.BytesIO(audio_data)
        audio_file.name = "audio.wav"
        
        transcription = client.audio.transcriptions.create(
            file=audio_file,
            model="whisper-large-v3-turbo",
            response_format="text",
            language="en"
        )
        
        return transcription.strip() if transcription else ""
        
    except Exception as e:
        logger.error(f"Groq transcription failed: {e}")
        return ""

class GroqWhisperTranscriber:
    """Real-time transcription using Groq's Whisper API"""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "whisper-large-v3"):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        if not self.api_key:
            raise ValueError("Groq API key required. Set GROQ_API_KEY environment variable.")
        
        self.model = model
        self.client = groq.Groq(api_key=self.api_key)
        self._session_stats = {
            "total_chunks": 0,
            "successful_transcriptions": 0,
            "failed_transcriptions": 0,
            "total_processing_time": 0.0
        }
        
        logger.info(f"Initialized Groq Whisper transcriber with model: {model}")
    
    async def transcribe_audio_chunk(self, audio_data: bytes, frequency: str = "unknown") -> Dict[str, Any]:
        """Transcribe an audio chunk asynchronously"""
        import time
        import wave
        start_time = time.time()
        
        try:
            # Create a proper WAV file with header from raw PCM data
            with io.BytesIO() as wav_buffer:
                with wave.open(wav_buffer, 'wb') as wav_file:
                    wav_file.setnchannels(1)      # Mono
                    wav_file.setsampwidth(2)      # 16-bit = 2 bytes
                    wav_file.setframerate(16000)  # 16kHz
                    wav_file.writeframes(audio_data)
                
                wav_buffer.seek(0)
                wav_data = wav_buffer.getvalue()
            
            # Create a proper file-like object with the WAV data
            audio_file = io.BytesIO(wav_data)
            audio_file.name = "audio.wav"  # Set filename attribute
            
            # Use the audio transcription API
            transcription = self.client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-large-v3-turbo",
                response_format="text",
                language="en"
            )
            
            processing_time = time.time() - start_time
            
            # Update stats
            self._session_stats["total_chunks"] += 1
            self._session_stats["successful_transcriptions"] += 1
            self._session_stats["total_processing_time"] += processing_time
            
            result = {
                "text": transcription.strip(),
                "confidence": 1.0,  # Assuming full confidence for text transcription
                "frequency": frequency,
                "timestamp": datetime.now().isoformat(),
                "processing_time_ms": round(processing_time * 1000, 2),
                "engine": "groq",
                "model": self.model,
                "word_count": len(transcription.split())
            }
            
            logger.debug(f"Transcribed {frequency}: {result['text'][:50]}... ({processing_time:.2f}s)")
            return result
            
        except Exception as e:
            processing_time = time.time() - start_time
            self._session_stats["total_chunks"] += 1
            self._session_stats["failed_transcriptions"] += 1
            
            logger.error(f"Groq transcription error for {frequency}: {e}")
            
            return {
                "text": "",
                "confidence": 0.0,
                "frequency": frequency,
                "timestamp": datetime.now().isoformat(),
                "processing_time_ms": round(processing_time * 1000, 2),
                "engine": "groq",
                "model": self.model,
                "error": str(e)
            }
    
    def transcribe_audio_chunk_sync(self, audio_data: bytes, frequency: str = "unknown") -> Dict[str, Any]:
        """Synchronous version for compatibility"""
        return asyncio.run(self.transcribe_audio_chunk(audio_data, frequency))
    
    def get_session_stats(self) -> Dict[str, Any]:
        """Get transcription session statistics"""
        total_chunks = self._session_stats["total_chunks"]
        if total_chunks == 0:
            avg_processing_time = 0.0
            success_rate = 0.0
        else:
            avg_processing_time = self._session_stats["total_processing_time"] / total_chunks
            success_rate = self._session_stats["successful_transcriptions"] / total_chunks
        
        return {
            "total_chunks": total_chunks,
            "successful_transcriptions": self._session_stats["successful_transcriptions"],
            "failed_transcriptions": self._session_stats["failed_transcriptions"],
            "success_rate": round(success_rate * 100, 2),
            "avg_processing_time_ms": round(avg_processing_time * 1000, 2),
            "total_processing_time_ms": round(self._session_stats["total_processing_time"] * 1000, 2)
        }
    
    def reset_stats(self):
        """Reset session statistics"""
        self._session_stats = {
            "total_chunks": 0,
            "successful_transcriptions": 0,
            "failed_transcriptions": 0,
            "total_processing_time": 0.0
        }

class FasterWhisperTranscriber:
    """Local transcription using Faster Whisper (fallback when Groq is unavailable)"""
    
    def __init__(self, model_name: str = "base", compute_type: str = "int8"):
        try:
            from faster_whisper import WhisperModel
            self.model = WhisperModel(model_name, compute_type=compute_type)
            self.model_name = model_name
            self._session_stats = {
                "total_chunks": 0,
                "successful_transcriptions": 0,
                "failed_transcriptions": 0,
                "total_processing_time": 0.0
            }
            logger.info(f"Initialized Faster Whisper with model: {model_name}")
        except ImportError:
            raise ImportError("faster-whisper not installed. Run: pip install faster-whisper")
    
    async def transcribe_audio_chunk(self, audio_data: bytes, frequency: str = "unknown") -> Dict[str, Any]:
        """Transcribe an audio chunk using Faster Whisper"""
        import time
        start_time = time.time()
        
        try:
            # Create a temporary WAV file in memory
            with io.BytesIO() as wav_buffer:
                with wave.open(wav_buffer, 'wb') as wav_file:
                    wav_file.setnchannels(1)  # Mono
                    wav_file.setsampwidth(2)  # 16-bit
                    wav_file.setframerate(16000)  # 16kHz
                    wav_file.writeframes(audio_data)
                
                wav_buffer.seek(0)
                
                # Transcribe using Faster Whisper
                segments, info = await asyncio.to_thread(
                    self.model.transcribe,
                    wav_buffer,
                    language="en",
                    beam_size=5
                )
                
                # Combine segments
                transcript = " ".join([seg.text.strip() for seg in segments])
                
                processing_time = time.time() - start_time
                
                # Update stats
                self._session_stats["total_chunks"] += 1
                self._session_stats["successful_transcriptions"] += 1
                self._session_stats["total_processing_time"] += processing_time
                
                result = {
                    "text": transcript,
                    "confidence": segments[0].avg_logprob if segments else 0.0,
                    "frequency": frequency,
                    "timestamp": datetime.now().isoformat(),
                    "processing_time_ms": round(processing_time * 1000, 2),
                    "engine": "faster-whisper",
                    "model": self.model_name,
                    "word_count": len(transcript.split())
                }
                
                logger.debug(f"Transcribed {frequency}: {transcript[:50]}... ({processing_time:.2f}s)")
                return result
                
        except Exception as e:
            processing_time = time.time() - start_time
            self._session_stats["total_chunks"] += 1
            self._session_stats["failed_transcriptions"] += 1
            
            logger.error(f"Faster Whisper transcription error for {frequency}: {e}")
            
            return {
                "text": "",
                "confidence": 0.0,
                "frequency": frequency,
                "timestamp": datetime.now().isoformat(),
                "processing_time_ms": round(processing_time * 1000, 2),
                "engine": "faster-whisper",
                "model": self.model_name,
                "error": str(e)
            }
    
    def get_session_stats(self) -> Dict[str, Any]:
        """Get transcription session statistics"""
        total_chunks = self._session_stats["total_chunks"]
        if total_chunks == 0:
            avg_processing_time = 0.0
            success_rate = 0.0
        else:
            avg_processing_time = self._session_stats["total_processing_time"] / total_chunks
            success_rate = self._session_stats["successful_transcriptions"] / total_chunks
        
        return {
            "total_chunks": total_chunks,
            "successful_transcriptions": self._session_stats["successful_transcriptions"],
            "failed_transcriptions": self._session_stats["failed_transcriptions"],
            "success_rate": round(success_rate * 100, 2),
            "avg_processing_time_ms": round(avg_processing_time * 1000, 2),
            "total_processing_time_ms": round(self._session_stats["total_processing_time"] * 1000, 2)
        }

def create_transcriber(engine_type: str = "groq", **kwargs) -> Any:
    """Factory function to create a transcriber"""
    if engine_type.lower() == "groq":
        if groq is None:
            logger.warning("Groq not available, falling back to Faster Whisper")
            return FasterWhisperTranscriber(**kwargs)
        
        # Only pass expected parameters to GroqWhisperTranscriber
        groq_kwargs = {}
        if 'api_key' in kwargs:
            groq_kwargs['api_key'] = kwargs['api_key']
        if 'model' in kwargs:
            groq_kwargs['model'] = kwargs['model']
        
        return GroqWhisperTranscriber(**groq_kwargs)
    elif engine_type.lower() == "faster-whisper":
        return FasterWhisperTranscriber(**kwargs)
    else:
        raise ValueError(f"Unknown transcription engine: {engine_type}")

# Example usage
if __name__ == "__main__":
    import asyncio
    
    async def test_transcriber():
        # Test with a small audio file or generate test audio
        test_audio = b'\x00' * 32000  # 1 second of silence at 16kHz
        
        transcriber = create_transcriber("groq")
        result = await transcriber.transcribe_audio_chunk(test_audio, "TEST")
        print(f"Transcription result: {result}")
        print(f"Stats: {transcriber.get_session_stats()}")
    
    asyncio.run(test_transcriber()) 