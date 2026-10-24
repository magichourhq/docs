import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.mcp.client.DefaultMcpClient;
import dev.langchain4j.mcp.client.McpClient;
import dev.langchain4j.mcp.client.transport.http.StreamableHttpMcpTransport;
import dev.langchain4j.service.tool.ToolExecutionResult;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;

/** Read account access and recover an existing image through LangChain4j's native MCP client. */
public final class MagicHour {
    private static final ObjectMapper JSON = new ObjectMapper();

    private static JsonNode call(McpClient client, String name, Map<String, Object> arguments)
            throws Exception {
        ToolExecutionResult result = client.executeTool(ToolExecutionRequest.builder()
                .name(name)
                .arguments(JSON.writeValueAsString(arguments))
                .build());
        if (result.isError()) {
            throw new IllegalStateException("Magic Hour rejected " + name + "; keep the saved project ID.");
        }
        JsonNode payload = JSON.readTree(result.resultText());
        if (payload == null || !payload.isObject()) {
            throw new IllegalStateException("Unexpected Magic Hour result.");
        }
        return payload;
    }

    private static void download(JsonNode project, Path output) throws Exception {
        if (!project.path("status").asText().equals("complete")
                || !project.path("downloads").isArray()
                || project.path("downloads").isEmpty()) {
            throw new IllegalStateException("Image is not ready. Retry this same project ID later.");
        }
        if (Files.exists(output)) {
            throw new IllegalStateException("Output exists. Choose a new path to preserve it.");
        }
        String signedUrl = project.path("downloads").get(0).path("url").asText();
        HttpClient storage = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        HttpRequest request = HttpRequest.newBuilder(URI.create(signedUrl))
                .timeout(Duration.ofSeconds(60))
                .GET()
                .build();
        Path temporary = Files.createTempFile(output.toAbsolutePath().getParent(), ".magic-hour-", ".part");
        try {
            HttpResponse<Path> response = storage.send(request, HttpResponse.BodyHandlers.ofFile(temporary));
            if (response.statusCode() != 200) {
                throw new IllegalStateException("Image download failed. Retrieve a fresh URL for the same ID.");
            }
            Files.move(temporary, output);
            System.out.println(JSON.writeValueAsString(Map.of(
                    "saved", output.toString(), "bytes", Files.size(output))));
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private static void run(String[] args) throws Exception {
        if (args.length == 0 || !java.util.Set.of("account", "get", "download").contains(args[0])
                || (args[0].equals("account") && args.length != 1)
                || (args[0].equals("get") && args.length != 2)
                || (args[0].equals("download") && args.length != 3)) {
            throw new IllegalArgumentException("Usage: account | get PROJECT_ID | download PROJECT_ID OUTPUT.png");
        }
        String token = System.getenv("MAGIC_HOUR_API_KEY");
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Set MAGIC_HOUR_API_KEY through your secret manager.");
        }
        try (StreamableHttpMcpTransport transport = StreamableHttpMcpTransport.builder()
                .url("https://mcp.magichour.ai/")
                .customHeaders(Map.of("Authorization", "Bearer " + token.strip()))
                .followRedirects(false)
                .logRequests(false)
                .logResponses(false)
                .timeout(Duration.ofSeconds(30))
                .build();
                McpClient client = DefaultMcpClient.builder()
                .transport(transport)
                .protocolVersion("2025-11-25")
                .autoHealthCheck(false)
                .initializationTimeout(Duration.ofSeconds(30))
                .toolExecutionTimeout(Duration.ofSeconds(60))
                .build()) {
            var tools = client.listTools();
            String name = args[0].equals("account") ? "account_retrieve" : "image_projects_retrieve_details";
            if (tools.stream().noneMatch(tool -> tool.name().equals(name))) {
                throw new IllegalStateException("The required Magic Hour tool was not discovered.");
            }
            if (args[0].equals("account")) {
                JsonNode account = call(client, name, Map.of());
                if (!account.path("id").isTextual() || !account.path("credits").isIntegralNumber()) {
                    throw new IllegalStateException("Unexpected account response.");
                }
                System.out.println(JSON.writeValueAsString(Map.of("authenticated", true, "tools", tools.size())));
                return;
            }
            String id = args[1].strip();
            if (id.isEmpty()) {
                throw new IllegalArgumentException("Provide the saved image project ID.");
            }
            JsonNode project = call(client, name, Map.of("id", id));
            if (!project.path("id").asText().equals(id) || !project.path("status").isTextual()) {
                throw new IllegalStateException("The retrieved image does not match the saved ID.");
            }
            System.out.println(JSON.writeValueAsString(Map.of(
                    "id", id, "status", project.path("status").asText(),
                    "credits_charged", project.path("credits_charged").asInt())));
            if (args[0].equals("download")) {
                download(project, Path.of(args[2]));
            }
        }
    }

    public static void main(String[] args) {
        try {
            run(args);
        } catch (IllegalArgumentException | IllegalStateException error) {
            System.err.println(error.getMessage());
            System.exit(1);
        } catch (Exception error) {
            System.err.println(error.getClass().getSimpleName()
                    + ": request failed; keep the saved project ID and retry recovery.");
            System.exit(1);
        }
    }
}
