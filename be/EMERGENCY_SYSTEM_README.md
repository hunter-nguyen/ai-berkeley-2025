# ASI:One Emergency Detection & Vapi MCP Integration

## 🧠 Overview

This system implements **ASI:One** (Advanced Safety Intelligence), an AI-powered emergency detection system that analyzes real-time ATC communications and can automatically trigger emergency phone calls via **Vapi's Model Context Protocol (MCP)** integration.

### Key Features

- **🎯 Real-time Emergency Detection**: Analyzes ATC transcripts for emergency keywords and patterns
- **🧠 AI-Powered Assessment**: Uses Groq's LLaMA 3 70B model for contextual emergency analysis
- **📞 Automated Emergency Calling**: Triggers real-world phone calls via Vapi MCP when emergencies are detected
- **🔄 Configurable Escalation**: Different emergency levels trigger different contact protocols
- **📊 Confidence Scoring**: Provides confidence levels for emergency assessments
- **🔌 Modular Integration**: Clean MCP integration that can connect to multiple services

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Live ATC      │───▶│   ASI:One       │───▶│   Vapi MCP      │
│   Audio Stream  │    │   Emergency     │    │   Emergency     │
│                 │    │   Detection     │    │   Calling       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Groq Whisper  │    │   Groq LLaMA3   │    │   Real Phone    │
│   Transcription │    │   70B Analysis  │    │   Calls         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Emergency Levels

| Level | Threshold | Action | Recipients |
|-------|-----------|--------|------------|
| **CRITICAL** | 85%+ | Immediate 911 + Supervisor | Emergency Services + Supervisor |
| **HIGH** | 70%+ | Supervisor Alert | Supervisors |
| **MEDIUM** | 50%+ | Duty Manager Alert | Duty Manager |
| **LOW** | 30%+ | Log for Review | None |
| **NONE** | <30% | No Action | None |

## 🚀 Quick Start

### 1. Environment Setup

Create a `.env` file in the project root:

```bash
# Required
GROQ_API_KEY=your_groq_api_key_here

# Optional - for emergency calling
VAPI_TOKEN=your_vapi_token_here
VAPI_PHONE_NUMBER_ID=your_vapi_phone_number_id
VAPI_EMERGENCY_ASSISTANT_ID=your_emergency_assistant_id
VAPI_SUPERVISOR_ASSISTANT_ID=your_supervisor_assistant_id
VAPI_DUTY_MANAGER_ASSISTANT_ID=your_duty_manager_assistant_id

# Simplified configuration - single assistant for all emergencies
VAPI_ASSISTANT_ID=your_assistant_id
EMERGENCY_PHONE_NUMBER=+1234567890

# Optional - for testing
TEST_PHONE_NUMBER=your_test_phone_number
```

### 2. Install Dependencies

```bash
cd be
pip install -r requirements.txt
```

### 3. Test the System

```bash
# Test emergency detection only
python test_emergency_system.py

# Run the full ATC system with emergency detection
python -m uvicorn app.main:app --reload
```

## 🔧 Configuration

### Vapi Assistant Configuration

Create specialized Vapi assistants for different emergency types:

#### Emergency 911 Assistant
```json
{
  "name": "Emergency 911 Alert",
  "model": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "voice": {
    "provider": "azure",
    "voiceId": "andrew"
  },
  "firstMessage": "This is an automated emergency alert from the Air Traffic Control system. A critical aviation emergency has been detected requiring immediate response.",
  "systemMessage": "You are an emergency alert system. Deliver critical aviation emergency information clearly and concisely. Always start with the emergency type, aircraft callsign, and location. Keep messages under 30 seconds."
}
```

#### Supervisor Alert Assistant
```json
{
  "name": "ATC Supervisor Alert",
  "model": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "voice": {
    "provider": "azure",
    "voiceId": "sarah"
  },
  "firstMessage": "This is an automated alert from the ATC monitoring system. An urgent aviation safety situation has been detected that requires supervisor attention.",
  "systemMessage": "You are an ATC supervisor alert system. Provide clear, professional aviation safety alerts. Include aircraft callsign, emergency type, confidence level, and recommended actions."
}
```

### Emergency Contact Configuration

Configure emergency contacts in your environment or directly in the code:

```python
emergency_contacts = {
    EmergencyLevel.CRITICAL: ["+1911", "+14155551234"],  # 911 + Emergency Supervisor
    EmergencyLevel.HIGH: ["+14155551234", "+14155551235"],  # Supervisors
    EmergencyLevel.MEDIUM: ["+14155551235"],  # Duty Manager
}
```

## 🎯 Emergency Detection

### Supported Emergency Types

- **Engine Failure**: Engine problems, power loss
- **Fire**: Aircraft fire, smoke detection
- **Medical Emergency**: Passenger/crew medical issues
- **Fuel Emergency**: Low fuel, fuel system problems
- **Hydraulic Failure**: Hydraulic system malfunctions
- **Runway Incursion**: Unauthorized runway access
- **Bird Strike**: Wildlife collision
- **Severe Weather**: Weather-related emergencies
- **Communication Failure**: Radio/navigation issues
- **Security Threat**: Security-related incidents

### Emergency Keywords

The system detects these high-priority keywords:

- **MAYDAY, PAN-PAN, EMERGENCY**
- **Engine failure, fire, smoke**
- **Medical emergency, passenger down**
- **Fuel emergency, minimum fuel**
- **Hydraulic failure, system failure**
- **Runway incursion, go around**
- **Bird strike, windshear**
- **Unable to comply, declaring emergency**

