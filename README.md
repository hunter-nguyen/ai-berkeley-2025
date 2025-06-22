# 🛩️ MayDay - ATC Intelligence Platform

**Real-time Air Traffic Control monitoring with AI-powered transcription, analysis, and emergency detection**

[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-15+-black.svg)](https://nextjs.org)
[![Fetch.ai](https://img.shields.io/badge/Fetch.ai-Agents-purple.svg)](https://fetch.ai)

## 🚀 Quick Start

### Prerequisites
# Required system dependencies
sudo apt-get install ffmpeg  # Linux
brew install ffmpeg          # macOS

## 🏗️ Architecture

**Multi-Agent System** (Powered by Fetch.ai)
- **Transcriber Agent** - Converts live ATC audio to text using ATC-optimized Whisper
- **ATC Parser Agent** - Extracts callsigns, instructions, and aviation data
- **Emergency Agent** - Detects anomalies, mayday calls, and safety events  
- **VAPI Voice Agent** - Handles emergency dispatch calls when approved by controllers
- **Letta Memory Agent** - Maintains context and generates shift handover summaries

**Data Sources**
- LiveATC.net - Real-time ATC audio streams
- FlightRadar24 - Live aircraft positions and flight data

**Frontend**
- Next.js dashboard with real-time WebSocket updates
- Interactive radar map with aircraft tracking
- Emergency alerts and communication logs

## 🔧 Configuration

Create `.env` file in root directory:
```bash
# Core AI Services
GROQ_API_KEY=your_groq_api_key
VAPI_API_KEY=your_vapi_api_key  
LETTA_API_KEY=your_letta_api_key

# Audio Source (default: KSFO Tower)
LIVEATC_URL=https://d.liveatc.net/ksfo_twr

# Optional: Live Flight Data
FLIGHTRADAR24_API_KEY=your_fr24_key

# Ports
PORT=3000
WEBSOCKET_PORT=8765
```

## 🎯 Key Features

- **Real-time ATC Transcription** - Live audio processing with aviation-specific language models
- **Emergency Detection** - Automated detection of mayday calls and safety events
- **Multi-Agent Intelligence** - Coordinated AI agents for comprehensive ATC analysis
- **Controller Dashboard** - Real-time visualization of air traffic and communications
- **Emergency Dispatch** - AI-assisted emergency response coordination via VAPI
- **Context Memory** - Letta-powered session memory and shift handover generation

## 🛠️ Development

```bash
# Install dependencies
npm run install:all

# Run individual services
npm run dev:frontend      # Next.js (port 3000)
npm run dev:backend       # Python agents (port 8765)

# Build for production
npm run build
npm run start
```

## 📡 API Endpoints

- **Frontend**: `http://localhost:3000` - Main dashboard
- **WebSocket**: `ws://localhost:8765` - Real-time audio/data stream
- **Health**: `http://localhost:8765/health` - System status

## 🔐 Agent Architecture

The system uses **Fetch.ai uAgents** for distributed intelligence:

1. **Audio Processing Flow**: LiveATC → Transcriber Agent → ATC Parser Agent
2. **Intelligence Layer**: Emergency Agent + Letta Memory Agent  
3. **Action Layer**: VAPI Voice Agent (controller-approved emergency dispatch)
4. **Frontend Updates**: Real-time WebSocket broadcasting to dashboard