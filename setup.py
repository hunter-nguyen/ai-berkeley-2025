#!/usr/bin/env python3
"""
🎯 AI Berkeley 2025 - ATC Audio Agent Setup
One-command setup for the entire project
"""
import os
import sys
import subprocess
from pathlib import Path

def main():
    print("🎯 AI Berkeley 2025 - ATC Audio Agent Setup")
    print("=" * 50)
    
    # Check if .env exists
    if not Path('.env').exists():
        print("📝 Creating .env file from template...")
        subprocess.run(['cp', '.env.example', '.env'])
        print("✅ .env file created!")
        print("🔑 Please edit .env file with your actual API keys")
    else:
        print("✅ .env file already exists")
    
    # Setup backend
    print("\n🐍 Setting up Python backend...")
    os.chdir('be')
    
    if not Path('venv').exists():
        print("📦 Creating Python virtual environment...")
        subprocess.run([sys.executable, '-m', 'venv', 'venv'])
    
    print("📦 Installing Python dependencies...")
    if os.name == 'nt':  # Windows
        subprocess.run(['venv\\Scripts\\pip', 'install', '-r', 'requirements.txt'])
    else:  # Unix/Linux/macOS
        subprocess.run(['venv/bin/pip', 'install', '-r', 'requirements.txt'])
    
    os.chdir('..')
    
    # Setup frontend
    print("\n⚛️ Setting up Node.js frontend...")
    os.chdir('fe')
    
    print("📦 Installing Node.js dependencies...")
    subprocess.run(['npm', 'install'])
    
    os.chdir('..')
    
    print("\n🎉 Setup complete!")
    print("\n🚀 To run the project:")
    print("   Backend:  cd be && source venv/bin/activate && python scripts/run_atc_agent.py")
    print("   Frontend: cd fe && npm run dev")

if __name__ == '__main__':
    main()
