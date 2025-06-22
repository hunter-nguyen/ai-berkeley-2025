#!/bin/bash
# VAPI Environment Setup Script

echo "🚨 Setting up VAPI Emergency System Environment..."

# Set VAPI credentials
export VAPI_API_KEY="4e8aeec5-7c92-4ef0-b5a0-039faa29979b"
export VAPI_ASSISTANT_ID="f15ffd06-eb66-4aa1-99a2-6a9e27169c18"
export VAPI_PHONE_NUMBER_ID="f5fabf0b-e4fb-4499-8a9c-48977c75e321"

# Set emergency phone number (replace with your test number)
export EMERGENCY_PHONE_NUMBER="+15551234567"  # Valid E.164 format

# Set other required environment variables
export GROQ_API_KEY="your_groq_api_key_here"
export LIVEATC_URL="https://d.liveatc.net/ksfo_twr"

echo "✅ VAPI Environment configured!"
echo "📞 Assistant ID: $VAPI_ASSISTANT_ID"
echo "📱 Phone Number ID: $VAPI_PHONE_NUMBER_ID"
echo "🚨 Emergency Phone: $EMERGENCY_PHONE_NUMBER"
echo ""
echo "🔧 To use these settings in your current shell, run:"
echo "   source be/scripts/setup_vapi_env.sh"
echo ""
echo "📝 Don't forget to set your GROQ_API_KEY and update EMERGENCY_PHONE_NUMBER!"
echo ""
echo "🚀 Ready to test with:"
echo "   python be/scripts/emergency_caller.py" 