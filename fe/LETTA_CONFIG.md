# Letta Chat Widget Configuration

The Letta chat widget now reads all configuration from environment variables. Create a `.env.local` file in the `fe/` directory with the following variables:

## Required Configuration

```bash
# Letta Configuration
NEXT_PUBLIC_LETTA_API_KEY=your_letta_api_key_here
NEXT_PUBLIC_LETTA_AGENT_ID=your_agent_id_here
NEXT_PUBLIC_LETTA_BASE_URL=https://api.letta.com

# Shift Data Configuration
NEXT_PUBLIC_SHIFT_TOTAL_MESSAGES=156
NEXT_PUBLIC_SHIFT_URGENT_MESSAGES=12
NEXT_PUBLIC_SHIFT_ACTIVE_AIRCRAFT=UAL123,DAL456,SWA789,AAL321,JBU654
NEXT_PUBLIC_SHIFT_RUNWAYS=28L,28R,01L,01R

# Recent Events (JSON format)
NEXT_PUBLIC_SHIFT_RECENT_EVENTS=[{"timestamp":"2024-01-15T14:30:00Z","callsign":"UAL123","message":"Request immediate descent due to turbulence","isUrgent":true},{"timestamp":"2024-01-15T14:25:00Z","callsign":"DAL456","message":"Cleared for approach runway 28L","isUrgent":false},{"timestamp":"2024-01-15T14:20:00Z","callsign":"SWA789","message":"Go around runway not clear","isUrgent":true}]
```

## How to Get Letta Credentials

1. Visit [app.letta.com](https://app.letta.com)
2. Create an account or sign in
3. Get your API key from the dashboard
4. Create a new agent and copy the agent ID

## Updating Data

To update shift data, simply modify the environment variables and restart your development server. The widget will automatically load the new data.

## Features

- ✅ **No Manual Input**: Everything is pre-configured via environment variables
- ✅ **Live Data Display**: Shows shift statistics in a dashboard format
- ✅ **Recent Events**: Displays recent events from JSON configuration
- ✅ **Chat Interface**: Direct communication with your Letta agent
- ✅ **Auto-initialization**: Automatically sends shift summary to agent on load

## Example Recent Events JSON

```json
[
  {
    "timestamp": "2024-01-15T14:30:00Z",
    "callsign": "UAL123", 
    "message": "Request immediate descent due to turbulence",
    "isUrgent": true
  },
  {
    "timestamp": "2024-01-15T14:25:00Z",
    "callsign": "DAL456",
    "message": "Cleared for approach runway 28L", 
    "isUrgent": false
  }
]
```

Make sure to escape the JSON properly when putting it in the environment variable. 