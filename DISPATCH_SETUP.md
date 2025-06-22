# 🚨 Emergency Dispatch System Setup

## Overview

The Emergency Dispatch System automatically detects emergencies from ATC communications and initiates voice calls via VAPI to appropriate emergency services.

## Flow

```
ATC Radio → Emergency Detection → Dashboard Alert → [DISPATCH BUTTON] → VAPI Call → Emergency Services
```

## Setup Instructions

### 1. Environment Variables

Add to your `.env` file:

```bash
# VAPI Configuration (required for real calls)
VAPI_TOKEN=your_vapi_token_here
VAPI_ASSISTANT_ID=your_emergency_assistant_id

# Development mode (uses simulation)
NODE_ENV=development
```

### 2. Configuration Files

The system uses JSON files in the `be/` directory:

**`dispatch_configs.json`** - Emergency service phone numbers
```json
{
  "emergency_services": {
    "fire_rescue": "+1-650-599-1378",
    "medical": "+1-650-821-5151", 
    "airport_ops": "+1-650-821-7014",
    "test_number": "+1-555-0123"
  },
  "default_recipient": "airport_ops"
}
```

**`emergency_protocols.json`** - Response scripts by emergency type
```json
{
  "bird_strike": {
    "priority": "high",
    "recipients": ["airport_ops", "fire_rescue"],
    "script": "Emergency alert for flight {callsign}. Bird strike reported..."
  }
}
```

### 3. Testing

Run the test script to verify setup:

```bash
cd be
python test_dispatch.py
```

## Usage

### Frontend (Dashboard)

1. **Emergency Detection**: System automatically detects emergencies from ATC messages
2. **Alert Display**: Emergency appears in red alert panel on dashboard
3. **Dispatch Action**: Click red "DISPATCH" button on critical alerts
4. **Confirmation**: Toast notification shows dispatch status and call details
5. **Queue Management**: Alert is removed from queue after successful dispatch

### API Endpoints

**`POST /api/dispatch`** - Initiate emergency dispatch
```json
{
  "alertId": "alert_12345",
  "callsign": "AAL445", 
  "emergencyType": "bird_strike",
  "description": "Bird strike on departure",
  "originalMessage": "American 445, EMERGENCY, bird strike..."
}
```

**`GET /api/dispatch`** - View dispatch history
```bash
curl http://localhost:3000/api/dispatch?limit=10
```

### Emergency Types

The system recognizes these emergency types:

- `bird_strike` → Airport Ops + Fire Rescue
- `engine_failure` → Fire Rescue + Medical + Airport Ops  
- `medical_emergency` → Medical + Airport Ops
- `fuel_emergency` → Airport Ops + Fire Rescue
- `hydraulic_failure` → Fire Rescue + Airport Ops
- `fire_emergency` → All emergency services
- `mayday_call` → All emergency services
- `general_emergency` → Airport Ops (default)

## VAPI Integration

### Call Script Generation

The system automatically generates contextual call scripts:

```
"This is an automated emergency dispatch from San Francisco International Airport Air Traffic Control. 

Emergency alert for flight AAL445. Bird strike reported on departure. Aircraft returning to field with 180 souls on board. Requesting immediate runway preparation and emergency vehicles standing by. 

Original ATC communication: 'American 445, EMERGENCY, bird strike on departure, returning to field, 180 souls on board'"
```

### Call Flow

1. **Initiate**: VAPI places call to emergency service
2. **Script Delivery**: AI assistant reads emergency details
3. **Tracking**: Call status tracked in `dispatch_records.json`
4. **Completion**: System logs call duration and outcome

### Development vs Production

**Development Mode** (no VAPI_TOKEN):
- Simulates calls with console output
- Creates mock call IDs
- Tests full dispatch workflow

**Production Mode** (with VAPI_TOKEN):
- Makes real calls via VAPI
- Tracks actual call status
- Logs call recordings and metrics

## File Structure

```
be/
├── src/vapi_service.py          # VAPI integration service
├── dispatch_configs.json        # Emergency service contacts  
├── emergency_protocols.json     # Response scripts
├── dispatch_records.json        # Call history
└── test_dispatch.py            # Test script

fe/src/app/api/
├── dispatch/route.ts           # Dispatch API endpoint
└── emergencies/route.ts        # Emergency management

fe/src/components/dashboard/
└── AlertsAndTasks.tsx          # Emergency alerts UI
```

## Monitoring

### Dispatch Records

View recent dispatches:
```bash
cat be/dispatch_records.json | jq '.[-5:]'
```

### Call Status

- `pending` - Dispatch initiated
- `calling` - VAPI call in progress  
- `completed` - Call finished successfully
- `failed` - Call failed or error

### Logs

Check console output for:
- `🚨 EMERGENCY DISPATCH INITIATED`
- `📞 VAPI call initiated successfully`
- `❌ VAPI call failed`

## Customization

### Adding Emergency Types

1. Add new type to `emergency_protocols.json`:
```json
"custom_emergency": {
  "priority": "critical",
  "recipients": ["custom_service"],
  "script": "Custom emergency script for {callsign}..."
}
```

2. Add service to `dispatch_configs.json`:
```json
"emergency_services": {
  "custom_service": "+1-555-0123"
}
```

### Updating Call Scripts

Edit the `script` field in `emergency_protocols.json`. Available variables:
- `{callsign}` - Aircraft callsign
- `{description}` - Emergency description  
- `{souls}` - Number of souls on board (extracted from ATC message)
- `{timestamp}` - Current UTC time

## Troubleshooting

### Common Issues

**"VAPI call failed"**
- Check VAPI_TOKEN is valid
- Verify VAPI_ASSISTANT_ID exists
- Check phone number format (+1-xxx-xxx-xxxx)

**"Missing required fields"**
- Ensure emergency has callsign and emergency_type
- Check alert data structure matches expected format

**"Dispatch records not saving"**
- Verify write permissions to `be/dispatch_records.json`
- Check disk space

### Debug Mode

Enable verbose logging:
```bash
export DEBUG=1
npm run dev
```

## Security

- Phone numbers stored in config files (not in code)
- VAPI tokens in environment variables only
- Call recordings handled by VAPI (not stored locally)
- Dispatch records contain no sensitive data

## Next Steps

1. **Real VAPI Setup**: Get VAPI token and configure assistant
2. **Phone Number Verification**: Coordinate with emergency services
3. **Testing Protocol**: Test with non-emergency numbers first
4. **Integration**: Connect with existing airport emergency systems
5. **Monitoring**: Set up alerts for failed dispatches

---

**⚠️ Important**: Always test with non-emergency numbers before deploying to production! 