#!/usr/bin/env python3
"""
Test the ATC Phraseology Formatter
Shows how garbled Whisper transcripts get cleaned up into proper ATC communications
"""
import asyncio
import os
from dotenv import load_dotenv
from src.atc_audio_agent.agents.atc_language_agent import ATCTranscriptProcessor

# Load environment variables
load_dotenv()

async def test_garbled_transcripts():
    """Test the formatter with intentionally garbled transcripts"""
    
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        print("❌ Please set GROQ_API_KEY in your .env file")
        return
    
    # Create the processor with the new pipeline
    processor = ATCTranscriptProcessor(groq_api_key)
    
    print("🎧 ATC PHRASEOLOGY FORMATTER TEST")
    print("Demonstrating cleanup of garbled Whisper transcripts")
    print("=" * 70)
    
    # Garbled transcripts that need serious cleanup
    garbled_transcripts = [
        "run made 23 clear land",
        "united two nine seven heavy contact ground", 
        "american twelve tree four taxi gate a twelve",
        "line up and weight run way two eight left",
        "take off cleared zero one right",
        "emirates two two five heavy contact departure one two zero point niner",
        "delta five six seven taxi via a hold short run way two eight right",
        "singapore two taxi to international terminal",
        "southwest one two tree four roger wilco",
        "lufthansa four four one contact norcal departure good day"
    ]
    
    for i, transcript in enumerate(garbled_transcripts):
        print(f"\n🎤 Test {i+1}: '{transcript}'")
        print("-" * 50)
        
        # Process through the pipeline
        transcript_data = {
            "text": transcript,
            "frequency": "KSFO_TWR", 
            "timestamp": "2024-01-01T12:00:00Z",
            "chunk": i+1,
            "engine": "groq_whisper"
        }
        
        result = await processor.process_audio_transcript(transcript_data)
        
        # Show formatter results
        if "formatting" in result:
            formatting = result["formatting"]
            formatted = formatting.get("formatted", transcript)
            changes = formatting.get("changes_made", [])
            confidence = formatting.get("confidence", 0)
            
            print(f"📝 Cleaned:    '{formatted}'")
            print(f"🎯 Confidence: {confidence:.1f}")
            if changes:
                print(f"✨ Fixes:      {', '.join(changes)}")
        
        # Show extracted data
        if "atc_analysis" in result:
            analysis = result["atc_analysis"]
            callsigns = [cs.get('callsign', 'Unknown') for cs in analysis.get('callsigns', [])]
            instructions = [inst.get('type', 'Unknown') for inst in analysis.get('instructions', [])]
            runways = analysis.get('runways', [])
            
            if callsigns:
                print(f"✈️  Callsigns:  {callsigns}")
            if instructions:
                print(f"📋 Instructions: {instructions}")
            if runways:
                print(f"🛬 Runways:    {runways}")
    
    # Show pipeline stats
    print(f"\n{'='*70}")
    print("📊 PIPELINE PERFORMANCE")
    print("=" * 70)
    
    stats = processor.get_agent_stats()
    formatter_stats = stats.get("formatter", {})
    
    print(f"🔧 Phraseology Formatter:")
    print(f"   Transcripts Processed: {formatter_stats.get('processed_transcripts', 0)}")
    print(f"   Transcripts Cleaned:   {formatter_stats.get('cleaned_transcripts', 0)}")
    print(f"   Cleanup Rate:          {formatter_stats.get('cleanup_rate', 0):.0%}")
    
    print(f"\n✅ No more 'run made 23' nonsense - everything becomes proper ATC!")

if __name__ == "__main__":
    asyncio.run(test_garbled_transcripts()) 