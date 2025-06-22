#!/usr/bin/env python3
"""
ASI:One Emergency System Test Script
===================================

Tests the emergency detection and Vapi calling functionality.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from app.agents.asi_one_agent import ASIOneAgent, EmergencyContext
from app.core.mcp_integration import MCPManager


async def test_emergency_scenarios():
    """Test various emergency scenarios"""
    print("🧠 Testing ASI:One Emergency Detection System")
    print("=" * 60)
    
    # Initialize ASI:One agent
    groq_api_key = os.getenv("GROQ_API_KEY")
    asi_agent = ASIOneAgent(groq_api_key=groq_api_key)
    
    # Test scenarios
    scenarios = [
        {
            "name": "Critical Engine Failure",
            "transcript": "MAYDAY MAYDAY MAYDAY United 123 engine failure requesting immediate landing runway 24L",
            "callsign": "UAL123",
            "instructions": "Emergency landing cleared",
            "runways": ["24L"],
            "expected_level": "critical"
        },
        {
            "name": "Medical Emergency", 
            "transcript": "PAN-PAN PAN-PAN American 456 medical emergency onboard requesting priority landing",
            "callsign": "AAL456",
            "instructions": "Priority approach cleared",
            "runways": ["06R"],
            "expected_level": "high"
        },
        {
            "name": "Fuel Emergency",
            "transcript": "Delta 789 declaring minimum fuel emergency requesting vectors to nearest airport",
            "callsign": "DAL789", 
            "instructions": "Vector heading 270",
            "runways": ["10L"],
            "expected_level": "medium"
        },
        {
            "name": "Bird Strike",
            "transcript": "Southwest 321 bird strike on takeoff return to field possible engine damage",
            "callsign": "SWA321",
            "instructions": "Return to field approved",
            "runways": ["08R"],
            "expected_level": "medium"
        },
        {
            "name": "Normal Communication",
            "transcript": "Cleared for takeoff runway 24L contact departure 121.9",
            "callsign": "UAL555",
            "instructions": "Takeoff cleared",
            "runways": ["24L"],
            "expected_level": "none"
        },
        {
            "name": "Runway Incursion",
            "transcript": "STOP STOP all aircraft runway 06L unauthorized vehicle on runway emergency vehicles responding", 
            "callsign": "TOWER",
            "instructions": "All stop",
            "runways": ["06L"],
            "expected_level": "high"
        }
    ]
    
    print(f"🔍 Testing {len(scenarios)} emergency scenarios...")
    print()
    
    for i, scenario in enumerate(scenarios, 1):
        print(f"{i}. {scenario['name']}")
        print(f"   Transcript: {scenario['transcript']}")
        
        # Create emergency context
        context = EmergencyContext(
            callsign=scenario['callsign'],
            transcript=scenario['transcript'],
            instructions=scenario['instructions'],
            runways=scenario['runways'],
            timestamp=datetime.now(timezone.utc)
        )
        
        # Analyze emergency
        assessment = await asi_agent.analyze_emergency(context)
        
        if assessment:
            print(f"   Result: {assessment.level.value.upper()} "
                  f"({assessment.confidence:.2f} confidence)")
            print(f"   Type: {assessment.emergency_type.value}")
            print(f"   Call Required: {assessment.call_required}")
            print(f"   Reasoning: {assessment.reasoning}")
            
            # Check if matches expected
            if assessment.level.value == scenario['expected_level']:
                print("   ✅ Expected result")
            else:
                print(f"   ⚠️  Expected {scenario['expected_level']}, got {assessment.level.value}")
        else:
            print("   ❌ Analysis failed")
        
        print()
    
    # Test emergency calling (if configured)
    vapi_token = os.getenv("VAPI_TOKEN")
    vapi_phone_id = os.getenv("VAPI_PHONE_NUMBER_ID")
    vapi_assistant = os.getenv("VAPI_ASSISTANT_ID")
    test_number = os.getenv("TEST_PHONE_NUMBER")
    
    if vapi_token and vapi_phone_id and vapi_assistant and test_number:
        print("\n🧪 Testing Emergency Call Integration...")
        await asi_agent.test_emergency_call(test_number, "Test call from ASI:One emergency system")
    else:
        print("\n⚠️  Emergency calling not configured - skipping call test")
        print("   Set VAPI_TOKEN, VAPI_PHONE_NUMBER_ID, VAPI_ASSISTANT_ID, and TEST_PHONE_NUMBER to test calls")


async def test_mcp_integration():
    """Test MCP integration"""
    print("\n🔌 Testing MCP Integration")
    print("=" * 40)
    
    mcp_manager = MCPManager()
    
    try:
        await mcp_manager.initialize()
        print("✅ MCP Manager initialized")
        
        # Test Vapi connection
        vapi_token = os.getenv("VAPI_TOKEN")
        if vapi_token:
            print("✅ Vapi token configured")
            # Could add more Vapi-specific tests here
        else:
            print("⚠️  Vapi token not configured")
            
    except Exception as e:
        print(f"❌ MCP initialization failed: {e}")
    finally:
        await mcp_manager.disconnect_all()


async def main():
    """Main test function"""
    print("🚀 ASI:One Emergency System Test Suite")
    print("=" * 80)
    
    # Check environment
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        print("❌ GROQ_API_KEY not set - emergency detection will fail")
        print("   Please set your Groq API key to test emergency detection")
        return
    
    print("✅ GROQ_API_KEY configured")
    
    # Run tests
    await test_emergency_scenarios()
    await test_mcp_integration()
    
    print("\n" + "=" * 80)
    print("✅ Emergency system tests completed!")
    print("   Check the results above for any issues.")


if __name__ == "__main__":
    asyncio.run(main()) 