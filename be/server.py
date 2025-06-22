#!/usr/bin/env python3
"""
🎧 ATC Audio Agent - Simple Server Launcher
Just run: python server.py
"""
import uvicorn
from app.config import get_settings


def main():
    """Start the ATC Audio Agent server"""
    settings = get_settings()
    
    print("🎧 ATC Audio Agent Server")
    print("=" * 50)
    print(f"🌐 Server: http://{settings.host}:{settings.port}")
    print(f"🔌 WebSocket: ws://{settings.host}:{settings.port}/api/v1/ws")
    print(f"📊 Stats: http://{settings.host}:{settings.port}/api/v1/stats")
    print(f"🛩️  Audio Source: {settings.liveatc_url}")
    print("🎵 Audio will play through your speakers")
    print("🔧 Press Ctrl+C to stop")
    print("=" * 50)
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        log_level=settings.log_level.lower()
    )


if __name__ == "__main__":
    main() 