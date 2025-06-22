#!/usr/bin/env python3
"""
🎧 ATC Audio Agent - Simple Launcher
Just run: python start.py
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from root .env file
load_dotenv(Path(__file__).parent.parent.parent / '.env')

print("🎧 Starting ATC Audio Agent...")
print(f"🛩️  Airport: {os.getenv('LIVEATC_URL', 'https://d.liveatc.net/ksfo_twr')}")
print("🎵 Audio will play through your speakers")
print("🌐 WebSocket server: ws://localhost:8765")
print("🔧 Press Ctrl+C to stop")
print()

# Import and run
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from run_atc_agent import main
import asyncio

if __name__ == "__main__":
    asyncio.run(main()) 