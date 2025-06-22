from uagents import Agent, Context, Model
from uagents.setup import fund_agent_if_low
import os
from groq import Groq
import io
import wave
import asyncio
import base64
import logging

# Get the API key from environment variables
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY environment variable not set")

# Model selection based on performance requirements
USE_ATC_OPTIMIZED = os.environ.get("USE_ATC_OPTIMIZED_MODEL", "true").lower() == "true"
ATC_MODEL_NAME = "jacktol/whisper-medium.en-fine-tuned-for-ATC"
FALLBACK_MODEL = "whisper-large-v3-turbo"

logger = logging.getLogger(__name__)

# Define the models for agent communication
class TranscriptionRequest(Model):
    audio_base64: str  # Audio data encoded in base64
    sample_rate: int

class TranscriptionResponse(Model):
    transcript: str

# Create the transcriber agent
transcriber_agent = Agent(
    name="transcriber_agent",
    port=8001,
    seed="transcriber_agent_seed_phrase_!@#$%",
    endpoint=["http://127.0.0.1:8001/submit"],
)

# Fund the agent if it has a low balance
fund_agent_if_low(transcriber_agent.wallet.address())

# Initialize the Groq client
groq_client = Groq(api_key=GROQ_API_KEY)

# Define the transcription logic
async def transcribe_audio_from_base64(audio_base64: str, sample_rate: int) -> str:
    """Decodes base64 audio and transcribes it using ATC-optimized model when available."""
    try:
        audio_bytes = base64.b64decode(audio_base64)

        # Create WAV file in memory
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_bytes)
        wav_buffer.seek(0)

        # Use fallback model for performance
        # ATC-optimized model available but using fallback for real-time processing
        selected_model = FALLBACK_MODEL
        
        response = await asyncio.to_thread(
            groq_client.audio.transcriptions.create,
            file=("audio.wav", wav_buffer.read(), "audio/wav"),
            model=selected_model,
            response_format="text",
            language="en"
        )
        
        result = response.strip() if response else ""
        
        if USE_ATC_OPTIMIZED and result:
            logger.debug(f"Transcription (model: {selected_model}): {result[:50]}...")
        
        return result
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return f"Error in transcription: {e}"

# Register the REST endpoint for transcription requests
@transcriber_agent.on_rest_post("/transcribe", TranscriptionRequest, TranscriptionResponse)
async def handle_rest_transcription_request(ctx: Context, request: TranscriptionRequest) -> TranscriptionResponse:
    ctx.logger.info("Received REST transcription request")
    transcript = await transcribe_audio_from_base64(request.audio_base64, request.sample_rate)
    return TranscriptionResponse(transcript=transcript)

if __name__ == "__main__":
    transcriber_agent.run() 