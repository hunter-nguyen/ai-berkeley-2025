#!/usr/bin/env python3
"""
Test script for Emergency Detection Agent
Processes existing messages.json and creates emergencies.json
"""

import os
import sys
import logging
from pathlib import Path

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.agents.emergency_agent import EmergencyDetectionAgent

def main():
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    print("🚨 EMERGENCY DETECTION AGENT TEST")
    print("=" * 50)
    
    # Check if messages.json exists
    messages_file = "messages.json"
    if not os.path.exists(messages_file):
        print(f"❌ {messages_file} not found!")
        return
        
    print(f"📁 Reading from: {messages_file}")
    print(f"📁 Writing to: emergencies.json")
    print("")
    
    # Create emergency detection agent
    agent = EmergencyDetectionAgent(
        messages_file=messages_file,
        emergencies_file="emergencies.json"
    )
    
    # Process messages for emergencies
    print("🔍 Analyzing messages for emergencies/alerts/warnings...")
    new_count = agent.process_new_messages()
    
    print(f"\n✅ Analysis complete!")
    print(f"🚨 Found {new_count} new emergencies/alerts/warnings")
    
    # Show active emergencies
    active_emergencies = agent.get_active_emergencies()
    
    if active_emergencies:
        print(f"\n📋 ACTIVE EMERGENCIES ({len(active_emergencies)}):")
        print("-" * 50)
        
        for i, emergency in enumerate(active_emergencies, 1):
            print(f"{i}. [{emergency.get('severity')}] {emergency.get('category')}")
            print(f"   🛩️  {emergency.get('callsign')} - {emergency.get('emergency_type')}")
            print(f"   📝 {emergency.get('description')}")
            print(f"   🕐 {emergency.get('source_timestamp')}")
            print(f"   🎯 Confidence: {emergency.get('confidence', 0):.2f}")
            print("")
    else:
        print(f"\n✅ No active emergencies found")
        
    print(f"📄 Check emergencies.json for full details")
    print("=" * 50)

if __name__ == "__main__":
    main() 