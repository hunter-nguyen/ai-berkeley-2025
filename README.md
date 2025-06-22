# 🎯 AI Berkeley 2025 - ATC Audio Agent

**Real-time ATC audio transcription and analysis system powered by AI**

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://python.org)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-15+-black.svg)](https://nextjs.org)
[![Groq](https://img.shields.io/badge/Groq-API-orange.svg)](https://groq.com)

## 🚀 Quick Start

```bash
# 1. Clone and enter directory
git clone <repo-url>
cd ai-berkeley-2025

# 2. One-command setup
python setup.py

# 3. Add your API keys to .env file
cp .env.example .env
# Edit .env with your actual API keys

# 4. Run the full stack
npm run dev
```

## 🏗 Project Structure

```
ai-berkeley-2025/
├── 📁 be/                 # Python Backend (FastAPI + WebSocket)
│   ├── src/               # Source code
│   ├── scripts/           # Utility scripts  
│   ├── app/               # FastAPI application
│   └── requirements.txt   # Python dependencies
├── 📁 fe/                 # React Frontend (Next.js)
│   ├── src/               # Source code
│   ├── public/            # Static assets
│   └── package.json       # Node.js dependencies
├── .env                   # Environment variables (YOUR API KEYS)
├── .env.example           # Template for environment variables
├── .gitignore             # Unified ignore patterns
├── package.json           # Root package.json with scripts
├── setup.py               # One-command setup script
└── README.md              # This file
```

## 🔑 Environment Variables

All configuration is in **one place**: `.env` file at the root.

```bash
# Required API Keys
GROQ_API_KEY=your_groq_api_key_here

# Optional API Keys (fallback data available)
NEXT_PUBLIC_FLIGHTRADAR24_API_KEY=your_flightradar24_api_key_here
NEXT_PUBLIC_OPENAIP_KEY=your_openaip_key_here

# Audio Source
LIVEATC_URL=https://d.liveatc.net/ksfo_twr

# Ports
WEBSOCKET_PORT=8765
PORT=3000
```

## 🛠 Development Scripts

```bash
# Setup everything
npm run setup              # Python setup.py

# Development (runs both frontend + backend)
npm run dev                # Runs both in parallel

# Individual services
npm run dev:frontend       # Next.js dev server
npm run dev:backend        # Python ATC agent

# Building & Production
npm run build              # Build frontend
npm run start              # Start production server

# Utilities
npm run clean              # Clean all build artifacts
npm run install:all        # Install all dependencies
```

## 🎧 Features

### 🔊 **Real-time Audio Processing**
- Live ATC audio stream processing
- WebSocket-based real-time transcription
- Groq Whisper integration for speech-to-text

### ✈️ **Aviation Intelligence**
- KSFO-specific ATC language understanding
- 50+ airline callsign recognition
- Runway, taxiway, and gate extraction
- Flight instruction categorization

### 🗺 **Live Flight Tracking**
- Real-time aircraft positions
- FlightRadar24 API integration
- Interactive radar map visualization
- Aircraft trail tracking

### 📊 **Modern UI**
- Real-time dashboard
- Audio waveform visualization
- Flight data tables
- Responsive design

## 🏃‍♂️ Running the Project

### Option 1: Full Stack (Recommended)
```bash
npm run dev
```
This runs both frontend (port 3000) and backend (port 8765) simultaneously.

### Option 2: Individual Services
```bash
# Terminal 1: Backend
cd be
source venv/bin/activate
python scripts/run_atc_agent.py

# Terminal 2: Frontend  
cd fe
npm run dev
```

## 🔧 Configuration

### Audio Source
Change the ATC audio source in `.env`:
```bash
# San Francisco Tower (default)
LIVEATC_URL=https://d.liveatc.net/ksfo_twr

# Los Angeles Tower
LIVEATC_URL=https://d.liveatc.net/klax_twr

# New York Approach
LIVEATC_URL=https://d.liveatc.net/kjfk_app
```

### API Keys
1. **Groq API** (Required): [Get free key](https://console.groq.com)
2. **FlightRadar24** (Optional): [Get API access](https://flightradar24.com/premium)
3. **OpenAIP** (Optional): [Get free key](https://openaip.net)

## 🐛 Troubleshooting

### Python Issues
```bash
# Recreate virtual environment
cd be
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Node.js Issues
```bash
# Clear cache and reinstall
cd fe
rm -rf node_modules package-lock.json
npm install
```

### Audio Issues
- Check if LIVEATC_URL is accessible
- Verify GROQ_API_KEY is valid
- Check WEBSOCKET_PORT (8765) is available

## 📡 API Endpoints

### Backend (Port 8765)
- `ws://localhost:8765` - WebSocket for real-time audio
- `http://localhost:8765/health` - Health check
- `http://localhost:8765/stats` - Processing statistics

### Frontend (Port 3000)
- `http://localhost:3000` - Main dashboard
- `http://localhost:3000/api/health` - Frontend health

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes
4. Test: `npm run dev`
5. Commit: `git commit -m "Add feature"`
6. Push: `git push origin feature-name`
7. Create Pull Request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **Groq** for lightning-fast AI inference
- **LiveATC** for real-time ATC audio streams
- **FlightRadar24** for live flight data
- **KSFO** for being an awesome airport to monitor

---

**Built with ❤️ for AI Berkeley 2025** 