## 📞 Vapi MCP Integration

### How It Works

1. **MCP Connection**: System connects to Vapi's MCP server at `https://mcp.vapi.ai/sse`
2. **Tool Discovery**: Discovers available Vapi tools (`create_call`, `list_assistants`, etc.)
3. **Emergency Trigger**: When ASI:One detects a high-confidence emergency, it triggers a call
4. **Dynamic Calling**: Calls are made with real-time emergency context and metadata

### MCP Tools Used

- `create_call`: Creates outbound emergency calls
- `list_assistants`: Discovers available Vapi assistants
- `list_phone_numbers`: Discovers available phone numbers
- `get_call`: Retrieves call status and details

### Call Metadata

Emergency calls include rich metadata:

```json
{
  "emergency_call": true,
  "emergency_level": "critical",
  "emergency_type": "engine_failure",
  "callsign": "UAL123",
  "confidence": 0.95,
  "reasoning": "Aircraft declared MAYDAY with engine failure",
  "timestamp": "2025-01-27T10:30:00Z"
}
```

## 🧪 Testing

### Test Emergency Scenarios

The system includes comprehensive test scenarios:

```bash
python test_emergency_system.py
```

Test scenarios include:
- ✅ Engine failure (CRITICAL)
- ✅ Medical emergency (HIGH)
- ✅ Fuel emergency (MEDIUM)
- ✅ Bird strike (MEDIUM)
- ✅ Normal communication (NONE)
- ✅ Runway incursion (HIGH)

### Manual Testing

Test individual components:

```python
from app.agents.asi_one_agent import analyze_atc_emergency

# Test emergency detection
assessment = await analyze_atc_emergency(
    callsign="UAL123",
    transcript="MAYDAY MAYDAY UAL123 engine failure requesting immediate landing",
    instructions=["emergency_landing"],
    runways=["28L"]
)

print(f"Level: {assessment.level.value}")
print(f"Confidence: {assessment.confidence}")
print(f"Call Required: {assessment.call_required}")
```

## 🔍 Monitoring & Logging

### Log Levels

- **INFO**: Normal operation, successful detections
- **WARNING**: Emergency detected, system alerts
- **CRITICAL**: Emergency calls triggered
- **ERROR**: System failures, API errors

### Key Log Messages

```
🧠 ASI:One Assessment - UAL123: critical (0.95 confidence)
🚨 EMERGENCY DETECTED - UAL123: critical (0.95 confidence)
📞 EMERGENCY CALL TRIGGERED for UAL123
📞 Emergency call initiated to +1911 for UAL123 (critical)
```

## 🛡️ Safety & Reliability

### Fail-Safe Design

- **Graceful Degradation**: System continues ATC processing even if emergency detection fails
- **Error Handling**: Comprehensive error handling prevents system crashes
- **Fallback Modes**: Manual review triggered when automated analysis fails
- **Rate Limiting**: Prevents spam calling from false positives

### Confidence Thresholds

- High confidence thresholds prevent false alarms
- Multiple validation layers before triggering calls
- Human-readable reasoning for all assessments
- Audit trail for all emergency decisions

## 🔧 Troubleshooting

### Common Issues

#### MCP Connection Failed
```
❌ Failed to connect to Vapi MCP: Unauthorized
```
**Solution**: Check your `VAPI_TOKEN` environment variable

#### Emergency Detection Not Working
```
❌ Emergency analysis failed: GROQ_API_KEY environment variable required
```
**Solution**: Set your `GROQ_API_KEY` environment variable

#### No Emergency Calls Triggered
```
⚠️ Cannot trigger emergency call - MCP not available
```
**Solution**: Ensure MCP dependencies are installed and Vapi is configured

### Debug Mode

Enable debug logging:

```python
import logging
logging.getLogger().setLevel(logging.DEBUG)
```

## 📈 Performance

### Typical Response Times

- **Emergency Detection**: ~2-3 seconds
- **MCP Call Creation**: ~1-2 seconds
- **End-to-End Emergency Response**: ~3-5 seconds

### Resource Usage

- **Memory**: ~200MB baseline + ~50MB per concurrent analysis
- **CPU**: Low usage except during LLM inference
- **Network**: Minimal except for MCP calls and Groq API

## 🔮 Future Enhancements

### Planned Features

- **Multi-language Support**: Emergency detection in multiple languages
- **Advanced Analytics**: Historical emergency pattern analysis
- **Integration Expansion**: Additional MCP servers (Slack, Teams, etc.)
- **Machine Learning**: Improved detection with custom models
- **Real-time Dashboards**: Live emergency monitoring interface

### Contributing

To contribute to the emergency system:

1. Test with new emergency scenarios
2. Improve detection accuracy
3. Add new MCP integrations
4. Enhance monitoring capabilities

## 📚 API Reference

### ASI:One Agent

```python
from app.agents.asi_one_agent import ASIOneAgent, EmergencyContext

agent = ASIOneAgent(groq_api_key="your_key")
assessment = await agent.analyze_emergency(context)
```

### MCP Integration

```python
from app.core.mcp_integration import get_mcp_manager

manager = get_mcp_manager()
await manager.initialize()
response = await manager.create_vapi_call(assistant_id, phone_id, customer_number)
```

---

**🚨 Remember**: This system can trigger real emergency calls. Always test with appropriate phone numbers and inform recipients about test calls. 