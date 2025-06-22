"""
Main FastAPI application for ATC Audio Agent - Full Version
"""
import asyncio
import json
import os
import shutil
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from datetime import datetime
import uuid

from .config import get_settings, validate_settings
from .utils.logging import setup_logging, get_logger
from .api.websocket import router as websocket_router, get_connection_manager
from .core.audio import AudioProcessor
from .core.transcription import TranscriptionService
from .agents.atc_agent import ATCAgent
from .agents.vapi_voice_agent import VAPIVoiceAgent

# Global services
audio_processor = None
transcription_service = None
atc_agent = None
vapi_agent = None
background_task = None

# JSON file path for messages
MESSAGES_FILE = "../messages.json"
MAX_MESSAGES = 100

logger = get_logger(__name__)


def clean_messages_file():
    """Clean the messages JSON file on startup"""
    try:
        with open(MESSAGES_FILE, 'w') as f:
            json.dump([], f)
        
        # Also clean frontend public copy
        shutil.copy(MESSAGES_FILE, "../fe/public/messages.json")
        
        logger.info(f"✅ Cleaned messages file: {MESSAGES_FILE}")
    except Exception as e:
        logger.error(f"❌ Error cleaning messages file: {e}")


def load_messages() -> List[Dict[str, Any]]:
    """Load messages from JSON file"""
    try:
        if os.path.exists(MESSAGES_FILE):
            with open(MESSAGES_FILE, 'r') as f:
                return json.load(f)
        return []
    except Exception as e:
        logger.error(f"❌ Error loading messages: {e}")
        return []


def save_messages(messages: List[Dict[str, Any]]):
    """Save messages to JSON file"""
    try:
        with open(MESSAGES_FILE, 'w') as f:
            json.dump(messages, f, indent=2)
        
        # Also copy to frontend public folder for web access
        shutil.copy(MESSAGES_FILE, "../fe/public/messages.json")
    except Exception as e:
        logger.error(f"❌ Error saving messages: {e}")


def is_meaningful_transcript(transcript: str) -> bool:
    """Check if a transcript contains meaningful ATC communication"""
    if not transcript or not transcript.strip():
        return False
    
    # Remove common punctuation and whitespace
    cleaned = transcript.strip().lower().replace('.', '').replace(',', '').replace('!', '').replace('?', '')
    
    # Filter out single characters, dots, and very short meaningless phrases
    if len(cleaned) <= 1:
        return False
    
    # Filter out common meaningless phrases
    meaningless_phrases = {
        'thank you', 'thanks', 'yes', 'no', 'okay', 'ok', 'roger', 'copy', 
        'uh', 'um', 'ah', 'eh', 'and', 'the', 'a', 'an', 'is', 'are', 'was', 'were'
    }
    
    if cleaned in meaningless_phrases:
        return False
    
    # Must have at least 2 words to be meaningful
    words = cleaned.split()
    if len(words) < 2:
        return False
    
    # Check if it contains aviation-related keywords
    aviation_keywords = {
        'runway', 'tower', 'ground', 'taxi', 'takeoff', 'landing', 'cleared', 'contact', 
        'frequency', 'squawk', 'heading', 'altitude', 'descend', 'climb', 'turn', 'left', 'right',
        'bravo', 'alpha', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india',
        'aircraft', 'flight', 'heavy', 'super', 'traffic', 'approach', 'departure'
    }
    
    # If it contains aviation keywords or has callsign pattern, it's meaningful
    has_aviation_keyword = any(keyword in cleaned for keyword in aviation_keywords)
    has_callsign_pattern = any(word for word in words if len(word) >= 2 and (word.isalnum() or any(c.isdigit() for c in word)))
    
    return has_aviation_keyword or has_callsign_pattern or len(words) >= 4


