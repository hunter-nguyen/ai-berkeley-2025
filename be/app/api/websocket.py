"""
WebSocket API endpoints for real-time communication
"""
import json
from typing import List, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime

from ..utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.stats = {
            "total_connections": 0,
            "active_connections": 0,
            "messages_sent": 0,
        }
    
    async def connect(self, websocket: WebSocket):
        """Accept and track new connection"""
        await websocket.accept()
        self.active_connections.append(websocket)
        self.stats["total_connections"] += 1
        self.stats["active_connections"] = len(self.active_connections)
        logger.info(f"New WebSocket connection. Total active: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove disconnected client"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            self.stats["active_connections"] = len(self.active_connections)
            logger.info(f"WebSocket disconnected. Total active: {len(self.active_connections)}")
    
    async def send_message(self, websocket: WebSocket, message: Dict[str, Any]):
        """Send message to specific client"""
        try:
            await websocket.send_text(json.dumps(message))
            self.stats["messages_sent"] += 1
        except Exception as e:
            logger.error(f"Error sending message to client: {e}")
            self.disconnect(websocket)
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast message to all connected clients"""
        if not self.active_connections:
            return
        
        # Add timestamp to message
        message["broadcast_timestamp"] = datetime.now().isoformat()
        
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
                self.stats["messages_sent"] += 1
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for connection in disconnected:
            self.disconnect(connection)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get connection statistics"""
        return self.stats.copy()


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint for ATC data streaming"""
    await manager.connect(websocket)
    
    try:
        # Send welcome message
        await manager.send_message(websocket, {
            "type": "welcome",
            "message": "Connected to ATC Audio Agent",
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                message_type = message.get("type", "unknown")
                
                if message_type == "ping":
                    await manager.send_message(websocket, {
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    })
                elif message_type == "get_stats":
                    await manager.send_message(websocket, {
                        "type": "stats",
                        "data": manager.get_stats(),
                        "timestamp": datetime.now().isoformat()
                    })
                else:
                    logger.warning(f"Unknown message type: {message_type}")
                    
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON received: {data}")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager"""
    return manager 