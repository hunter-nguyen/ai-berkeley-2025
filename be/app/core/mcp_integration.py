"""
Model Context Protocol (MCP) Integration
========================================

This module provides integration with MCP servers, specifically the Vapi MCP server
for emergency calling functionality. It handles connection management, tool discovery,
and provides a clean interface for making MCP calls.
"""

import os
import json
import asyncio
import logging
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass
from datetime import datetime

# MCP Client imports
try:
    from mcp.client.session import ClientSession as MCPClient
    from mcp.client.sse import SSEClientTransport
    from mcp.client.streamable_http import StreamableHTTPClientTransport
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False
    logging.warning("⚠️  MCP SDK not available - install with: pip install mcp")


@dataclass
class MCPServerConfig:
    """Configuration for an MCP server connection"""
    name: str
    url: str
    transport_type: str = "sse"  # "sse" or "http"
    headers: Optional[Dict[str, str]] = None
    enabled: bool = True


@dataclass
class MCPToolCall:
    """Represents an MCP tool call"""
    server_name: str
    tool_name: str
    arguments: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class MCPToolResponse:
    """Response from an MCP tool call"""
    success: bool
    result: Any
    error: Optional[str] = None
    server_name: Optional[str] = None
    tool_name: Optional[str] = None


class MCPManager:
    """
    Manages connections to multiple MCP servers and provides
    a unified interface for tool calling.
    """
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.servers: Dict[str, MCPClient] = {}
        self.server_configs: Dict[str, MCPServerConfig] = {}
        self.available_tools: Dict[str, List[Dict[str, Any]]] = {}
        
        if not MCP_AVAILABLE:
            self.logger.warning("⚠️  MCP not available - emergency calling disabled")
            return
        
        # Initialize default server configurations
        self._setup_default_servers()
    
    def _setup_default_servers(self):
        """Setup default MCP server configurations"""
        
        # Vapi MCP Server for emergency calling
        vapi_token = os.getenv("VAPI_TOKEN")
        if vapi_token:
            self.server_configs["vapi"] = MCPServerConfig(
                name="vapi",
                url="https://mcp.vapi.ai/sse",
                transport_type="sse",
                headers={"Authorization": f"Bearer {vapi_token}"},
                enabled=True
            )
        
        # Add other MCP servers as needed
        # Example: Zapier MCP for additional integrations
        zapier_api_key = os.getenv("ZAPIER_API_KEY")
        if zapier_api_key:
            self.server_configs["zapier"] = MCPServerConfig(
                name="zapier",
                url="https://actions.zapier.com/mcp/actions/",
                transport_type="sse",
                headers={"Authorization": f"Bearer {zapier_api_key}"},
                enabled=False  # Disabled by default
            )
    
    async def initialize(self):
        """Initialize all configured MCP servers"""
        if not MCP_AVAILABLE:
            return
        
        for server_name, config in self.server_configs.items():
            if config.enabled:
                await self._connect_server(server_name, config)
    
    async def _connect_server(self, server_name: str, config: MCPServerConfig):
        """Connect to a specific MCP server"""
        try:
            # Create MCP client
            client = MCPClient(f"atc-emergency-{server_name}", "1.0.0")
            
            # Create transport based on type
            if config.transport_type == "sse":
                transport = SSEClientTransport(
                    config.url,
                    headers=config.headers or {}
                )
            elif config.transport_type == "http":
                transport = StreamableHTTPClientTransport(
                    config.url,
                    headers=config.headers or {}
                )
            else:
                raise ValueError(f"Unsupported transport type: {config.transport_type}")
            
            # Connect to server
            await client.connect(transport)
            self.servers[server_name] = client
            
            # Discover available tools
            await self._discover_tools(server_name, client)
            
            self.logger.info(f"✅ Connected to MCP server: {server_name}")
            
        except Exception as e:
            self.logger.error(f"❌ Failed to connect to MCP server {server_name}: {e}")
    
    async def _discover_tools(self, server_name: str, client: MCPClient):
        """Discover available tools on an MCP server"""
        try:
            tools_result = await client.listTools()
            self.available_tools[server_name] = tools_result.tools
            
            tool_names = [tool.name for tool in tools_result.tools]
            self.logger.info(f"🔧 Discovered {len(tool_names)} tools on {server_name}: {tool_names}")
            
        except Exception as e:
            self.logger.error(f"❌ Failed to discover tools on {server_name}: {e}")
            self.available_tools[server_name] = []
    
    async def call_tool(self, call: MCPToolCall) -> MCPToolResponse:
        """
        Call a tool on an MCP server
        
        Args:
            call: MCPToolCall object with server, tool, and arguments
            
        Returns:
            MCPToolResponse with result or error
        """
        if not MCP_AVAILABLE:
            return MCPToolResponse(
                success=False,
                result=None,
                error="MCP not available",
                server_name=call.server_name,
                tool_name=call.tool_name
            )
        
        if call.server_name not in self.servers:
            return MCPToolResponse(
                success=False,
                result=None,
                error=f"Server {call.server_name} not connected",
                server_name=call.server_name,
                tool_name=call.tool_name
            )
        
        try:
            client = self.servers[call.server_name]
            
            # Make the tool call
            response = await client.callTool({
                "name": call.tool_name,
                "arguments": call.arguments
            })
            
            # Parse response
            result = self._parse_tool_response(response)
            
            self.logger.info(f"🔧 Tool call successful: {call.server_name}.{call.tool_name}")
            
            return MCPToolResponse(
                success=True,
                result=result,
                server_name=call.server_name,
                tool_name=call.tool_name
            )
            
        except Exception as e:
            self.logger.error(f"❌ Tool call failed: {call.server_name}.{call.tool_name} - {e}")
            
            return MCPToolResponse(
                success=False,
                result=None,
                error=str(e),
                server_name=call.server_name,
                tool_name=call.tool_name
            )
    
    def _parse_tool_response(self, response: Any) -> Any:
        """Parse tool response from MCP server"""
        if not response or not hasattr(response, 'content'):
            return response
        
        # Extract text content and try to parse as JSON
        text_item = None
        for item in response.content:
            if hasattr(item, 'type') and item.type == 'text':
                text_item = item
                break
        
        if text_item and hasattr(text_item, 'text'):
            try:
                return json.loads(text_item.text)
            except json.JSONDecodeError:
                return text_item.text
        
        return response
    
    async def create_vapi_call(self, assistant_id: str, phone_number_id: str, 
                              customer_number: str, metadata: Optional[Dict[str, Any]] = None,
                              scheduled_at: Optional[str] = None) -> MCPToolResponse:
        """
        Convenience method to create a Vapi call
        
        Args:
            assistant_id: Vapi assistant ID
            phone_number_id: Vapi phone number ID  
            customer_number: Customer phone number to call
            metadata: Optional metadata for the call
            scheduled_at: Optional ISO timestamp to schedule call
            
        Returns:
            MCPToolResponse with call result
        """
        call_args = {
            "assistantId": assistant_id,
            "phoneNumberId": phone_number_id,
            "customer": {
                "phoneNumber": customer_number
            }
        }
        
        if metadata:
            call_args["metadata"] = metadata
            
        if scheduled_at:
            call_args["scheduledAt"] = scheduled_at
        
        call = MCPToolCall(
            server_name="vapi",
            tool_name="create_call",
            arguments=call_args,
            metadata=metadata
        )
        
        return await self.call_tool(call)
    
    async def list_vapi_assistants(self) -> MCPToolResponse:
        """List available Vapi assistants"""
        call = MCPToolCall(
            server_name="vapi",
            tool_name="list_assistants",
            arguments={}
        )
        
        return await self.call_tool(call)
    
    async def list_vapi_phone_numbers(self) -> MCPToolResponse:
        """List available Vapi phone numbers"""
        call = MCPToolCall(
            server_name="vapi",
            tool_name="list_phone_numbers",
            arguments={}
        )
        
        return await self.call_tool(call)
    
    def get_available_tools(self, server_name: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get available tools for server(s)
        
        Args:
            server_name: Specific server name, or None for all servers
            
        Returns:
            Dictionary of server_name -> tools
        """
        if server_name:
            return {server_name: self.available_tools.get(server_name, [])}
        return self.available_tools.copy()
    
    def is_server_connected(self, server_name: str) -> bool:
        """Check if a server is connected"""
        return server_name in self.servers
    
    async def disconnect_all(self):
        """Disconnect from all MCP servers"""
        for server_name, client in self.servers.items():
            try:
                await client.close()
                self.logger.info(f"🔌 Disconnected from MCP server: {server_name}")
            except Exception as e:
                self.logger.error(f"❌ Error disconnecting from {server_name}: {e}")
        
        self.servers.clear()
    
    async def test_vapi_connection(self, test_number: Optional[str] = None) -> bool:
        """
        Test Vapi MCP connection
        
        Args:
            test_number: Optional phone number to test call creation
            
        Returns:
            True if connection is working
        """
        if not self.is_server_connected("vapi"):
            self.logger.error("❌ Vapi server not connected")
            return False
        
        try:
            # Test listing assistants
            assistants_response = await self.list_vapi_assistants()
            if not assistants_response.success:
                self.logger.error(f"❌ Failed to list assistants: {assistants_response.error}")
                return False
            
            # Test listing phone numbers
            numbers_response = await self.list_vapi_phone_numbers()
            if not numbers_response.success:
                self.logger.error(f"❌ Failed to list phone numbers: {numbers_response.error}")
                return False
            
            self.logger.info("✅ Vapi MCP connection test successful")
            
            # Optional: Test call creation if test number provided
            if test_number and assistants_response.result and numbers_response.result:
                assistants = assistants_response.result
                phone_numbers = numbers_response.result
                
                if assistants and phone_numbers:
                    test_call_response = await self.create_vapi_call(
                        assistant_id=assistants[0]["id"],
                        phone_number_id=phone_numbers[0]["id"],
                        customer_number=test_number,
                        metadata={"test_call": True, "timestamp": datetime.now().isoformat()}
                    )
                    
                    if test_call_response.success:
                        self.logger.info(f"✅ Test call created successfully to {test_number}")
                    else:
                        self.logger.warning(f"⚠️  Test call failed: {test_call_response.error}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"❌ Vapi connection test failed: {e}")
            return False


# Global MCP manager instance
mcp_manager = None

def get_mcp_manager() -> MCPManager:
    """Get or create global MCP manager instance"""
    global mcp_manager
    
    if mcp_manager is None:
        mcp_manager = MCPManager()
    
    return mcp_manager


async def initialize_mcp():
    """Initialize MCP connections"""
    manager = get_mcp_manager()
    await manager.initialize()


async def shutdown_mcp():
    """Shutdown MCP connections"""
    manager = get_mcp_manager()
    await manager.disconnect_all()


# Convenience functions for common operations
async def create_emergency_call(assistant_id: str, phone_number_id: str, 
                               recipient: str, emergency_data: Dict[str, Any]) -> MCPToolResponse:
    """
    Create an emergency call via Vapi MCP
    
    Args:
        assistant_id: Vapi assistant ID for emergency calls
        phone_number_id: Vapi phone number ID
        recipient: Phone number to call
        emergency_data: Emergency context data
        
    Returns:
        MCPToolResponse with call result
    """
    manager = get_mcp_manager()
    
    metadata = {
        "emergency_call": True,
        "timestamp": datetime.now().isoformat(),
        **emergency_data
    }
    
    return await manager.create_vapi_call(
        assistant_id=assistant_id,
        phone_number_id=phone_number_id,
        customer_number=recipient,
        metadata=metadata
    )


if __name__ == "__main__":
    # Test MCP integration
    async def test_mcp():
        manager = get_mcp_manager()
        await manager.initialize()
        
        # Test Vapi connection
        test_number = os.getenv("TEST_PHONE_NUMBER")
        success = await manager.test_vapi_connection(test_number)
        
        if success:
            print("✅ MCP integration test successful")
        else:
            print("❌ MCP integration test failed")
        
        await manager.disconnect_all()
    
    asyncio.run(test_mcp()) 