def add_message(transcript: str, atc_data: Dict[str, Any], chunk_number: int):
    """Add a new message to the JSON file"""
    
    # Filter out meaningless transcripts
    if not is_meaningful_transcript(transcript):
        logger.debug(f"🚫 Filtered out meaningless transcript: '{transcript}'")
        return None
    
    # Extract callsigns
    callsigns = atc_data.get('callsigns', [])
    primary_callsign = callsigns[0].get('callsign', 'KSFO Tower') if callsigns else 'KSFO Tower'
    
    message = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat(),
        "callsign": primary_callsign,
        "message": transcript,
        "isUrgent": atc_data.get('emergencies', False) or 'mayday' in transcript.lower() or 'emergency' in transcript.lower(),
        "type": "atc_analysis",
        "rawTranscript": transcript,
        "instructions": [inst.get('type', '') for inst in atc_data.get('instructions', [])],
        "runways": atc_data.get('runways', []),
        "chunk": chunk_number,
        "atc_data": atc_data
    }
    
    # Load existing messages
    messages = load_messages()
    
    # Add to front of list (newest first)
    messages.insert(0, message)
    
    # Keep only last MAX_MESSAGES
    if len(messages) > MAX_MESSAGES:
        messages = messages[:MAX_MESSAGES]
    
    # Save back to file
    save_messages(messages)
    
    logger.info(f"💬 Added meaningful message to JSON file. Total: {len(messages)}")
    return message


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    global audio_processor, transcription_service, atc_agent, vapi_agent, background_task
    
    settings = get_settings()
    
    # Setup logging
    setup_logging(settings.log_level)
    logger.info("🎧 Starting ATC Audio Agent - Full Version...")
    
    # Clean messages file on startup
    clean_messages_file()
    
    # Validate configuration
    is_valid, errors = validate_settings()
    if not is_valid:
        for error in errors:
            logger.error(f"Configuration error: {error}")
        raise RuntimeError("Invalid configuration")
    
    # Initialize services
    logger.info("Initializing services...")
    audio_processor = AudioProcessor(sample_rate=settings.sample_rate)
    transcription_service = TranscriptionService(settings.transcriber_agent_address)
    atc_agent = ATCAgent(settings.groq_api_key)
    
    # Initialize VAPI agent if configured
    if settings.vapi_api_key:
        vapi_agent = VAPIVoiceAgent(
            api_key=settings.vapi_api_key,
            base_url=settings.vapi_base_url
        )
        logger.info("✅ VAPI Voice Agent initialized")
    else:
        logger.warning("⚠️ VAPI not configured - emergency calling disabled")
    
    # Add initial system message (allow system messages through)
    system_message = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat(),
        "callsign": "SYSTEM",
        "message": "🎧 ATC Audio Agent started - listening to KSFO Tower",
        "isUrgent": False,
        "type": "atc_analysis",
        "rawTranscript": "🎧 ATC Audio Agent started - listening to KSFO Tower",
        "instructions": [],
        "runways": [],
        "chunk": 0,
        "atc_data": {
            "callsigns": [{"callsign": "SYSTEM"}],
            "instructions": [],
            "runways": [],
            "emergencies": False
        }
    }
    
    # Save system message directly
    messages = load_messages()
    messages.insert(0, system_message)
    save_messages(messages)
    logger.info(f"💬 Added system message to JSON file. Total: {len(messages)}")
    
    # Start background audio processing
    if settings.liveatc_url:
        logger.info("🎵 Starting live ATC audio processing...")
        background_task = asyncio.create_task(
            start_audio_processing(settings)
        )
    
    logger.info("✅ ATC Audio Agent started successfully!")
    logger.info(f"🛩️  Listening to: {settings.liveatc_url}")
    logger.info(f"🌐 Messages API: http://localhost:{settings.port}/api/v1/messages")
    logger.info(f"📄 Messages JSON: {MESSAGES_FILE}")
    
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
                
                # Add to message store only if meaningful
                message = add_message(transcript, atc_result, chunk_number)
                
                if message:  # Only process if message was actually added
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
                    
                    # Also broadcast to WebSocket clients (if any)
                    websocket_message = {
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
                    
                    await connection_manager.broadcast(websocket_message)
                    logger.info(f"📡 Message stored and broadcasted to {len(connection_manager.active_connections)} WebSocket clients")
                else:
                    logger.debug("🚫 Transcript filtered out as meaningless")
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
            "REST API for messages",
            "WebSocket broadcasting"
        ]
    }


