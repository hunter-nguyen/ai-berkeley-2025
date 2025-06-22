import asyncio
import logging
import json
from typing import Dict, List, Optional, Callable
from datetime import datetime
from dataclasses import dataclass, asdict
import queue
import threading

from audio_data.audio import AudioPipeline, create_transcription_engine, Transcript

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ATCMessage:
    """Represents a processed ATC communication message"""
    id: str
    timestamp: datetime
    frequency: str
    raw_text: str
    cleaned_text: str
    message_type: str  # "clearance", "instruction", "readback", "weather", etc.
    confidence: float
    source_engine: str
    metadata: Dict

class AudioAgent:
    """Main agent for processing ATC audio transcripts"""
    
    def __init__(self, 
                 config: Dict,
                 strip_agent_callback: Optional[Callable] = None,
                 log_agent_callback: Optional[Callable] = None,
                 task_agent_callback: Optional[Callable] = None):
        
        self.config = config
        self.strip_agent_callback = strip_agent_callback
        self.log_agent_callback = log_agent_callback
        self.task_agent_callback = task_agent_callback
        
        # Audio pipelines for different frequencies
        self.pipelines: Dict[str, AudioPipeline] = {}
        self.transcript_queue = queue.Queue(maxsize=1000)
        
        # Processing state
        self._running = False
        self.processing_thread: Optional[threading.Thread] = None
        
        # Message tracking
        self.message_counter = 0
        self.recent_messages: List[ATCMessage] = []
        self.max_recent_messages = 100
        
        logger.info("AudioAgent initialized")
    
    def start(self):
        """Start the AudioAgent and all audio pipelines"""
        if self._running:
            return
            
        self._running = True
        
        # Start processing thread
        self.processing_thread = threading.Thread(
            target=self._process_transcripts,
            daemon=True
        )
        self.processing_thread.start()
        
        # Start audio pipelines for configured frequencies
        for freq_config in self.config.get("frequencies", []):
            self._start_pipeline(freq_config)
        
        logger.info("AudioAgent started")
    
    def stop(self):
        """Stop the AudioAgent and all audio pipelines"""
        if not self._running:
            return
            
        self._running = False
        
        # Stop all pipelines
        for pipeline in self.pipelines.values():
            pipeline.stop()
        self.pipelines.clear()
        
        # Wait for processing thread
        if self.processing_thread:
            self.processing_thread.join(timeout=5.0)
        
        logger.info("AudioAgent stopped")
    
    def _start_pipeline(self, freq_config: Dict):
        """Start an audio pipeline for a specific frequency"""
        frequency = freq_config["frequency"]
        url = freq_config["url"]
        engine_type = freq_config.get("engine", "whisper")
        engine_config = freq_config.get("engine_config", {})
        
        try:
            # Create transcription engine
            engine = create_transcription_engine(engine_type, **engine_config)
            
            # Create pipeline
            pipeline = AudioPipeline(
                url=url,
                frequency=frequency,
                engine=engine,
                transcript_callback=self._on_transcript_received,
                chunk_size=freq_config.get("chunk_size", 4096),
                buffer_duration_ms=freq_config.get("buffer_duration_ms", 1000)
            )
            
            # Start pipeline
            pipeline.start()
            self.pipelines[frequency] = pipeline
            
            logger.info(f"Started pipeline for {frequency}")
            
        except Exception as e:
            logger.error(f"Failed to start pipeline for {frequency}: {e}")
    
    def _on_transcript_received(self, transcript: Transcript):
        """Callback when a transcript is received from audio pipeline"""
        try:
            # Put transcript in queue for processing
            self.transcript_queue.put(transcript, timeout=1.0)
        except queue.Full:
            logger.warning("Transcript queue full, dropping transcript")
    
    def _process_transcripts(self):
        """Main processing loop for transcripts"""
        while self._running:
            try:
                # Get transcript with timeout
                transcript = self.transcript_queue.get(timeout=1.0)
                
                # Process the transcript
                atc_message = self._process_transcript(transcript)
                
                if atc_message:
                    # Forward to downstream agents
                    self._forward_to_downstream_agents(atc_message)
                    
                    # Store in recent messages
                    self._store_message(atc_message)
                    
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Error processing transcript: {e}")
    
    def _process_transcript(self, transcript: Transcript) -> Optional[ATCMessage]:
        """Process a raw transcript into an ATC message"""
        if not transcript.text.strip():
            return None
        
        # Basic text cleaning
        cleaned_text = self._clean_text(transcript.text)
        
        # Determine message type
        message_type = self._classify_message_type(cleaned_text)
        
        # Create ATC message
        atc_message = ATCMessage(
            id=f"msg_{self.message_counter:06d}",
            timestamp=transcript.timestamp,
            frequency=transcript.frequency,
            raw_text=transcript.text,
            cleaned_text=cleaned_text,
            message_type=message_type,
            confidence=transcript.confidence,
            source_engine=transcript.engine,
            metadata={
                "duration_ms": transcript.duration_ms,
                "original_confidence": transcript.confidence
            }
        )
        
        self.message_counter += 1
        
        logger.debug(f"Processed message: {atc_message.id} - {message_type}")
        return atc_message
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize transcript text"""
        # Remove extra whitespace
        text = " ".join(text.split())
        
        # Basic ATC terminology normalization
        replacements = {
            "roger": "roger",
            "wilco": "wilco",
            "affirmative": "affirmative",
            "negative": "negative",
            "over": "over",
            "out": "out",
            "standby": "standby",
            "cleared": "cleared",
            "approved": "approved",
            "unable": "unable"
        }
        
        for old, new in replacements.items():
            text = text.replace(old.lower(), new)
        
        return text
    
    def _classify_message_type(self, text: str) -> str:
        """Classify the type of ATC message"""
        text_lower = text.lower()
        
        # Clearance messages
        if any(word in text_lower for word in ["cleared", "approved", "authorized"]):
            return "clearance"
        
        # Instructions
        if any(word in text_lower for word in ["turn", "climb", "descend", "maintain", "contact"]):
            return "instruction"
        
        # Readbacks
        if any(word in text_lower for word in ["roger", "wilco", "copy", "understood"]):
            return "readback"
        
        # Weather
        if any(word in text_lower for word in ["weather", "wind", "visibility", "ceiling"]):
            return "weather"
        
        # Traffic
        if any(word in text_lower for word in ["traffic", "aircraft", "traffic in sight"]):
            return "traffic"
        
        # Emergency
        if any(word in text_lower for word in ["mayday", "pan pan", "emergency"]):
            return "emergency"
        
        # Default
        return "general"
    
    def _forward_to_downstream_agents(self, atc_message: ATCMessage):
        """Forward processed message to downstream agents"""
        message_dict = asdict(atc_message)
        message_dict["timestamp"] = atc_message.timestamp.isoformat()
        
        # Forward to StripAgent for parsing
        if self.strip_agent_callback:
            try:
                self.strip_agent_callback(atc_message)
            except Exception as e:
                logger.error(f"Error forwarding to StripAgent: {e}")
        
        # Forward to LogAgent for archiving
        if self.log_agent_callback:
            try:
                self.log_agent_callback(atc_message)
            except Exception as e:
                logger.error(f"Error forwarding to LogAgent: {e}")
        
        # Forward to TaskAgent for advisory triggers
        if self.task_agent_callback:
            try:
                self.task_agent_callback(atc_message)
            except Exception as e:
                logger.error(f"Error forwarding to TaskAgent: {e}")
    
    def _store_message(self, atc_message: ATCMessage):
        """Store message in recent messages list"""
        self.recent_messages.append(atc_message)
        
        # Keep only recent messages
        if len(self.recent_messages) > self.max_recent_messages:
            self.recent_messages = self.recent_messages[-self.max_recent_messages:]
    
    def get_recent_messages(self, limit: int = 10) -> List[ATCMessage]:
        """Get recent ATC messages"""
        return self.recent_messages[-limit:]
    
    def get_messages_by_type(self, message_type: str, limit: int = 10) -> List[ATCMessage]:
        """Get recent messages of a specific type"""
        filtered = [msg for msg in self.recent_messages if msg.message_type == message_type]
        return filtered[-limit:]
    
    def get_messages_by_frequency(self, frequency: str, limit: int = 10) -> List[ATCMessage]:
        """Get recent messages from a specific frequency"""
        filtered = [msg for msg in self.recent_messages if msg.frequency == frequency]
        return filtered[-limit:]
    
    def is_running(self) -> bool:
        """Check if AudioAgent is running"""
        return self._running
    
    def get_pipeline_status(self) -> Dict:
        """Get status of all audio pipelines"""
        status = {}
        for frequency, pipeline in self.pipelines.items():
            status[frequency] = {
                "running": pipeline.is_running(),
                "url": pipeline.url
            }
        return status

# Example configuration
DEFAULT_CONFIG = {
    "frequencies": [
        {
            "frequency": "KSFO_TWR",
            "url": "http://audio.liveatc.net/ksfo_twr",
            "engine": "whisper",
            "engine_config": {
                "model_name": "base"
            },
            "chunk_size": 4096,
            "buffer_duration_ms": 1000
        },
        {
            "frequency": "KSFO_GND",
            "url": "http://audio.liveatc.net/ksfo_gnd",
            "engine": "whisper",
            "engine_config": {
                "model_name": "base"
            },
            "chunk_size": 4096,
            "buffer_duration_ms": 1000
        }
    ]
}

# Example usage
if __name__ == "__main__":
    def strip_agent_callback(atc_message: ATCMessage):
        print(f"StripAgent: {atc_message.cleaned_text}")
    
    def log_agent_callback(atc_message: ATCMessage):
        print(f"LogAgent: Archiving message {atc_message.id}")
    
    def task_agent_callback(atc_message: ATCMessage):
        if atc_message.message_type == "emergency":
            print(f"TaskAgent: EMERGENCY DETECTED - {atc_message.cleaned_text}")
    
    # Create AudioAgent
    agent = AudioAgent(
        config=DEFAULT_CONFIG,
        strip_agent_callback=strip_agent_callback,
        log_agent_callback=log_agent_callback,
        task_agent_callback=task_agent_callback
    )
    
    try:
        agent.start()
        print("AudioAgent started. Press Ctrl+C to stop.")
        
        # Keep running
        while True:
            import time
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\nStopping AudioAgent...")
        agent.stop()
        print("AudioAgent stopped.")
