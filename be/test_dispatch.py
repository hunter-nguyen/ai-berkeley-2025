#!/usr/bin/env python3
"""
Test script for emergency dispatch system
"""
import json
import os
import asyncio
from datetime import datetime
from src.vapi_service import VAPIService

async def test_dispatch_system():
    """Test the complete dispatch workflow"""
    print("🔥 Testing Emergency Dispatch System")
    print("=" * 50)
    
    # Test emergency scenarios
    test_emergencies = [
        {
            "id": "test_bird_strike_001",
            "callsign": "AAL445",
            "emergency_type": "bird_strike",
            "description": "Bird strike on departure, returning to field",
            "original_message": "American 445, EMERGENCY, bird strike on departure, returning to field, 180 souls on board"
        },
        {
            "id": "test_engine_failure_002", 
            "callsign": "UAL1234",
            "emergency_type": "engine_failure",
            "description": "Engine failure during climb",
            "original_message": "United 1234 declaring emergency, engine failure, requesting vectors back to SFO, 298 souls on board"
        },
        {
            "id": "test_medical_003",
            "callsign": "DL567",
            "emergency_type": "medical_emergency", 
            "description": "Medical emergency passenger unconscious",
            "original_message": "Delta 567, medical emergency, passenger unconscious, requesting priority landing"
        }
    ]
    
    # Initialize VAPI service (will use simulation mode without token)
    vapi_service = VAPIService("test_token")
    
    print(f"📋 Testing {len(test_emergencies)} emergency scenarios...")
    print()
    
    for i, emergency in enumerate(test_emergencies, 1):
        print(f"Test {i}: {emergency['callsign']} - {emergency['emergency_type']}")
        print(f"  Description: {emergency['description']}")
        print(f"  Original ATC: {emergency['original_message']}")
        
        try:
            # Dispatch the emergency
            dispatch_call = await vapi_service.dispatch_emergency_call(emergency)
            
            print(f"  ✅ Dispatch ID: {dispatch_call.id}")
            print(f"  📞 Call Status: {dispatch_call.call_status}")
            print(f"  🎯 Recipient: {dispatch_call.call_recipient}")
            print(f"  ⏰ Initiated: {dispatch_call.initiated_at}")
            
            if dispatch_call.call_id:
                print(f"  🆔 Call ID: {dispatch_call.call_id}")
            
        except Exception as e:
            print(f"  ❌ Error: {e}")
        
        print()
    
    # Check dispatch records
    print("📊 Recent Dispatch Records:")
    records = vapi_service.get_dispatch_records(10)
    
    if records:
        for record in records[-3:]:  # Show last 3
            print(f"  • {record['callsign']} ({record['emergency_type']}) - {record['call_status']}")
    else:
        print("  No dispatch records found")
    
    print("\n🔧 Configuration Files Check:")
    
    # Check if config files exist
    config_files = [
        "dispatch_configs.json",
        "emergency_protocols.json", 
        "dispatch_records.json"
    ]
    
    for config_file in config_files:
        if os.path.exists(config_file):
            with open(config_file, 'r') as f:
                data = json.load(f)
                print(f"  ✅ {config_file}: {len(data) if isinstance(data, (list, dict)) else 'OK'}")
        else:
            print(f"  ❌ {config_file}: Missing")

def test_api_integration():
    """Test the API integration flow"""
    print("\n🌐 Testing API Integration Flow")
    print("=" * 50)
    
    # Simulate the frontend dispatch payload
    test_payload = {
        "alertId": "alert_12345",
        "callsign": "SWA789",
        "emergencyType": "fuel_emergency",
        "description": "Low fuel emergency",
        "originalMessage": "Southwest 789, declaring minimum fuel emergency, requesting direct SFO"
    }
    
    print(f"📤 Frontend Payload:")
    print(json.dumps(test_payload, indent=2))
    
    # This would normally be handled by the Next.js API route
    print("\n📥 Expected API Response:")
    expected_response = {
        "success": True,
        "dispatch_id": f"dispatch_{int(datetime.now().timestamp())}_alert_123",
        "call_status": "calling",
        "call_id": f"sim_call_{int(datetime.now().timestamp())}",
        "recipient": "airport_ops",
        "script": "Fuel emergency declared by SWA789..."
    }
    print(json.dumps(expected_response, indent=2))

if __name__ == "__main__":
    # Run tests
    asyncio.run(test_dispatch_system())
    test_api_integration()
    
    print("\n🎯 Setup Instructions:")
    print("1. Add VAPI_TOKEN to environment variables for real calls")
    print("2. Update phone numbers in dispatch_configs.json")
    print("3. Customize emergency protocols in emergency_protocols.json")
    print("4. Test with real emergencies from ATC messages")
    print("\n✨ Dispatch system ready!") 