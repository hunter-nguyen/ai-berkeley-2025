"""
Main FastAPI application for ATC Audio Agent - Full Version
"""
import asyncio
import json
import os
import shutil
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from datetime import datetime
import uuid

# Add src directory to path for Letta service
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from .config import get_settings, validate_settings
from .utils.logging import setup_logging, get_logger
from .api.websocket import router as websocket_router, get_connection_manager
from .core.audio import AudioProcessor
from .core.transcription import TranscriptionService
from .agents.atc_agent import ATCAgent
from .agents.vapi_voice_agent import VAPIVoiceAgent

try:
    from letta_service import init_letta_agent, get_letta_agent
except ImportError:
    print("Warning: Letta service not available. Shift handover features will be disabled.")
    init_letta_agent = None
    get_letta_agent = None

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
    
    # Auto-update Letta with new message if available
    try:
        if get_letta_agent:
            agent = get_letta_agent()
            if agent:
                # Create a real-time update for Letta
                update_message = f"""
📡 **LIVE ATC UPDATE** - {datetime.now().strftime('%H:%M:%S')}

**Callsign**: {primary_callsign}
**Message**: {transcript}
**Urgency**: {'🚨 URGENT' if message['isUrgent'] else '✅ Normal'}
**Instructions**: {', '.join(message['instructions']) if message['instructions'] else 'None'}
**Runways**: {', '.join(message['runways']) if message['runways'] else 'None'}

This is a live update from the ATC communications system. Please incorporate this information into your ongoing shift awareness.
"""
                
                from letta_service import MessageCreate, TextContent
                agent.client.agents.messages.create(
                    agent_id=agent.agent_id,
                    messages=[MessageCreate(
                        role="user",
                        content=[TextContent(
                            type="text",
                            text=update_message
                        )]
                    )]
                )
                logger.info(f"🤖 Auto-updated Letta with new message: {primary_callsign}")
    except Exception as e:
        logger.debug(f"⚠️ Could not auto-update Letta: {e}")
    
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
    
    # Initialize Letta agent if API key is configured
    if hasattr(settings, 'letta_api_key') and settings.letta_api_key and init_letta_agent:
        try:
            init_letta_agent(settings.letta_api_key)
            logger.info("✅ Letta Shift Agent initialized")
        except Exception as e:
            logger.error(f"❌ Failed to initialize Letta agent: {e}")
    else:
        if not init_letta_agent:
            logger.warning("⚠️ Letta service not available - shift summaries disabled")
        else:
            logger.warning("⚠️ Letta not configured - shift summaries disabled")
    
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
        
        # Auto-load existing data into Letta on startup if available
        try:
            if get_letta_agent:
                agent = get_letta_agent()
                if agent:
                    logger.info("🤖 Auto-loading existing ATC data into Letta...")
                    comprehensive_data = agent.load_comprehensive_data(MESSAGES_FILE)
                    agent.update_comprehensive_memory(comprehensive_data)
                    logger.info(f"✅ Loaded {comprehensive_data.get('total_messages', 0)} existing messages into Letta")
        except Exception as e:
            logger.debug(f"⚠️ Could not auto-load data into Letta: {e}")
        
        # Counter for periodic comprehensive updates
        chunk_counter = 0
        
        async def process_chunk(audio_chunk: bytes, chunk_number: int):
            """Process each audio chunk"""
            nonlocal chunk_counter
            chunk_counter += 1
            
            logger.info(f"🎯 Processing chunk #{chunk_number}")
            
            # Transcribe audio using Groq Whisper
            transcript = await transcription_service.transcribe_audio(audio_chunk, settings.sample_rate)
            
            if transcript:
                logger.info(f"📝 Transcript: '{transcript}'")
                
                # Process with ATC language agent
                atc_result = await atc_agent.process_transcript(transcript, "LIVE_ATC")
                
                # Add to message store only if meaningful (this will auto-update Letta)
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
            
            # Periodic comprehensive update to Letta every 50 chunks (~4-5 minutes)
            if chunk_counter % 50 == 0:
                try:
                    if get_letta_agent:
                        agent = get_letta_agent()
                        if agent:
                            logger.info("🔄 Performing periodic comprehensive Letta update...")
                            comprehensive_data = agent.load_comprehensive_data(MESSAGES_FILE)
                            
                            # Send a summary update instead of full reload
                            summary_update = f"""
🔄 **PERIODIC SHIFT UPDATE** - {datetime.now().strftime('%H:%M:%S')}

📊 **Current Status:**
- Total messages processed: {comprehensive_data.get('total_messages', 0)}
- Active callsigns: {len(comprehensive_data.get('callsigns', []))}
- Urgent messages: {len(comprehensive_data.get('urgent_messages', []))}
- Active runways: {', '.join(comprehensive_data.get('runway_activity', [])) or 'None'}

📡 **Recent Activity:** {len([msg for msg in comprehensive_data.get('full_messages', [])[:10]])} messages in last batch

This is an automated shift status update to keep you current with ongoing operations.
"""
                            
                            from letta_service import MessageCreate, TextContent
                            agent.client.agents.messages.create(
                                agent_id=agent.agent_id,
                                messages=[MessageCreate(
                                    role="user",
                                    content=[TextContent(
                                        type="text",
                                        text=summary_update
                                    )]
                                )]
                            )
                            logger.info("✅ Completed periodic Letta update")
                except Exception as e:
                    logger.debug(f"⚠️ Periodic Letta update failed: {e}")
        
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
    """Process emergency data and return formatted structure for VAPI calls"""
    # Extract emergency information from the input data
    aircraft_id = data.get("aircraft_id", "Unknown")
    emergency_type = data.get("emergency_type", "Unknown Emergency")
    location = data.get("location", "Unknown Location")
    details = data.get("details", "No additional details")
    
    # Format emergency message
    emergency_message = f"""
    EMERGENCY ALERT: {emergency_type}
    Aircraft: {aircraft_id}
    Location: {location}
    Details: {details}
    Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}
    
    This is an automated emergency notification from the ATC Audio Agent system.
    Please respond immediately and coordinate with airport emergency services.
    """.strip()
    
    # Return formatted data for VAPI
    return {
        "emergency_data": {
            "aircraft_id": aircraft_id,
            "emergency_type": emergency_type,
            "location": location,
            "details": details,
            "emergency_message": emergency_message,
            "timestamp": datetime.now().isoformat(),
            "priority": "high"
        },
        "call_data": {
            "message": emergency_message,
            "urgency": "immediate",
            "requires_response": True
        }
    }


