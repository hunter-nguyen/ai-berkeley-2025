import asyncio
import websockets
import json
import logging
from typing import Set, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

class WebSocketBroadcaster:
    """WebSocket server for broadcasting real-time ATC transcriptions"""
    
    def __init__(self, host: str = "0.0.0.0", port: int = 8765):
        self.host = host
        self.port = port
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.server = None
        self._running = False
        
    async def handler(self, websocket, path):
        """Handle WebSocket connections"""
        client_id = id(websocket)
        self.clients.add(websocket)
        logger.info(f"Client {client_id} connected. Total clients: {len(self.clients)}")
        
        try:
            # Send welcome message
            await websocket.send(json.dumps({
                "type": "connection",
                "message": "Connected to ATC Audio Pipeline",
                "timestamp": datetime.now().isoformat(),
                "client_id": client_id
            }))
            
            # Keep connection alive and handle incoming messages
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self._handle_client_message(websocket, data)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON from client {client_id}")
                except Exception as e:
                    logger.error(f"Error handling client message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {client_id} disconnected normally")
        except Exception as e:
            logger.error(f"Error with client {client_id}: {e}")
        finally:
            self.clients.remove(websocket)
            logger.info(f"Client {client_id} removed. Total clients: {len(self.clients)}")
    
    async def _handle_client_message(self, websocket, data: Dict[str, Any]):
        """Handle incoming messages from clients"""
        msg_type = data.get("type", "unknown")
        
        if msg_type == "ping":
            await websocket.send(json.dumps({
                "type": "pong",
                "timestamp": datetime.now().isoformat()
            }))
        elif msg_type == "subscribe":
            # Client wants to subscribe to specific frequency
            frequency = data.get("frequency", "all")
            await websocket.send(json.dumps({
                "type": "subscribed",
                "frequency": frequency,
                "timestamp": datetime.now().isoformat()
            }))
        else:
            logger.debug(f"Unknown message type: {msg_type}")
    
    async def broadcast_transcript(self, transcript_data: Dict[str, Any]):
        """Broadcast transcription to all connected clients"""
        if not self.clients:
            return
            
        message = {
            "type": "transcript",
            "timestamp": datetime.now().isoformat(),
            **transcript_data
        }
        
        # Convert to JSON once
        json_message = json.dumps(message)
        
        # Broadcast to all clients
        disconnected_clients = set()
        
        for client in self.clients:
            try:
                await client.send(json_message)
            except websockets.exceptions.ConnectionClosed:
                disconnected_clients.add(client)
            except Exception as e:
                logger.error(f"Error sending to client: {e}")
                disconnected_clients.add(client)
        
        # Remove disconnected clients
        self.clients -= disconnected_clients
        if disconnected_clients:
            logger.info(f"Removed {len(disconnected_clients)} disconnected clients")
    
    async def broadcast_status(self, status_data: Dict[str, Any]):
        """Broadcast pipeline status to all connected clients"""
        if not self.clients:
            return
            
        message = {
            "type": "status",
            "timestamp": datetime.now().isoformat(),
            **status_data
        }
        
        json_message = json.dumps(message)
        disconnected_clients = set()
        
        for client in self.clients:
            try:
                await client.send(json_message)
            except websockets.exceptions.ConnectionClosed:
                disconnected_clients.add(client)
            except Exception as e:
                logger.error(f"Error sending status to client: {e}")
                disconnected_clients.add(client)
        
        self.clients -= disconnected_clients
    
    async def broadcast_emergency(self, emergency_data: Dict[str, Any]):
        """Broadcast emergency alerts to all connected clients"""
        if not self.clients:
            return
            
        message = {
            "type": "emergency",
            "timestamp": datetime.now().isoformat(),
            **emergency_data
        }
        
        json_message = json.dumps(message)
        disconnected_clients = set()
        
        for client in self.clients:
            try:
                await client.send(json_message)
            except websockets.exceptions.ConnectionClosed:
                disconnected_clients.add(client)
            except Exception as e:
                logger.error(f"Error sending emergency to client: {e}")
                disconnected_clients.add(client)
        
        self.clients -= disconnected_clients
    
    async def start(self):
        """Start the WebSocket server"""
        if self._running:
            return
            
        self.server = await websockets.serve(
            self.handler,
            self.host,
            self.port
        )
        self._running = True
        logger.info(f"WebSocket server started on ws://{self.host}:{self.port}")
    
    async def stop(self):
        """Stop the WebSocket server"""
        if not self._running:
            return
            
        self._running = False
        
        # Close all client connections
        if self.clients:
            await asyncio.wait([client.close() for client in self.clients])
            self.clients.clear()
        
        # Stop the server
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        
        logger.info("WebSocket server stopped")
    
    def is_running(self) -> bool:
        """Check if server is running"""
        return self._running
    
    def get_client_count(self) -> int:
        """Get number of connected clients"""
        return len(self.clients)

# Global broadcaster instance
broadcaster = WebSocketBroadcaster()

# Convenience functions for external use
async def broadcast_transcript(transcript_data: Dict[str, Any]):
    """Broadcast transcription to all connected clients"""
    await broadcaster.broadcast_transcript(transcript_data)

async def broadcast_status(status_data: Dict[str, Any]):
    """Broadcast status to all connected clients"""
    await broadcaster.broadcast_status(status_data)

async def broadcast_emergency(emergency_data: Dict[str, Any]):
    """Broadcast emergency to all connected clients"""
    await broadcaster.broadcast_emergency(emergency_data)

def get_client_count() -> int:
    """Get number of connected clients"""
    return broadcaster.get_client_count()

# For standalone testing
async def main():
    """Test the WebSocket server"""
    await broadcaster.start()
    
    try:
        # Keep server running
        await asyncio.Future()  # Run forever
    except KeyboardInterrupt:
        print("Shutting down...")
    finally:
        await broadcaster.stop()

if __name__ == "__main__":
    asyncio.run(main()) 