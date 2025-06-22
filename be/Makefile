.PHONY: help install dev run clean test format lint docker-build docker-run setup

# Default target
help:
	@echo "🎧 ATC Audio Agent - Available commands:"
	@echo "  setup       - Initial project setup"
	@echo "  install     - Install dependencies"
	@echo "  dev         - Install development dependencies"
	@echo "  run         - Start the server"
	@echo "  test        - Run tests"
	@echo "  format      - Format code"
	@echo "  lint        - Run linting"
	@echo "  clean       - Clean up files"
	@echo "  docker-build - Build Docker image"
	@echo "  docker-run   - Run with Docker"

# Initial setup
setup:
	@echo "🚀 Setting up ATC Audio Agent..."
	python3 -m venv venv
	./venv/bin/pip install --upgrade pip
	./venv/bin/pip install -r requirements.txt
	@if [ ! -f .env ]; then cp .env.example .env; echo "📝 Created .env file - please edit with your API key"; fi
	@echo "✅ Setup complete! Edit .env file and run 'make run'"

# Install dependencies
install:
	pip install -r requirements.txt

# Install development dependencies
dev:
	pip install -r requirements.txt
	pip install pytest black isort mypy

# Run the server
run:
	@echo "🎧 Starting ATC Audio Agent Server..."
	python server.py

# Run tests
test:
	pytest tests/ -v

# Format code
format:
	black .
	isort .

# Lint code
lint:
	black --check .
	isort --check-only .
	mypy app/

# Clean up
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	rm -rf build/ dist/ .pytest_cache/

# Docker commands
docker-build:
	docker build -t atc-audio-agent .

docker-run:
	docker run -p 8000:8000 -p 8765:8765 --env-file .env atc-audio-agent

# Development server with reload
dev-run:
	RELOAD=true python server.py 