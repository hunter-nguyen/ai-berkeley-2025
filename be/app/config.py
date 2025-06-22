"""
Configuration management for ATC Audio Agent
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # API Keys
    groq_api_key: str
    vapi_api_key: Optional[str] = None
    letta_api_key: Optional[str] = None
    
    # Agent Settings
    transcriber_agent_address: str = "http://127.0.0.1:8001/transcribe"
    
    # VAPI Settings
    vapi_base_url: str = "https://api.vapi.ai"
    vapi_assistant_id: Optional[str] = None
    vapi_phone_number_id: Optional[str] = None
    emergency_phone_number: Optional[str] = None
    
    # Audio Settings
    liveatc_url: str = "https://d.liveatc.net/ksfo_twr"
    chunk_duration: int = 5
    sample_rate: int = 16000
    
    # Transcription Model Settings
    use_atc_optimized_model: bool = True
    atc_model_name: str = "jacktol/whisper-medium.en-fine-tuned-for-ATC"
    fallback_model: str = "whisper-large-v3-turbo"
    model_confidence_threshold: float = 0.85
    
    # Server Settings
    host: str = "0.0.0.0"
    port: int = 8002
    websocket_port: int = 8765
    
    # Logging
    log_level: str = "INFO"
    
    # Development
    debug: bool = False
    reload: bool = False
    
    class Config:
        env_file = ".env"
        env_prefix = ""
        case_sensitive = False


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get application settings"""
    return settings


def validate_settings() -> tuple[bool, list[str]]:
    """Validate required settings and return (is_valid, errors)"""
    errors = []
    
    if not settings.groq_api_key:
        errors.append("GROQ_API_KEY is required")
    
    if not settings.liveatc_url:
        errors.append("LIVEATC_URL is required")
    
    if not settings.transcriber_agent_address:
        errors.append("TRANSCRIBER_AGENT_ADDRESS is required")
    
    # VAPI settings (optional but warn if incomplete)
    if settings.vapi_api_key and not settings.vapi_assistant_id:
        errors.append("VAPI_ASSISTANT_ID required when VAPI_API_KEY is provided")
    
    if settings.vapi_api_key and not settings.emergency_phone_number:
        errors.append("EMERGENCY_PHONE_NUMBER required when VAPI_API_KEY is provided")
    
    return len(errors) == 0, errors 