@app.get("/api/v1/messages")
async def get_messages(limit: int = 50, since: str = None):
    """Get recent ATC messages"""
    messages = load_messages()
    
    # Filter by timestamp if 'since' parameter provided
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
            filtered_messages = [
                msg for msg in messages 
                if datetime.fromisoformat(msg['timestamp'].replace('Z', '+00:00')) > since_dt
            ]
        except ValueError:
            filtered_messages = messages
    else:
        filtered_messages = messages
    
    # Apply limit
    limited_messages = filtered_messages[:limit]
    
    return {
        "messages": limited_messages,
        "total": len(messages),
        "returned": len(limited_messages),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/v1/callsigns")
async def get_active_callsigns():
    """Get list of unique callsigns from recent messages"""
    messages = load_messages()
    
    callsigns = set()
    for msg in messages:
        if msg.get('callsign') and msg['callsign'] != 'SYSTEM':
            callsigns.add(msg['callsign'])
    
    return {
        "callsigns": sorted(list(callsigns)),
        "count": len(callsigns),
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/v1/emergency/call")
async def emergency_call(data: dict):
    """Make an emergency VAPI call"""
    if not vapi_agent:
        raise HTTPException(status_code=503, detail="VAPI not configured")
    
    settings = get_settings()
    if not settings.vapi_assistant_id or not settings.emergency_phone_number:
        raise HTTPException(status_code=503, detail="VAPI assistant or phone number not configured")
    
    # Extract call parameters
    emergency_data = data.get("emergency_data", {})
    assistant_id = data.get("assistant_id", settings.vapi_assistant_id)
    phone_number = data.get("phone_number", settings.emergency_phone_number)
    call_name = data.get("call_name")
    
    if not emergency_data:
        raise HTTPException(status_code=400, detail="emergency_data required")
    
    try:
        result = await vapi_agent.make_emergency_call(
            assistant_id=assistant_id,
            phone_number=phone_number,
            emergency_data=emergency_data,
            call_name=call_name,
            phone_number_id=settings.vapi_phone_number_id
        )
        return result
    except Exception as e:
        logger.error(f"Emergency call failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/emergency/airport")
async def airport_emergency_call(data: dict):
    """Make an airport emergency VAPI call"""
    if not vapi_agent:
        raise HTTPException(status_code=503, detail="VAPI not configured")
    
    settings = get_settings()
    if not settings.vapi_assistant_id or not settings.emergency_phone_number:
        raise HTTPException(status_code=503, detail="VAPI assistant or phone number not configured")
    
    # Required fields
    required_fields = ["airport_code", "emergency_type", "details"]
    for field in required_fields:
        if field not in data:
            raise HTTPException(status_code=400, detail=f"{field} is required")
    
    try:
        result = await vapi_agent.make_airport_emergency_call(
            assistant_id=data.get("assistant_id", settings.vapi_assistant_id),
            phone_number=data.get("phone_number", settings.emergency_phone_number),
            airport_code=data["airport_code"],
            emergency_type=data["emergency_type"],
            details=data["details"],
            urgency_level=data.get("urgency_level", "high"),
            phone_number_id=settings.vapi_phone_number_id
        )
        return result
    except Exception as e:
        logger.error(f"Airport emergency call failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/vapi/assistants")
async def list_vapi_assistants():
    """List available VAPI assistants"""
    if not vapi_agent:
        raise HTTPException(status_code=503, detail="VAPI not configured")
    
    try:
        result = await vapi_agent.list_assistants()
        return result
    except Exception as e:
        logger.error(f"Failed to list assistants: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/vapi/call/{call_id}/status")
async def get_vapi_call_status(call_id: str):
    """Get status of a VAPI call"""
    if not vapi_agent:
        raise HTTPException(status_code=503, detail="VAPI not configured")
    
    try:
        result = await vapi_agent.get_call_status(call_id)
        return result
    except Exception as e:
        logger.error(f"Failed to get call status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        "audio_processing": background_task is not None and not background_task.done(),
        "messages_stored": len(load_messages())
    }


@app.get("/api/v1/stats")
async def get_stats():
    """Get system statistics"""
    if not all([audio_processor, transcription_service, atc_agent]):
        raise HTTPException(status_code=503, detail="Services not initialized")
    
    connection_manager = get_connection_manager()
    
    stats = {
        "audio": audio_processor.get_stats(),
        "transcription": transcription_service.get_stats(),
        "atc": atc_agent.get_stats(),
        "websocket": connection_manager.get_stats(),
        "messages": {
            "stored": len(load_messages()),
            "max_capacity": MAX_MESSAGES
        }
    }
    
    # Add VAPI stats if available
    if vapi_agent:
        stats["vapi"] = vapi_agent.get_stats()
    
    return stats


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
    
    # Add to message store
    message = add_message(transcript, result, 9999)
    
    return {
        "input": transcript,
        "result": result,
        "message": message
    }


@app.get("/api/v1/messages/json")
async def get_messages_json():
    """Get messages directly from JSON file"""
    messages = load_messages()
    return {
        "messages": messages,
        "total": len(messages),
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/v1/emergency/process-data")
async def process_emergency_data_for_vapi(data: dict):
    """
    VAPI function endpoint - Process emergency data for voice communication
    """
    try:
        action = data.get("action", "format_emergency")
        emergency_type = data.get("emergency_type", "unknown")
        detail_type = data.get("detail_type", "all")
        format_style = data.get("format_style", "brief")
        
        # Get emergency data from global context or load recent emergency
        messages = load_messages()
        recent_emergency = None
        
        # Find most recent emergency message
        for msg in messages:
            if msg.get("isUrgent") or msg.get("type") == "emergency":
                recent_emergency = msg
                break
        
        if not recent_emergency and emergency_type != "unknown":
            # Create mock emergency data for function testing
            recent_emergency = {
                "airport_code": "KSFO",
                "emergency_type": emergency_type,
                "location": "Terminal Area",
                "urgency_level": "high",
                "timestamp": datetime.now().isoformat()
            }
        
        result = {}
        
        if action == "format_emergency":
            if recent_emergency:
                airport = recent_emergency.get("airport_code", "Unknown Airport")
                location = recent_emergency.get("location", "Unknown Location")
                urgency = recent_emergency.get("urgency_level", "medium")
                
                if format_style == "urgent":
                    result["formatted_text"] = f"URGENT: {emergency_type} emergency at {airport}, {location}. This is a {urgency} priority situation requiring immediate response."
                elif format_style == "detailed":
                    details = recent_emergency.get("atc_data", {}).get("details", {})
                    result["formatted_text"] = f"Emergency report for {airport}: {emergency_type} at {location}. Urgency level: {urgency}. Additional details: {details}"
                else:  # brief
                    result["formatted_text"] = f"{emergency_type} emergency at {airport}, {location}. Priority: {urgency}."
            else:
                result["formatted_text"] = f"No active emergency data available for {emergency_type} emergency."
        
        elif action == "get_details":
            if recent_emergency and detail_type in recent_emergency:
                result["detail_value"] = recent_emergency[detail_type]
                result["detail_text"] = f"The {detail_type} is: {recent_emergency[detail_type]}"
            else:
                result["detail_text"] = f"No {detail_type} information available."
        
        elif action == "check_status":
            # Check if there are any active emergencies
            emergency_count = sum(1 for msg in messages[:10] if msg.get("isUrgent"))
            result["status"] = "active" if emergency_count > 0 else "clear"
            result["status_text"] = f"Currently {emergency_count} active emergency situations."
        
        elif action == "escalate":
            result["escalation_text"] = f"Escalating {emergency_type} emergency. Notifying additional emergency services."
            result["escalated"] = True
        
        return {
            "success": True,
            "action": action,
            "emergency_type": emergency_type,
            "result": result,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error processing VAPI emergency data: {e}")
        return {
            "success": False,
            "error": str(e),
            "fallback_text": "Emergency data processing unavailable. Please proceed with manual communication.",
            "timestamp": datetime.now().isoformat()
        } 