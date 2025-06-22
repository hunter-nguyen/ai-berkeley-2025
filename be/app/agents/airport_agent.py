import asyncio
import os
import httpx
import json
import uuid
from datetime import datetime
from uagents import Agent, Context
from uagents.setup import fund_agent_if_low

# --- Agent Configuration ---
AIRPORT_AGENT_SEED = os.environ.get("AIRPORT_AGENT_SEED", "airport_agent_seed_phrase_!@#$%")
AIRPORT_ID = "KSFO"
FETCH_INTERVAL_SECONDS = 30 * 60  # 30 minutes
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
MESSAGES_FILE = os.path.join(PROJECT_ROOT, "airport.json")
MAX_MESSAGES = 100

# --- Create Agent ---
agent = Agent(
    name="airport_agent",
    port=8500,
    seed=AIRPORT_AGENT_SEED,
    endpoint=["http://127.0.0.1:8500/submit"],
)

fund_agent_if_low(agent.wallet.address())

def load_messages() -> list:
    """Load messages from the JSON file."""
    if not os.path.exists(MESSAGES_FILE):
        return []
    try:
        with open(MESSAGES_FILE, 'r') as f:
            content = f.read()
            if not content:
                return []
            return json.loads(content)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error or empty file when loading messages: {e}")
        return []

def save_messages(messages: list):
    """Save messages to the JSON file."""
    try:
        with open(MESSAGES_FILE, 'w') as f:
            json.dump(messages, f, indent=2)
    except IOError as e:
        print(f"Error saving messages: {e}")

@agent.on_interval(period=FETCH_INTERVAL_SECONDS)
async def fetch_airport_data(ctx: Context):
    """Periodically fetch airport data for a specific airport from aviationweather.gov."""
    ctx.logger.info(f"Fetching airport data for {AIRPORT_ID}...")
    
    api_url = f"https://aviationweather.gov/api/data/metar?ids={AIRPORT_ID}&format=json"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url)
            response.raise_for_status()
        
        data = response.json()
        if not data:
            ctx.logger.warning(f"No airport data returned for {AIRPORT_ID}")
            return
            
        airport_data = data[0]
        
        # Construct a summary message from the available data
        temp = airport_data.get('temp', 'N/A')
        wind = f"{airport_data.get('wdir', 'N/A')}° at {airport_data.get('wspd', 'N/A')}KT"
        vis = airport_data.get('visib', 'N/A')
        clouds = ", ".join([c.get('cover', '') for c in airport_data.get('clouds', [])])
        summary = f"Temp: {temp}°C, Wind: {wind}, Vis: {vis}SM, Clouds: {clouds}"
        
        # Simple urgency check: not clear skies
        is_urgent = any(c.get('cover') not in ['CLR', 'SKC'] for c in airport_data.get('clouds', []))

        new_message = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            "callsign": f"AIRPORT-{AIRPORT_ID}",
            "message": summary,
            "isUrgent": is_urgent,
            "type": "airport_update",
            "rawTranscript": airport_data.get('rawOb', ''),
            "airport_data": airport_data,
        }
        
        messages = load_messages()
        messages.insert(0, new_message)
        save_messages(messages[:MAX_MESSAGES])
        
        ctx.logger.info(f"Successfully fetched and saved airport data for {AIRPORT_ID}.")

    except httpx.HTTPStatusError as e:
        ctx.logger.error(f"HTTP error fetching airport data: {e.response.status_code} - {e.response.text}")
    except Exception as e:
        ctx.logger.error(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    agent.run() 