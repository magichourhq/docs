"""Magic Hour tools through Langflow's canonical MCP client (lfx 1.12.7)."""

from copy import deepcopy
from typing import ClassVar

from lfx.components.models_and_agents.mcp_component import MCPToolsComponent
from lfx.io import SecretStrInput


class MagicHourMCPComponent(MCPToolsComponent):
    display_name = "Magic Hour"
    description = "Generate and edit images, videos, and audio using Magic Hour's hosted MCP server."
    documentation = "https://docs.magichour.ai/integration/model-context-protocol"
    icon = "Video"
    name = "MagicHourMCP"

    # Parent code uses this list to preserve static fields while switching tools.
    default_keys: ClassVar[list] = [*MCPToolsComponent.default_keys, "api_key"]
    inputs: ClassVar[list] = [
        SecretStrInput(
            name="api_key",
            display_name="Magic Hour API Key",
            info="Create a key at https://magichour.ai/developer. Generations consume credits.",
            required=True,
            real_time_refresh=True,
        ),
        *[deepcopy(item) for item in MCPToolsComponent.inputs if item.name != "headers"],
    ]
    # Keep the hidden input because the parent UI lifecycle expects it to exist.
    for _item in inputs:
        if _item.name == "mcp_server":
            _item.show = False
            _item.value = {"name": "Magic Hour (first-party)", "config": {"url": "https://mcp.magichour.ai/"}}
    del _item

    def _configure_server(self) -> None:
        value = self.api_key
        key = value.get_secret_value() if hasattr(value, "get_secret_value") else value
        if not isinstance(key, str) or not key.strip():
            raise ValueError("Magic Hour API key is required.")
        self.mcp_server = {
            "name": "Magic Hour (first-party)",
            "config": {"url": "https://mcp.magichour.ai/"},
        }
        # The parent's cache key hashes component headers. Putting auth only in
        # mcp_server.config would let different keys share cached, bound tools.
        self.headers = [{"key": "Authorization", "value": f"Bearer {key.strip()}"}]

    async def update_tool_list(self, mcp_server_value=None):
        self._configure_server()
        tools, _ = await super().update_tool_list(self.mcp_server)
        # Do not return resolved credentials into saved flow/UI configuration.
        return tools, deepcopy(self.mcp_server)

    async def _get_tools(self):
        # Configure before the parent computes its short-lived tool-cache key.
        self._configure_server()
        return await super()._get_tools()

    async def update_build_config(self, build_config, field_value, field_name=None):
        if field_name == "api_key":
            self.tools = []
            build_config["tool"]["options"] = []
            build_config["tool"]["value"] = ""
            return build_config
        return await super().update_build_config(build_config, field_value, field_name)
