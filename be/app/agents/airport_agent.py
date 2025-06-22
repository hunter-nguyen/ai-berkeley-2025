import asyncio
import os
import httpx
import json
import uuid
from datetime import datetime
from uagents import Agent, Context, Protocol, Model
from uagents.setup import fund_agent_if_low

# --- Message Schemas ---
class AirportRequest(Model):
    airport_id: str

class AirportResponse(Model):
    id: str
    timestamp: str
    callsign: str
    message: str
    isUrgent: bool
    type: str
    rawTranscript: str
    airport_data: dict

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
    mailbox=True
)

fund_agent_if_low(agent.wallet.address())

# --- Protocol ---
airport_protocol = Protocol("airport_data")

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

async def fetch_airport_data_for_id(airport_id: str, ctx: Context) -> dict:
    """Fetch airport data for a specific airport ID."""
    ctx.logger.info(f"Fetching airport data for {airport_id}...")
    
    api_url = f"https://aviationweather.gov/api/data/metar?ids={airport_id}&format=json"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url)
            response.raise_for_status()
        
        data = response.json()
        if not data:
            ctx.logger.warning(f"No airport data returned for {airport_id}")
            return None
            
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
            "callsign": f"AIRPORT-{airport_id}",
            "message": summary,
            "isUrgent": is_urgent,
            "type": "airport_update",
            "rawTranscript": airport_data.get('rawOb', ''),
            "airport_data": airport_data,
        }
        
        # Save to JSON
        messages = load_messages()
        messages.insert(0, new_message)
        save_messages(messages[:MAX_MESSAGES])
        
        ctx.logger.info(f"Successfully fetched and saved airport data for {airport_id}.")
        return new_message

    except httpx.HTTPStatusError as e:
        ctx.logger.error(f"HTTP error fetching airport data: {e.response.status_code} - {e.response.text}")
        return None
    except Exception as e:
        ctx.logger.error(f"An unexpected error occurred: {e}")
        return None

@agent.on_interval(period=FETCH_INTERVAL_SECONDS)
async def fetch_airport_data(ctx: Context):
    """Periodically fetch airport data for KSFO."""
    await fetch_airport_data_for_id(AIRPORT_ID, ctx)

@airport_protocol.on_message(model=AirportRequest, replies={AirportResponse})
async def handle_airport_request(ctx: Context, sender: str, msg: AirportRequest):
    """Handle incoming airport data requests."""
    result = await fetch_airport_data_for_id(msg.airport_id, ctx)
    
    if result:
        response = AirportResponse(
            id=result["id"],
            timestamp=result["timestamp"],
            callsign=result["callsign"],
            message=result["message"],
            isUrgent=result["isUrgent"],
            type=result["type"],
            rawTranscript=result["rawTranscript"],
            airport_data=result["airport_data"]
        )
        await ctx.send(sender, response)
    else:
        # Send error response
        error_response = AirportResponse(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            callsign=f"AIRPORT-{msg.airport_id}",
            message="Failed to fetch airport data",
            isUrgent=False,
            type="error",
            rawTranscript="",
            airport_data={}
        )
        await ctx.send(sender, error_response)

agent.include(airport_protocol)

if __name__ == "__main__":
    agent.run() 