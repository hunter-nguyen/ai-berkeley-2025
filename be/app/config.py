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
    
    # Audio Settings
    liveatc_url: str = "https://d.liveatc.net/ksfo_twr"
    chunk_duration: int = 5
    sample_rate: int = 16000
    
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
    
    return len(errors) == 0, errors 