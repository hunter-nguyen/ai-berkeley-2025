#!/usr/bin/env python3
"""
Emergency VAPI Caller Script
Run this to make emergency calls with dynamic data
"""
import asyncio
import json
import sys
import os
from pathlib import Path

# Add the app directory to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.agents.vapi_voice_agent import VAPIVoiceAgent
from app.config import get_settings

async def main():
    """Main emergency caller function"""
    settings = get_settings()
    
    # Check if VAPI is configured
    if not settings.vapi_api_key:
        print("❌ VAPI_API_KEY not set in environment")
        print("Set it with: export VAPI_API_KEY=your_api_key")
        return
    
    if not settings.vapi_assistant_id:
        print("❌ VAPI_ASSISTANT_ID not set in environment")
        print("Set it with: export VAPI_ASSISTANT_ID=your_assistant_id")
        return
    
    if not settings.emergency_phone_number:
        print("❌ EMERGENCY_PHONE_NUMBER not set in environment")
        print("Set it with: export EMERGENCY_PHONE_NUMBER=+1234567890")
        return
    
    # Initialize VAPI agent
    vapi_agent = VAPIVoiceAgent(
        api_key=settings.vapi_api_key,
        base_url=settings.vapi_base_url
    )
    
    print("🚨 VAPI Emergency Caller Ready")
    print(f"📞 Emergency Phone: {settings.emergency_phone_number}")
    print(f"🤖 Assistant ID: {settings.vapi_assistant_id}")
    print("-" * 50)
    
    # Example emergency scenarios
    scenarios = {
        "1": {
            "name": "Airport Fire Emergency",
            "func": lambda: vapi_agent.make_airport_emergency_call(
                assistant_id=settings.vapi_assistant_id,
                phone_number=settings.emergency_phone_number,
                airport_code="KSFO",
                emergency_type="fire",
                details={
                    "location": "Terminal 3, Gate B15",
                    "severity": "major",
                    "evacuations": "in_progress",
                    "fire_department": "dispatched",
                    "reported_by": "ATC Tower",
                    "contact_info": "tower@ksfo.airport.gov"
                },
                urgency_level="critical",
                phone_number_id=settings.vapi_phone_number_id
            )
        },
        "2": {
            "name": "Medical Emergency",
            "func": lambda: vapi_agent.make_airport_emergency_call(
                assistant_id=settings.vapi_assistant_id,
                phone_number=settings.emergency_phone_number,
                airport_code="KSFO",
                emergency_type="medical",
                details={
                    "location": "Runway 28R",
                    "aircraft": "UAL297",
                    "passenger_count": 180,
                    "medical_issue": "passenger_cardiac_arrest",
                    "ambulance": "requested",
                    "reported_by": "Flight Crew"
                },
                urgency_level="high",
                phone_number_id=settings.vapi_phone_number_id
            )
        },
        "3": {
            "name": "Security Incident",
            "func": lambda: vapi_agent.make_airport_emergency_call(
                assistant_id=settings.vapi_assistant_id,
                phone_number=settings.emergency_phone_number,
                airport_code="KSFO",
                emergency_type="security",
                details={
                    "location": "Security Checkpoint A",
                    "incident_type": "suspicious_package",
                    "area_status": "evacuated",
                    "bomb_squad": "en_route",
                    "reported_by": "TSA Officer",
                    "threat_level": "medium"
                },
                urgency_level="high",
                phone_number_id=settings.vapi_phone_number_id
            )
        },
        "4": {
            "name": "Weather Alert",
            "func": lambda: vapi_agent.make_weather_alert_call(
                assistant_id=settings.vapi_assistant_id,
                phone_number=settings.emergency_phone_number,
                airport_code="KSFO",
                weather_data={
                    "alert_type": "severe_thunderstorm",
                    "wind_speed": "65_knots",
                    "visibility": "0.25_miles",
                    "conditions": "heavy_rain_lightning",
                    "runway_status": "closed",
                    "estimated_duration": "2_hours"
                },
                phone_number_id=settings.vapi_phone_number_id
            )
        },
        "5": {
            "name": "Custom Emergency",
            "func": None  # Will be handled separately
        }
    }
    
    while True:
        print("\n📋 Available Emergency Scenarios:")
        for key, scenario in scenarios.items():
            print(f"  {key}. {scenario['name']}")
        print("  6. List VAPI Assistants")
        print("  7. Check Agent Stats")
        print("  q. Quit")
        
        choice = input("\n🚨 Select emergency scenario (1-7, q): ").strip()
        
        if choice.lower() == 'q':
            print("👋 Emergency caller stopped")
            break
        
        elif choice == "6":
            print("📋 Fetching VAPI assistants...")
            assistants = await vapi_agent.list_assistants()
            print(json.dumps(assistants, indent=2))
        
        elif choice == "7":
            stats = vapi_agent.get_stats()
            print("📊 Agent Statistics:")
            print(json.dumps(stats, indent=2))
        
        elif choice == "5":
            # Custom emergency
            print("\n🔧 Custom Emergency Setup:")
            airport_code = input("Airport Code (e.g., KSFO): ").strip() or "KSFO"
            emergency_type = input("Emergency Type (fire/medical/security/weather): ").strip() or "general"
            location = input("Location: ").strip() or f"{airport_code} Airport"
            urgency = input("Urgency (low/medium/high/critical): ").strip() or "medium"
            
            custom_details = {
                "location": location,
                "reported_by": "ATC System",
                "custom_setup": True
            }
            
            print(f"\n🚨 Making custom emergency call: {emergency_type} at {airport_code}")
            result = await vapi_agent.make_airport_emergency_call(
                assistant_id=settings.vapi_assistant_id,
                phone_number=settings.emergency_phone_number,
                airport_code=airport_code,
                emergency_type=emergency_type,
                details=custom_details,
                urgency_level=urgency,
                phone_number_id=settings.vapi_phone_number_id
            )
            
            print("\n📞 Call Result:")
            print(json.dumps(result, indent=2))
        
        elif choice in scenarios and scenarios[choice]["func"]:
            scenario = scenarios[choice]
            print(f"\n🚨 Initiating: {scenario['name']}")
            print("⏳ Making VAPI call...")
            
            try:
                result = await scenario["func"]()
                
                print("\n📞 Call Result:")
                print(json.dumps(result, indent=2))
                
                if result.get("success"):
                    call_id = result.get("call_id")
                    print(f"\n✅ Call initiated successfully!")
                    print(f"📞 Call ID: {call_id}")
                    print(f"📊 Status: {result.get('status')}")
                    
                    # Optionally check call status
                    check_status = input("\n❓ Check call status? (y/n): ").strip().lower()
                    if check_status == 'y' and call_id:
                        print("⏳ Checking call status...")
                        status = await vapi_agent.get_call_status(call_id)
                        print(json.dumps(status, indent=2))
                else:
                    print(f"\n❌ Call failed: {result.get('error')}")
                    
            except Exception as e:
                print(f"\n❌ Error: {e}")
        
        else:
            print("❌ Invalid choice. Please try again.")


if __name__ == "__main__":
    print("🚨 Starting Emergency VAPI Caller...")
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n👋 Emergency caller interrupted")
    except Exception as e:
        print(f"\n❌ Error: {e}") 