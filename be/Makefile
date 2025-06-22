.PHONY: help install dev-install run clean test format lint setup

# Default target
help:
	@echo "ATC Audio Agent - Available commands:"
	@echo "  setup       - Initial project setup"
	@echo "  install     - Install dependencies"
	@echo "  dev-install - Install with dev dependencies"
	@echo "  run         - Run the ATC audio agent"
	@echo "  clean       - Clean up generated files"
	@echo "  test        - Run tests"
	@echo "  format      - Format code with black and isort"
	@echo "  lint        - Run linting checks"

# Initial setup
setup:
	@echo "🚀 Setting up ATC Audio Agent..."
	python3 -m venv venv
	./venv/bin/pip install --upgrade pip
	./venv/bin/pip install -e .
	@if [ ! -f .env ]; then cp .env.example .env; echo "📝 Created .env file - please edit with your API key"; fi
	@echo "✅ Setup complete! Edit .env file and run 'make run'"

# Install dependencies
install:
	pip install -e .

# Install with dev dependencies
dev-install:
	pip install -e ".[dev]"

# Run the application
run:
	@echo "🎧 Starting ATC Audio Agent..."
	python scripts/start.py

# Clean up
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	rm -rf build/ dist/

# Run tests
test:
	pytest tests/ -v

# Format code
format:
	black src/ scripts/ tests/
	isort src/ scripts/ tests/

# Lint code
lint:
	black --check src/ scripts/ tests/
	isort --check-only src/ scripts/ tests/
	mypy src/ scripts/ 