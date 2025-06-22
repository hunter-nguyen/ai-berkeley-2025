#!/usr/bin/env python3
"""
Quick VAPI test script
"""
import asyncio
import sys
from pathlib import Path

# Add the app directory to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.agents.vapi_voice_agent import VAPIVoiceAgent

async def test_vapi():
    """Test VAPI connection"""
    api_key = input("Enter your VAPI API key: ").strip()
    
    if not api_key:
        print("❌ API key required")
        return
    
    vapi = VAPIVoiceAgent(api_key)
    
    print("🔍 Testing VAPI connection...")
    
    # Test listing assistants
    assistants = await vapi.list_assistants()
    
    if "error" in assistants:
        print(f"❌ Error: {assistants['error']}")
        return
    
    print("✅ VAPI connection successful!")
    print(f"📋 Found {len(assistants)} assistants")
    
    for i, assistant in enumerate(assistants[:5]):  # Show first 5
        print(f"  {i+1}. {assistant.get('name', 'Unnamed')} (ID: {assistant.get('id', 'N/A')})")

if __name__ == "__main__":
    asyncio.run(test_vapi()) 