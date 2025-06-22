# 🎧 ATC Audio Agent

Real-time Air Traffic Control audio processing system with AI-powered transcription and language understanding.

## ✨ Features

- 🎵 **Live Audio Streaming** - Stream ATC communications from LiveATC.net
- 🎤 **Real-time Transcription** - Groq Whisper for accurate speech-to-text
- 🤖 **ATC Language Processing** - AI agent that understands aviation terminology
- 📡 **WebSocket Broadcasting** - Real-time data streaming to frontend
- 🛩️ **Aviation Intelligence** - Extract callsigns, instructions, runways

## 🚀 Quick Start

### 1. Setup
```bash
# One-command setup
make setup

# Or manually:
python3 -m venv venv
source venv/bin/activate
pip install -e .
```

### 2. Configure Environment
Edit the `.env` file with your API key:
```bash
# .env file
GROQ_API_KEY=your_groq_api_key_here
LIVEATC_URL=https://d.liveatc.net/ksfo_twr
WEBSOCKET_PORT=8765
```

### 3. Run the Agent
```bash
# Super simple with Make
make run

# Or manually:
source venv/bin/activate
python scripts/start.py
```

## 🎯 Configuration

Edit the `.env` file to customize:

```bash
# .env file
GROQ_API_KEY=your_groq_api_key_here
LIVEATC_URL=https://d.liveatc.net/ksfo_twr  # Default: KSFO Tower
WEBSOCKET_PORT=8765                          # Default: 8765
```

### Available Airports
- `https://d.liveatc.net/ksfo_twr` - San Francisco Tower
- `https://d.liveatc.net/kewr_twr` - Newark Tower  
- `https://d.liveatc.net/klax_twr` - Los Angeles Tower
- `https://d.liveatc.net/kjfk_twr` - JFK Tower

## 📁 Project Structure

```
atc-audio-agent/
├── src/atc_audio_agent/          # Main package
│   ├── core/                     # Core audio processing
│   │   ├── audio_processor.py    # Audio streaming & transcription
│   │   ├── atc_agent.py         # uAgent implementation
│   │   └── transcribe_groq.py   # Groq utilities
│   ├── agents/                   # AI agents
│   │   └── atc_language_agent.py # ATC language understanding
│   └── utils/                    # Utility functions
├── scripts/                      # Entry points
│   ├── start.py                 # Simple launcher
│   ├── run_atc_agent.py        # Main runner
│   └── setup.sh                # Setup script
├── config/                      # Configuration files
├── pyproject.toml              # Modern Python project config
├── Makefile                    # Easy commands
└── README.md                   # This file
```

## 🌐 WebSocket API

Connect to `ws://localhost:8765` to receive real-time data:

```json
{
  "type": "atc_analysis",
  "chunk": 1,
  "timestamp": "2024-01-15T10:30:00Z",
  "raw_transcript": "United 297 contact departure",
  "atc_analysis": {
    "callsigns": [
      {"callsign": "United 297", "icao": "UAL297"}
    ],
    "instructions": [
      {"type": "contact_departure"}
    ],
    "runways": [],
    "summary": "Aircraft instructed to contact departure frequency"
  }
}
```

## 🛠️ Dependencies

### System Requirements
- Python 3.9+
- FFmpeg (for audio processing)
- PyAudio (for speaker output)

### Python Packages
- `uagents` - Agent framework
- `groq` - AI transcription
- `websockets` - Real-time communication
- `pyaudio` - Audio I/O

### Install FFmpeg
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows
# Download from https://ffmpeg.org/
```

## 🎮 Usage Examples

### Basic Usage
```bash
# Default KSFO Tower
make run
```

### Different Airport
Edit `.env` file:
```bash
LIVEATC_URL=https://d.liveatc.net/kjfk_twr
```
Then run:
```bash
make run
```

### Custom Port
Edit `.env` file:
```bash
WEBSOCKET_PORT=9000
```
Then run:
```bash
make run
```

## 📊 What You'll See

```
🎧 ATC Audio System Starting...
🚀 Starting ATC Audio System...
   - Audio Source: https://d.liveatc.net/ksfo_twr
   - WebSocket Port: 8765
   - Real-time audio streaming
   - Groq Whisper transcription
   - ATC language processing
   - WebSocket broadcasting
🌐 Starting WebSocket server on port 8765
🎵 Starting enhanced ATC audio stream
🔊 Audio streaming to speakers started
📝 Transcribing and analyzing 5-second chunks

🎯 Processing chunk #1 (160000 bytes)
📡 Transcribing with Groq...
✅ Raw transcript: 'United 297 runway 28L cleared for takeoff'
🤖 Analyzing with ATC Language Agent...
🛩️  Callsigns: ['United 297']
📋 Instructions: ['takeoff_clearance']
🛬 Runways: ['28L']
📝 Summary: Aircraft cleared for takeoff on runway 28L
📡 Broadcasted to 0 clients
```

## 🔧 Troubleshooting

### Audio Issues
- Ensure PyAudio is installed: `pip install pyaudio`
- Check system audio permissions
- Verify FFmpeg installation: `ffmpeg -version`

### API Issues  
- Verify Groq API key is set and valid
- Check internet connection
- Monitor API rate limits

### Port Conflicts
```bash
# Kill processes using port 8765
lsof -ti:8765 | xargs kill -9
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

**Ready to monitor the skies!** 🛩️✈️🎧 