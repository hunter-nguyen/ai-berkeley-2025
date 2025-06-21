# Mayday ATC Dashboard

A professional Air Traffic Control dashboard for SFO Tower operations, featuring real-time aircraft tracking using FlightRadar24 API integration.

## ✈️ Features

- **Real-time Aircraft Tracking**: Live aircraft data from FlightRadar24 API
- **Interactive Radar Map**: Leaflet-powered dark theme radar display
- **Professional ATC Interface**: Authentic SFO Tower control room styling
- **Live Communications**: Real-time voice-to-text feed simulation
- **Conflict Detection**: Visual conflict zones with pulsing overlays
- **Flight Details**: Comprehensive aircraft data panels
- **Alerts & Tasks**: Priority conflict warnings and action items
- **Responsive Design**: Optimized for ATC workstation displays

## 🚀 Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Set up Environment Variables**:
   Create a `.env.local` file in the `fe` directory:
   ```bash
   NEXT_PUBLIC_FLIGHTRADAR24_API_KEY=your_api_key_here
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```

4. **Open Dashboard**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🛩️ FlightRadar24 Integration

### API Configuration

The dashboard uses FlightRadar24's public API to fetch real-time aircraft data for the San Francisco Bay Area. The integration includes:

- **Automatic Fallback**: If the API is unavailable, falls back to realistic mock data
- **Smart Caching**: 10-second cache to optimize API calls
- **Error Handling**: Graceful degradation with user feedback
- **SFO Area Filtering**: Shows only aircraft within SFO control area

### API Bounds
- **North**: 37.9°
- **South**: 37.6° 
- **East**: -122.2°
- **West**: -122.7°

### Data Refresh
- **Live Updates**: Every 10 seconds
- **Aircraft Limit**: Max 20 aircraft for optimal performance
- **Status Indicators**: Real-time connection status in UI

## 🎛️ Dashboard Components

### Status Bar
- **SFO TWR**: Facility identification
- **System Status**: ASDE-X, COMM, Weather alerts
- **Live Aircraft Count**: Real-time from FlightRadar24
- **Traffic Level**: Dynamic based on aircraft count
- **UTC/Local Time**: Aviation standard time display

### Radar Map
- **Background**: Dark theme optimized for ATC operations
- **Aircraft Icons**: Cyan markers with radar ping animations
- **Conflict Zones**: Red/yellow pulsing overlays
- **Real-time Updates**: Live aircraft movement tracking

### Side Panels
- **Live Comms**: Message feed with urgency detection
- **Alerts & Tasks**: Conflict warnings and action items
- **Flight Details**: Comprehensive aircraft information

## 🔧 Development

### Project Structure
```
fe/
├── src/
│   ├── components/dashboard/
│   │   ├── ATCStatusBar.tsx
│   │   ├── RadarMap.tsx
│   │   ├── FlightDetails.tsx
│   │   ├── LiveComms.tsx
│   │   ├── AlertsAndTasks.tsx
│   │   └── MaydayDashboard.tsx
│   └── utils/api/
│       └── flightradar24.ts
├── .env.local
└── package.json
```

### Key Technologies
- **Next.js 15**: React framework with App Router
- **Tailwind CSS 4**: Utility-first styling
- **Leaflet**: Interactive maps
- **Framer Motion**: Smooth animations
- **TypeScript**: Type safety

### API Service
The `FlightRadar24Service` class handles:
- Multiple endpoint fallbacks
- Data caching and optimization
- Error handling and retry logic
- Aircraft filtering and transformation

## 🎨 Design Philosophy

### ATC Authenticity
- **Dark Theme**: Reduces eye strain during long shifts
- **Monospace Fonts**: Professional aviation styling
- **Color Coding**: Green for active, cyan for data, red for alerts
- **Minimal UI**: Focus on essential operational information

### Performance
- **Optimized Rendering**: Limited aircraft count for smooth performance
- **Smart Caching**: Reduced API calls with intelligent data management
- **Progressive Loading**: Graceful fallbacks and loading states

## 🔐 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_FLIGHTRADAR24_API_KEY` | FlightRadar24 API key | Optional* |

*The dashboard works without an API key using public endpoints, but may have rate limits.

## 📡 API Endpoints

The service tries multiple FlightRadar24 endpoints for reliability:

1. `data-live.flightradar24.com` (Primary)
2. `data-cloud.flightradar24.com` (Fallback)

Both endpoints return the same data format with aircraft positions, altitudes, speeds, and callsigns.

## 🏗️ Deployment

For production deployment:

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Start production server**:
   ```bash
   npm start
   ```

3. **Environment**: Set production environment variables

## 📋 Todo / Future Enhancements

- [ ] Weather radar overlay integration
- [ ] Voice recognition for communications
- [ ] Historical flight track playback
- [ ] Multiple airport support
- [ ] Real conflict detection algorithms
- [ ] Integration with FAA systems

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is for educational and demonstration purposes.
