#!/usr/bin/env python3
"""
ASI:One Emergency System Setup Script
====================================

This script helps you set up the ASI:One emergency detection and Vapi calling system.
"""

import os
import sys

def check_environment():
    """Check current environment configuration"""
    print("🔍 Checking ASI:One Emergency System Configuration")
    print("=" * 60)
    
    # Required for basic operation
    groq_key = os.getenv("GROQ_API_KEY")
    print(f"GROQ_API_KEY: {'✅ Set' if groq_key else '❌ Missing (REQUIRED)'}")
    
    # Optional for emergency calling
    vapi_token = os.getenv("VAPI_TOKEN")
    vapi_phone_id = os.getenv("VAPI_PHONE_NUMBER_ID")
    vapi_assistant = os.getenv("VAPI_ASSISTANT_ID")
    receiver_phone = os.getenv("RECEIVER_PHONE_NUMBER")
    test_number = os.getenv("TEST_PHONE_NUMBER")
    
    print(f"VAPI_TOKEN: {'✅ Set' if vapi_token else '❌ Missing (for emergency calling)'}")
    print(f"VAPI_PHONE_NUMBER_ID: {'✅ Set' if vapi_phone_id else '❌ Missing (for emergency calling)'}")
    print(f"VAPI_ASSISTANT_ID: {'✅ Set' if vapi_assistant else '❌ Missing (for emergency calling)'}")
    print(f"RECEIVER_PHONE_NUMBER: {'✅ Set' if receiver_phone else '❌ Missing (for emergency calling)'}")
    print(f"TEST_PHONE_NUMBER: {'✅ Set' if test_number else '❌ Missing (for testing)'}")
    
    print("\n📋 Configuration Status:")
    
    if not groq_key:
        print("❌ CRITICAL: GROQ_API_KEY is required for emergency detection")
        return False
    
    if not vapi_token:
        print("⚠️  WARNING: Emergency calling disabled (VAPI_TOKEN not set)")
        print("   Emergency detection will work, but no calls will be made")
        return True
    
    if not vapi_phone_id or not vapi_assistant:
        print("⚠️  WARNING: Incomplete Vapi configuration")
        print("   Set VAPI_PHONE_NUMBER_ID and VAPI_ASSISTANT_ID for full functionality")
        return True
    
    print("✅ All systems configured for emergency calling!")
    return True


def show_setup_instructions():
    """Show setup instructions"""
    print("\n🚀 ASI:One Emergency System Setup Instructions")
    print("=" * 60)
    
    print("\n1. 📝 Add these variables to your .env file:")
    print("   (Copy and paste, then replace with your actual values)")
    print()
    
    env_template = """# ASI:One Emergency System Configuration
GROQ_API_KEY=your_groq_api_key_here

# Vapi MCP Emergency Calling (optional)
VAPI_TOKEN=your_vapi_token_here
VAPI_PHONE_NUMBER_ID=your_vapi_phone_number_id
VAPI_ASSISTANT_ID=your_assistant_id
RECEIVER_PHONE_NUMBER=+1234567890

# Testing (optional)
TEST_PHONE_NUMBER=+1234567890"""
    
    print(env_template)
    
    print("\n2. 🔑 Get your API keys:")
    print("   • GROQ_API_KEY: https://console.groq.com/keys")
    print("   • VAPI_TOKEN: https://dashboard.vapi.ai/account")
    
    print("\n3. 📞 Configure Vapi (for emergency calling):")
    print("   • Create assistants: https://dashboard.vapi.ai/assistants")
    print("   • Get phone number: https://dashboard.vapi.ai/phone-numbers")
    
    print("\n4. 🧪 Test the system:")
    print("   cd be")
    print("   python test_emergency_system.py")
    
    print("\n5. 🚀 Run the full system:")
    print("   cd be")
    print("   python -m uvicorn app.main:app --reload")


def create_vapi_assistants_guide():
    """Show guide for creating Vapi assistant"""
    print("\n🤖 Vapi Assistant Configuration Guide")
    print("=" * 60)
    
    print("Create a single assistant for all emergency calls:")
    print("Environment Variable: VAPI_ASSISTANT_ID")
    print("Purpose: Handle all emergency notifications")
    print("\nRecommended Assistant Configuration:")
    print("   {")
    print('     "name": "ATC Emergency Alert System",')
    print('     "model": {"provider": "openai", "model": "gpt-4o"},')
    print('     "voice": {"provider": "azure", "voiceId": "andrew"},')
    print('     "firstMessage": "This is an automated emergency alert from the Air Traffic Control monitoring system. An aviation emergency has been detected.",')
    print('     "systemMessage": "You are an ATC emergency notification system. Deliver aviation emergency information clearly and professionally. Include: emergency type, aircraft callsign, confidence level, and brief reasoning. Keep calls under 45 seconds. Be calm but urgent."')
    print("   }")
    
    print("\n📞 The system will call the number specified in RECEIVER_PHONE_NUMBER")
    print("   for all emergencies above the confidence threshold.")


def main():
    """Main setup function"""
    print("🧠 ASI:One Emergency Detection & Vapi MCP Integration Setup")
    print("=" * 80)
    
    # Check current configuration
    is_configured = check_environment()
    
    # Show setup instructions
    show_setup_instructions()
    
    # Show Vapi assistant guide
    create_vapi_assistants_guide()
    
    print("\n" + "=" * 80)
    if is_configured:
        print("✅ Setup complete! Your emergency system is ready.")
        print("   Run 'python test_emergency_system.py' to test it.")
    else:
        print("❌ Setup incomplete. Please configure the required environment variables.")
        print("   See instructions above.")


if __name__ == "__main__":
    main() 