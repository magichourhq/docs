package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/cloudwego/eino-ext/components/tool/mcp/officialmcp"
	"github.com/cloudwego/eino-ext/components/tool/mcp/officialmcp/session"
	"github.com/cloudwego/eino/components/tool"
)

func payload(raw string) (map[string]json.RawMessage, error) {
	var result struct {
		IsError    bool            `json:"isError"`
		Structured json.RawMessage `json:"structuredContent"`
		Content    []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if json.Unmarshal([]byte(raw), &result) != nil || result.IsError {
		return nil, errors.New("MCP tool returned an invalid or failed result")
	}
	data := result.Structured
	if len(data) == 0 || string(data) == "null" {
		if len(result.Content) != 1 || result.Content[0].Type != "text" {
			return nil, errors.New("MCP tool did not return one JSON object")
		}
		data = json.RawMessage(result.Content[0].Text)
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(data, &object) != nil || object == nil {
		return nil, errors.New("MCP tool did not return a JSON object")
	}
	return object, nil
}

func recoverImage(ctx context.Context, key, id string) (output map[string]any, err error) {
	client, err := session.Connect(ctx, session.ServerConfig{
		Name: "magic-hour",
		Transport: session.TransportConfig{
			Type:    session.TransportStreamableHTTP,
			URL:     "https://mcp.magichour.ai/",
			Headers: map[string]string{"Authorization": "Bearer " + key},
			HTTPClient: &http.Client{
				Timeout:       30 * time.Second,
				CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
			},
		},
	})
	if err != nil {
		return nil, errors.New("MCP connection failed")
	}
	defer func() {
		if closeErr := client.Close(); closeErr != nil && err == nil {
			err = errors.New("MCP session cleanup failed")
		}
	}()
	tools, err := officialmcp.GetTools(ctx, &officialmcp.Config{
		Cli: client, ServerName: "magic-hour", ListToolsMode: officialmcp.ListToolsAllPages,
	})
	if err != nil {
		return nil, errors.New("MCP tool discovery failed")
	}
	selected := make(map[string]tool.InvokableTool)
	for _, candidate := range tools {
		info, infoErr := candidate.Info(ctx)
		if infoErr != nil {
			return nil, errors.New("MCP tool metadata is invalid")
		}
		if info.Name == "get_account_info" || info.Name == "get_image_project" {
			callable, ok := candidate.(tool.InvokableTool)
			if !ok {
				return nil, errors.New("MCP tool cannot be invoked directly")
			}
			selected[info.Name] = callable
		}
	}
	if len(selected) != 2 {
		return nil, errors.New("Required Magic Hour tools are unavailable")
	}
	accountRaw, err := selected["get_account_info"].InvokableRun(ctx, "{}")
	if err != nil {
		return nil, errors.New("Magic Hour account retrieval failed")
	}
	account, err := payload(accountRaw)
	if err != nil {
		return nil, err
	}
	var accountID string
	var credits *int64
	if json.Unmarshal(account["id"], &accountID) != nil || accountID == "" ||
		json.Unmarshal(account["credits"], &credits) != nil || credits == nil {
		return nil, errors.New("Magic Hour account field types are invalid")
	}
	args, err := json.Marshal(map[string]string{"id": id})
	if err != nil {
		return nil, errors.New("Project arguments are invalid")
	}
	projectRaw, err := selected["get_image_project"].InvokableRun(ctx, string(args))
	if err != nil {
		return nil, errors.New("Magic Hour image retrieval failed")
	}
	project, err := payload(projectRaw)
	if err != nil {
		return nil, err
	}
	var returnedID, status string
	if json.Unmarshal(project["id"], &returnedID) != nil || returnedID != id ||
		json.Unmarshal(project["status"], &status) != nil || status == "" {
		return nil, errors.New("Magic Hour project identity or status is invalid")
	}
	return map[string]any{
		"tools_discovered":    len(tools),
		"account_field_types": map[string]string{"id": "string", "credits": "integer"},
		"id":                  returnedID, "status": status,
	}, nil
}

func main() {
	key := os.Getenv("MAGIC_HOUR_API_KEY")
	if key == "" || len(os.Args) != 2 || os.Args[1] == "" {
		fmt.Fprintln(os.Stderr, "Set MAGIC_HOUR_API_KEY and supply one saved image project ID")
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	output, err := recoverImage(ctx, key, os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if json.NewEncoder(os.Stdout).Encode(output) != nil {
		os.Exit(1)
	}
}
