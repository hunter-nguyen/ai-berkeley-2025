#!/usr/bin/env python3
"""
Direct Vapi API Call Test
========================

Test script to make a direct call to Vapi API for emergency testing.
"""

import os
import asyncio
import httpx
import json
from datetime import datetime

async def test_vapi_call():
    """Test direct Vapi API call"""
    
    # Get environment variables
    vapi_token = os.getenv("VAPI_TOKEN")
    phone_number_id = os.getenv("VAPI_PHONE_NUMBER_ID") 
    assistant_id = os.getenv("VAPI_ASSISTANT_ID")
    receiver_phone = os.getenv("RECEIVER_PHONE_NUMBER")
    
    print("🔍 Checking Vapi Configuration...")
    print(f"VAPI_TOKEN: {'✅ Set' if vapi_token else '❌ Missing'}")
    print(f"VAPI_PHONE_NUMBER_ID: {'✅ Set' if phone_number_id else '❌ Missing'}")
    print(f"VAPI_ASSISTANT_ID: {'✅ Set' if assistant_id else '❌ Missing'}")
    print(f"RECEIVER_PHONE_NUMBER: {'✅ Set' if receiver_phone else '❌ Missing'}")
    
    if not all([vapi_token, phone_number_id, assistant_id, receiver_phone]):
        print("❌ Missing required Vapi configuration")
        return
    
    # Prepare call payload
    call_payload = {
        "assistantId": assistant_id,
        "phoneNumberId": phone_number_id,
        "customer": {
            "number": receiver_phone
        },
        "metadata": {
            "emergency_call": True,
            "emergency_level": "critical",
            "emergency_type": "engine_failure", 
            "callsign": "UAL123",
            "confidence": 0.95,
            "reasoning": "MAYDAY declared - engine failure emergency test",
            "transcript": "MAYDAY MAYDAY UAL123 engine failure requesting immediate landing",
            "timestamp": datetime.now().isoformat(),
            "test_call": True
        }
    }
    
    headers = {
        "Authorization": f"Bearer {vapi_token}",
        "Content-Type": "application/json"
    }
    
    print(f"\n📞 Attempting emergency call to {receiver_phone}...")
    print(f"   Assistant: {assistant_id}")
    print(f"   Phone ID: {phone_number_id}")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.vapi.ai/call",
                json=call_payload,
                headers=headers,
                timeout=30.0
            )
            
            print(f"\n📋 Response Status: {response.status_code}")
            
            if response.status_code == 201:
                result = response.json()
                call_id = result.get("id", "unknown")
                print(f"✅ Call initiated successfully!")
                print(f"   Call ID: {call_id}")
                print(f"   Status: {result.get('status', 'unknown')}")
                print(f"📱 Your phone ({receiver_phone}) should ring shortly!")
                
            elif response.status_code == 401:
                print("❌ Authentication failed - check VAPI_TOKEN")
                
            elif response.status_code == 400:
                error_data = response.json()
                print(f"❌ Bad request: {error_data}")
                
            else:
                print(f"❌ Request failed: {response.status_code}")
                print(f"   Response: {response.text}")
                
    except httpx.TimeoutException:
        print("❌ Request timed out")
    except Exception as e:
        print(f"❌ Error making call: {e}")

async def main():
    """Main test function"""
    print("🚀 Direct Vapi API Call Test")
    print("=" * 50)
    
    await test_vapi_call()
    
    print("\n" + "=" * 50)
    print("✅ Test completed!")

if __name__ == "__main__":
    asyncio.run(main()) 