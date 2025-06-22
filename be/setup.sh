#!/bin/bash
# ATC Audio Agent Setup Script

echo "🚀 Setting up ATC Audio Agent..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔌 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install requirements
echo "📥 Installing Python dependencies..."
pip install -r requirements.txt

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg not found. Please install it:"
    echo "   macOS: brew install ffmpeg"
    echo "   Ubuntu: sudo apt-get install ffmpeg"
    echo "   Windows: Download from https://ffmpeg.org/"
else
    echo "✅ FFmpeg found"
fi

# Check .env file
if [ -f ".env" ]; then
    echo "✅ .env file found"
else
    echo "⚠️  .env file not found. Creating template..."
    echo "GROQ_API_KEY=your_groq_api_key_here" > .env
    echo "LIVEATC_URL=https://d.liveatc.net/ksfo_twr" >> .env
    echo "WEBSOCKET_PORT=8765" >> .env
    echo "📝 Please edit .env file and add your Groq API key"
fi

echo "✅ Setup complete!"
echo ""
echo "🎧 To run the ATC Audio Agent:"
echo "   source venv/bin/activate"
echo "   python start.py"
echo ""
echo "🌐 WebSocket will be available at: ws://localhost:8765" 