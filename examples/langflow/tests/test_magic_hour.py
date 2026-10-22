import sys
from copy import deepcopy
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from lfx.components.models_and_agents.mcp_component import MCPToolsComponent
from pydantic import SecretStr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from magic_hour import MagicHourMCPComponent


def component(key="test-key"):
    instance = MagicHourMCPComponent()
    instance.set(api_key=key)
    return instance


def test_real_lfx_instantiation_and_inputs():
    instance = component()
    fields = {item.name: item for item in instance.inputs}
    assert fields["api_key"].password
    assert fields["api_key"].required
    assert "api_key" in instance.default_keys
    assert not fields["mcp_server"].show
    assert "headers" not in fields
    assert "tool" in fields and "tool_placeholder" in fields
    assert "api_key" not in {item.name for item in MCPToolsComponent.inputs}
    assert next(
        item for item in MCPToolsComponent.inputs if item.name == "mcp_server"
    ).show


@pytest.mark.parametrize("key", ["", "  ", None])
def test_empty_key_rejected(key):
    with pytest.raises(ValueError, match="API key is required"):
        component(key)._configure_server()


@pytest.mark.parametrize("key", [" test-key ", SecretStr("test-key")])
def test_secret_and_string_auth(key):
    instance = component(key)
    instance._configure_server()
    assert instance.headers == [{"key": "Authorization", "value": "Bearer test-key"}]
    assert "test-key" not in str(instance.mcp_server)


def test_rotating_keys_isolates_parent_tool_cache():
    instance = component("first-key")
    instance._configure_server()
    first = instance._mcp_servers_cache_key("Magic Hour (first-party)")
    instance.set(api_key="second-key")
    instance._configure_server()
    second = instance._mcp_servers_cache_key("Magic Hour (first-party)")
    assert first != second
    assert "first-key" not in first and "second-key" not in second


@pytest.mark.asyncio
async def test_discovery_delegates_to_canonical_client_without_exporting_key(
    monkeypatch,
):
    mock = AsyncMock(
        return_value=(
            ["discovered-tool"],
            {"config": {"headers": {"Authorization": "secret"}}},
        )
    )
    monkeypatch.setattr(MCPToolsComponent, "update_tool_list", mock)
    instance = component()
    tools, server = await instance.update_tool_list(
        {"name": "untrusted", "config": {"url": "https://other.example"}}
    )
    assert tools == ["discovered-tool"]
    assert server == {
        "name": "Magic Hour (first-party)",
        "config": {"url": "https://mcp.magichour.ai/"},
    }
    mock.assert_awaited_once_with(server)
    assert "test-key" not in str(server)


@pytest.mark.asyncio
async def test_tool_mode_configures_credentials_before_parent_cache_lookup(monkeypatch):
    observed = []

    async def get_tools(self):
        observed.append(deepcopy(self.headers))
        return ["tool"]

    monkeypatch.setattr(MCPToolsComponent, "_get_tools", get_tools)
    instance = component("new-key")
    assert await instance._get_tools() == ["tool"]
    assert observed == [[{"key": "Authorization", "value": "Bearer new-key"}]]


@pytest.mark.asyncio
async def test_key_change_refreshes_canonical_tool_dropdown(monkeypatch):
    parent_update = AsyncMock(side_effect=lambda config, value, field: config)
    monkeypatch.setattr(MCPToolsComponent, "update_build_config", parent_update)
    instance = component()
    instance.tools = ["old-tool"]
    config = {
        "tool": {"options": ["old-tool"], "value": "old-tool"},
        "api_key": {"value": ""},
    }
    result = await instance.update_build_config(config, "new-key", "api_key")
    assert result["tool"] == {"options": [], "value": ""}
    assert instance.tools == []
    parent_update.assert_awaited_once_with(config, instance.mcp_server, "mcp_server")


@pytest.mark.asyncio
async def test_clearing_key_hides_tools_without_network(monkeypatch):
    parent_update = AsyncMock()
    monkeypatch.setattr(MCPToolsComponent, "update_build_config", parent_update)
    instance = component("")
    config = {"tool": {"options": ["old"], "value": "old", "show": True}}
    result = await instance.update_build_config(config, "", "api_key")
    assert result["tool"] == {"options": [], "value": "", "show": False}
    parent_update.assert_not_awaited()
