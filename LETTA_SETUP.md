# Letta Shift Handover Integration

This guide explains how to set up and use the Letta AI agent for intelligent shift handovers in your ATC system.

## What is Letta?

Letta is an AI agent framework that provides persistent memory and stateful conversations. In this ATC system, it tracks events throughout a shift and provides intelligent summaries for controller handovers.

## Features

- **Event Memory**: Automatically loads and remembers today's ATC communications
- **Pattern Analysis**: Identifies trends and recurring issues across shifts  
- **Intelligent Summaries**: Generates comprehensive handover briefings
- **Manual Notes**: Add custom notes for specific situations
- **Persistent Context**: Maintains awareness across multiple shifts

## Setup

### 1. Install Letta

```bash
cd be
pip install letta>=0.3.0
```

### 2. Get Letta API Key

1. Sign up at [letta.com](https://letta.com)
2. Get your API key from the dashboard
3. Add it to your backend environment:

```bash
# In be/.env
LETTA_API_KEY=your_letta_api_key_here
```

### 3. Start the Backend

```bash
cd be
python server.py
```

### 4. Initialize in Frontend

1. Go to the ATC Dashboard
2. Click the "Shift" tab in the right panel
3. Enter your Letta API key to initialize the agent

## Usage

### Loading Today's Events

1. Click "Load Today's Events" to import all ATC communications from today
2. The agent will process and remember all relevant details
3. View a preview of loaded events in the interface

### Adding Manual Notes

1. Select a category (General, Critical, Weather, Equipment, Traffic)
2. Enter your note in the text field
3. Click "Add Note" to store it in agent memory

Example notes:
- "Runway 28L construction affecting taxi routes"
- "Heavy winds causing approach delays"
- "Equipment failure on ground frequency 121.9"

### Generating Shift Summary

1. Click "Generate Summary" after loading events and adding notes
2. The agent will create a comprehensive handover report including:
   - **Traffic Status**: Current volume and patterns
   - **Active Aircraft**: Flights requiring attention
   - **Critical Issues**: Problems or ongoing situations
   - **Watch Items**: Things to monitor
   - **Communication Notes**: Frequency issues, unusual comms
   - **Recommendations**: Priorities for next controller

### Pattern Analysis

The agent continuously analyzes patterns across shifts:
- Recurring problems or issues
- Traffic volume trends
- Common aircraft types
- Frequent communication patterns

## API Endpoints

### Initialize Agent
```http
POST /api/v1/letta/init
{
  "api_key": "your_letta_api_key"
}
```

### Load Events
```http
POST /api/v1/letta/load-events
```

### Add Manual Note  
```http
POST /api/v1/letta/add-note
{
  "note": "Your note text",
  "category": "critical"
}
```

### Generate Summary
```http
GET /api/v1/letta/shift-summary?shift_type=handover
```

### Get Patterns
```http
GET /api/v1/letta/patterns
```

### Check Status
```http
GET /api/v1/letta/status
```

## Example Shift Summary

```
**Current Traffic Status**: Moderate traffic volume with 12 active aircraft in the pattern. Peak departures occurring on Runway 28L.

**Active Aircraft**: 
- American 3082: Taxi clearance pending, holding at Alpha 1
- Southwest 943: Departure frequency contact required
- United 1687: Pattern work in progress

**Critical Issues**: None currently active

**Watch Items**:
- Monitor Alpha 1 taxiway for congestion
- Weather update due in 15 minutes
- Heavy departure queue building

**Communication Notes**: All frequencies clear, no interference reported

**Recommendations**: 
1. Coordinate with Ground for Alpha 1 traffic flow
2. Prepare for weather briefing update
3. Monitor departure queue timing
```

## Troubleshooting

### Agent Not Initialized
- Check your Letta API key is correct
- Ensure backend server is running
- Check backend logs for errors

### No Events Loading
- Verify messages.json file exists with today's data
- Check file permissions
- Ensure ATC audio processing is active

### Summary Generation Fails
- Ensure events are loaded first
- Check API key permissions
- Verify Letta service is accessible

### Memory Issues
- Agent memory resets if service restarts
- Re-load events after service interruption
- Manual notes may need to be re-added

## Integration with Existing Workflow

The Letta integration seamlessly works with your existing ATC system:

1. **Automatic Event Capture**: All communications are automatically stored in messages.json
2. **Real-time Processing**: Events are processed as they happen
3. **On-Demand Summaries**: Generate summaries at shift change times
4. **Persistent Memory**: Agent remembers patterns across multiple sessions

## Security Notes

- API keys are handled securely and not stored permanently
- All data stays within your local system
- No sensitive ATC data is sent to external services beyond Letta's memory system
- Consider using environment variables for production deployments

## Support

For issues with:
- **Letta Service**: Contact Letta support
- **Integration Code**: Check the repository issues
- **ATC System**: Follow existing support channels 