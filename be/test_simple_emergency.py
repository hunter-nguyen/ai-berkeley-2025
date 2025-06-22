#!/usr/bin/env python3
"""
Test script for Simple Emergency Detection Agent
"""

import os
import sys
import logging

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.agents.emergency_agent_simple import SimpleEmergencyDetectionAgent

def main():
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    print("🚨 SIMPLE EMERGENCY DETECTION TEST")
    print("=" * 50)
    
    # Create emergency detection agent
    agent = SimpleEmergencyDetectionAgent(
        messages_file="messages.json",
        emergencies_file="emergencies.json"
    )
    
    # Process messages for emergencies
    print("🔍 Analyzing messages with rule-based detection...")
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
            print(f"   🔧 Actions: {', '.join(emergency.get('recommended_actions', []))}")
            print("")
    else:
        print(f"\n✅ No active emergencies found")
        
    print(f"📄 Check emergencies.json for full details")
    print("=" * 50)

if __name__ == "__main__":
    main() 