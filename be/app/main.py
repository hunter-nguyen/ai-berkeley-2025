"""
Main FastAPI application for ATC Audio Agent - Full Version
"""
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings, validate_settings
from .utils.logging import setup_logging, get_logger
from .api.websocket import router as websocket_router, get_connection_manager
from .core.audio import AudioProcessor
from .core.transcription import TranscriptionService
from .agents.atc_agent import ATCAgent

# Global services
audio_processor = None
transcription_service = None
atc_agent = None
background_task = None

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    global audio_processor, transcription_service, atc_agent, background_task
    
    settings = get_settings()
    
    # Setup logging
    setup_logging(settings.log_level)
    logger.info("🎧 Starting ATC Audio Agent - Full Version...")
    
    # Validate configuration
    is_valid, errors = validate_settings()
    if not is_valid:
        for error in errors:
            logger.error(f"Configuration error: {error}")
        raise RuntimeError("Invalid configuration")
    
    # Initialize services
    logger.info("Initializing services...")
    audio_processor = AudioProcessor(sample_rate=settings.sample_rate)
    transcription_service = TranscriptionService(settings.groq_api_key)
    atc_agent = ATCAgent(settings.groq_api_key)
    
    # Start background audio processing
    if settings.liveatc_url:
        logger.info("🎵 Starting live ATC audio processing...")
        background_task = asyncio.create_task(
            start_audio_processing(settings)
        )
    
    logger.info("✅ ATC Audio Agent started successfully!")
    logger.info(f"🛩️  Listening to: {settings.liveatc_url}")
    logger.info(f"🌐 WebSocket: ws://localhost:{settings.port}/api/v1/ws")
    
    yield
    
    # Cleanup
    logger.info("🛑 Shutting down ATC Audio Agent...")
    if background_task:
        background_task.cancel()
        try:
            await background_task
        except asyncio.CancelledError:
            pass
    
    if audio_processor:
        audio_processor.stop()
    
    logger.info("ATC Audio Agent stopped")


async def start_audio_processing(settings):
    """Background task for live audio processing"""
    try:
        connection_manager = get_connection_manager()
        
        async def process_chunk(audio_chunk: bytes, chunk_number: int):
            """Process each audio chunk"""
            logger.info(f"🎯 Processing chunk #{chunk_number}")
            
            # Transcribe audio using Groq Whisper
            transcript = await transcription_service.transcribe_audio(audio_chunk, settings.sample_rate)
            
            if transcript:
                logger.info(f"📝 Transcript: '{transcript}'")
                
                # Process with ATC language agent
                atc_result = await atc_agent.process_transcript(transcript, "LIVE_ATC")
                
                # Log extracted data
                callsigns = atc_result.get('callsigns', [])
                instructions = atc_result.get('instructions', [])
                runways = atc_result.get('runways', [])
                
                if callsigns:
                    logger.info(f"🛩️  Callsigns: {[cs.get('callsign') for cs in callsigns]}")
                if instructions:
                    logger.info(f"📋 Instructions: {[inst.get('type') for inst in instructions]}")
                if runways:
                    logger.info(f"🛬 Runways: {runways}")
                
                # Broadcast to WebSocket clients
                message = {
                    "type": "atc_analysis",
                    "chunk": chunk_number,
                    "transcript": transcript,
                    "atc_data": atc_result,
                    "stats": {
                        "audio": audio_processor.get_stats(),
                        "transcription": transcription_service.get_stats(),
                        "atc": atc_agent.get_stats()
                    }
                }
                
                await connection_manager.broadcast(message)
                logger.info(f"📡 Broadcasted to {len(connection_manager.active_connections)} WebSocket clients")
            else:
                logger.debug("❌ No meaningful transcription")
        
        # Start live audio streaming with processing
        logger.info("🎵 Starting live audio stream...")
        async for audio_chunk in audio_processor.stream_audio(
            url=settings.liveatc_url,
            chunk_duration=settings.chunk_duration,
            play_audio=True,  # Play audio to speakers
            chunk_callback=process_chunk
        ):
            pass
            
    except Exception as e:
        logger.error(f"❌ Audio processing error: {e}")


# Create FastAPI app
app = FastAPI(
    title="ATC Audio Agent",
    description="Real-time Air Traffic Control audio processing with AI-powered transcription",
    version="2.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(websocket_router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "ATC Audio Agent API - Live Audio Processing",
        "version": "2.0.0",
        "status": "running",
        "features": [
            "Live ATC audio streaming",
            "Real-time transcription",
            "Aviation language processing",
            "WebSocket broadcasting"
        ]
    }


@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "services": {
            "audio_processor": audio_processor is not None,
            "transcription_service": transcription_service is not None,
            "atc_agent": atc_agent is not None,
        },
        "audio_processing": background_task is not None and not background_task.done()
    }


@app.get("/api/v1/stats")
async def get_stats():
    """Get system statistics"""
    if not all([audio_processor, transcription_service, atc_agent]):
        raise HTTPException(status_code=503, detail="Services not initialized")
    
    connection_manager = get_connection_manager()
    
    return {
        "audio": audio_processor.get_stats(),
        "transcription": transcription_service.get_stats(),
        "atc": atc_agent.get_stats(),
        "websocket": connection_manager.get_stats(),
    }


@app.post("/api/v1/test/transcript")
async def test_transcript(data: dict):
    """Test endpoint for processing text transcripts"""
    if not all([transcription_service, atc_agent]):
        raise HTTPException(status_code=503, detail="Services not initialized")
    
    transcript = data.get("transcript", "")
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript required")
    
    # Process with ATC agent
    result = await atc_agent.process_transcript(transcript, "TEST")
    
    return {
        "input": transcript,
        "result": result
    } 