# === LETTA SHIFT HANDOVER ENDPOINTS ===

@app.post("/api/v1/letta/init")
async def initialize_letta_agent(data: dict):
    """Initialize Letta agent with API key"""
    if not init_letta_agent:
        raise HTTPException(status_code=503, detail="Letta service not available")
    
    api_key = data.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")
    
    try:
        init_letta_agent(api_key)
        return {"status": "success", "message": "Letta agent initialized"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize Letta agent: {str(e)}")


@app.post("/api/v1/letta/load-events")
async def load_todays_events():
    """Load today's events from messages.json into Letta memory"""
    if not get_letta_agent:
        raise HTTPException(status_code=503, detail="Letta service not available")
    
    agent = get_letta_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Letta agent not initialized")
    
    try:
        events = agent.load_todays_messages(MESSAGES_FILE)
        agent.update_agent_memory(events)
        
        return {
            "status": "success", 
            "events_loaded": len(events),
            "events": [
                {
                    "timestamp": event.timestamp,
                    "callsign": event.callsign,
                    "summary": event.summary,
                    "urgency": event.urgency
                } for event in events[:10]  # Return first 10 for preview
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load events: {str(e)}")


@app.post("/api/v1/letta/add-note")
async def add_manual_note(data: dict):
    """Add manual note to Letta agent memory"""
    if not get_letta_agent:
        raise HTTPException(status_code=503, detail="Letta service not available")
    
    agent = get_letta_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Letta agent not initialized")
    
    note = data.get("note")
    category = data.get("category", "general")
    
    if not note:
        raise HTTPException(status_code=400, detail="note is required")
    
    try:
        agent.add_manual_note(note, category)
        return {"status": "success", "message": "Note added to agent memory"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add note: {str(e)}")


@app.get("/api/v1/letta/shift-summary")
async def get_shift_summary(shift_type: str = "handover"):
    """Generate comprehensive shift summary"""
    if not get_letta_agent:
        raise HTTPException(status_code=503, detail="Letta service not available")
    
    agent = get_letta_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Letta agent not initialized")
    
    try:
        summary = agent.generate_shift_summary(shift_type)
        patterns = agent.get_shift_patterns()
        
        return {
            "summary": summary,
            "patterns": patterns,
            "generated_at": datetime.now().isoformat(),
            "shift_type": shift_type
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")


@app.get("/api/v1/letta/patterns")
async def get_shift_patterns():
    """Get shift patterns analysis"""
    if not get_letta_agent:
        raise HTTPException(status_code=503, detail="Letta service not available")
    
    agent = get_letta_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Letta agent not initialized")
    
    try:
        patterns = agent.get_shift_patterns()
        return patterns
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get patterns: {str(e)}")


@app.get("/api/v1/letta/status")
async def get_letta_status():
    """Get Letta agent status"""
    if not get_letta_agent:
        return {"status": "not_available", "agent_available": False, "message": "Letta service not installed"}
    
    agent = get_letta_agent()
    if not agent:
        return {"status": "not_initialized", "agent_available": False}
    
    try:
        return {
            "status": "active",
            "agent_available": True,
            "agent_id": agent.agent_id,
            "initialized": True
        }
    except Exception as e:
        return {"status": "error", "agent_available": False, "error": str(e)}


@app.post("/api/v1/letta/load-comprehensive")
async def load_comprehensive_data():
    """Load comprehensive shift data including full messages and context"""
    if not get_letta_agent:
        raise HTTPException(status_code=503, detail="Letta service not available")
    
    agent = get_letta_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Letta agent not initialized")
    
    try:
        comprehensive_data = agent.load_comprehensive_data(MESSAGES_FILE)
        agent.update_comprehensive_memory(comprehensive_data)
        
        return {
            "status": "success",
            "data": {
                "shift_date": comprehensive_data.get("shift_date"),
                "total_messages": comprehensive_data.get("total_messages", 0),
                "active_callsigns": comprehensive_data.get("callsigns", []),
                "urgent_count": len(comprehensive_data.get("urgent_messages", [])),
                "runway_activity": comprehensive_data.get("runway_activity", []),
                "instruction_types": comprehensive_data.get("instruction_types", []),
                "recent_messages": comprehensive_data.get("full_messages", [])[:5]  # Last 5 for preview
            },
            "message": "Comprehensive data loaded into agent memory"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load comprehensive data: {str(e)}")


@app.get("/api/v1/letta/markdown-summary")
async def get_markdown_summary(shift_type: str = "handover", include_weather: bool = True):
    """Generate comprehensive markdown-style shift summary"""
    if not get_letta_agent:
        raise HTTPException(status_code=503, detail="Letta service not available")
    
    agent = get_letta_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Letta agent not initialized")
    
    try:
        markdown_summary = agent.generate_markdown_summary(shift_type, include_weather)
        patterns = agent.get_shift_patterns()
        
        return {
            "summary": markdown_summary,
            "patterns": patterns,
            "generated_at": datetime.now().isoformat(),
            "shift_type": shift_type,
            "format": "markdown"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate markdown summary: {str(e)}")


@app.get("/api/v1/letta/comprehensive-status")
async def get_comprehensive_status():
    """Get comprehensive status of shift data and agent"""
    if not get_letta_agent:
        return {"status": "not_available", "agent_available": False, "message": "Letta service not installed"}
    
    agent = get_letta_agent()
    if not agent:
        return {"status": "not_initialized", "agent_available": False}
    
    try:
        # Get current data overview
        comprehensive_data = agent.load_comprehensive_data(MESSAGES_FILE)
        
        return {
            "status": "active",
            "agent_available": True,
            "agent_id": agent.agent_id,
            "shift_overview": {
                "date": comprehensive_data.get("shift_date"),
                "total_messages": comprehensive_data.get("total_messages", 0),
                "active_callsigns": len(comprehensive_data.get("callsigns", [])),
                "urgent_messages": len(comprehensive_data.get("urgent_messages", [])),
                "runway_activity": comprehensive_data.get("runway_activity", []),
                "last_update": comprehensive_data.get("analysis_timestamp")
            },
            "capabilities": [
                "Comprehensive data loading",
                "Markdown summary generation", 
                "Pattern analysis",
                "Weather integration",
                "Manual note management"
            ]
        }
    except Exception as e:
        return {"status": "error", "agent_available": False, "error": str(e)}


@app.post("/api/v1/letta/chat")
async def chat_with_letta(data: dict):
    """Chat with Letta agent - starts with recent events summary if first message"""
    if not get_letta_agent:
        raise HTTPException(status_code=503, detail="Letta service not available")
    
    agent = get_letta_agent()
    if not agent:
        raise HTTPException(status_code=503, detail="Letta agent not initialized")
    
    try:
        message = data.get('message', '').strip()
        is_first_message = data.get('is_first_message', False)
        
        # If first message, provide recent events summary
        if is_first_message or message.lower() in ['start', 'begin', 'summary', 'recent events']:
            # Load recent messages for context
            messages = load_messages()
            recent_messages = messages[:20]  # Last 20 messages
            
            # Count urgent messages and active callsigns
            urgent_count = sum(1 for msg in recent_messages if msg.get('isUrgent', False))
            active_callsigns = list(set(msg.get('callsign', '') for msg in recent_messages if msg.get('callsign') and msg.get('callsign') != 'SYSTEM'))
            
            # Get unique runway activity
            runway_activity = list(set())
            for msg in recent_messages:
                runway_activity.extend(msg.get('runways', []))
            runway_activity = list(set(runway_activity))
            
            summary_prompt = f"""
👋 Hello! I'm your left agent for shift assistance. Let me start by giving you a summary of recent events:

📊 **RECENT SHIFT ACTIVITY** (Last 20 messages)
- **Total Messages**: {len(recent_messages)}
- **Urgent Messages**: {urgent_count}
- **Active Aircraft**: {len(active_callsigns)} ({', '.join(active_callsigns[:5])}{'...' if len(active_callsigns) > 5 else ''})
- **Runway Activity**: {', '.join(runway_activity) if runway_activity else 'None detected'}

🔍 **NOTABLE EVENTS**:
"""
            
            # Add recent urgent messages or notable events
            notable_events = []
            for msg in recent_messages[:10]:
                if msg.get('isUrgent', False):
                    notable_events.append(f"⚠️ {msg.get('callsign', 'Unknown')}: {msg.get('message', '')[:50]}...")
                elif any(keyword in msg.get('message', '').lower() for keyword in ['emergency', 'mayday', 'priority', 'medical']):
                    notable_events.append(f"🚨 {msg.get('callsign', 'Unknown')}: {msg.get('message', '')[:50]}...")
            
            if notable_events:
                summary_prompt += "\n".join(notable_events[:3])
            else:
                summary_prompt += "✅ No urgent events detected - routine operations"
            
            summary_prompt += "\n\n💬 **Ready to assist! Ask me about:**\n- Shift patterns and trends\n- Specific aircraft or incidents\n- Weather impacts\n- Handover preparation\n- Any other questions about current operations"
            
            # Send this as the initial message if user just wants to start
            if not message or message.lower() in ['start', 'begin']:
                message = summary_prompt
            else:
                # Prepend summary to user's actual message
                message = f"{summary_prompt}\n\n**User Question**: {message}"
        
        # Send message to Letta agent
        from letta_service import MessageCreate, TextContent
        response = agent.client.agents.messages.create(
            agent_id=agent.agent_id,
            messages=[MessageCreate(
                role="user",
                content=[TextContent(
                    type="text",
                    text=message
                )]
            )]
        )
        
        # Extract response content
        response_text = ""
        if response and hasattr(response, 'messages') and response.messages:
            for msg in response.messages:
                if hasattr(msg, 'content') and msg.content:
                    for content in msg.content:
                        if hasattr(content, 'text'):
                            response_text += content.text + "\n"
        
        if not response_text:
            response_text = "I'm here to help with your shift. What would you like to know?"
        
        return {
            "status": "success",
            "response": response_text.strip(),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}") 