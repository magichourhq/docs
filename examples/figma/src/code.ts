figma.showUI(__html__, { width: 380, height: 690, themeColors: true });
const send = (message: unknown) => figma.ui.postMessage(message);
function selection() {
  const nodes = figma.currentPage.selection;
  const node = nodes.length === 1 ? nodes[0] : undefined;
  send({
    type: "selection",
    name: node?.name ?? "",
    canExport: !!node && "exportAsync" in node,
    id: node?.id,
  });
}
figma.on("selectionchange", selection);
figma.ui.onmessage = async (message: {
  type: string;
  requestId?: number;
  bytes?: number[];
  targetId?: string;
  replace?: boolean;
  id?: string;
}) => {
  try {
    if (message.type === "ready") {
      selection();
      const id = await figma.clientStorage.getAsync("magic-hour-last-image-project");
      if (typeof id === "string") send({ type: "saved-project", id });
    } else if (message.type === "remember-project" && typeof message.id === "string") {
      await figma.clientStorage.setAsync("magic-hour-last-image-project", message.id);
    } else if (message.type === "export-selection") {
      const nodes = figma.currentPage.selection;
      if (nodes.length !== 1 || !("exportAsync" in nodes[0]))
        throw new Error("Select one layer to edit.");
      const node = nodes[0];
      const bytes = await node.exportAsync({
        format: "PNG",
        constraint: { type: "WIDTH", value: Math.min(2048, Math.max(1, Math.round(node.width))) },
      });
      send({
        type: "selection-exported",
        requestId: message.requestId,
        targetId: node.id,
        bytes: Array.from(bytes),
      });
    } else if (message.type === "insert-image") {
      if (
        !Array.isArray(message.bytes) ||
        !message.bytes.length ||
        message.bytes.length > 25_000_000 ||
        !message.bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
      )
        throw new Error("Invalid image data.");
      // Re-resolve the original layer after async generation. Never replace a newly selected layer.
      const target =
        message.replace && message.targetId ? await figma.getNodeByIdAsync(message.targetId) : null;
      if (message.replace && (!target || !("fills" in target) || target.removed))
        throw new Error("The original layer cannot be replaced. Insert the result as a new image.");
      if (target) {
        let page: BaseNode | null = target;
        while (page && page.type !== "PAGE") page = page.parent;
        if (page?.id !== figma.currentPage.id)
          throw new Error("Return to the original page before replacing this layer.");
      }
      const image = figma.createImage(new Uint8Array(message.bytes));
      const { width, height } = await image.getSizeAsync();
      let result: SceneNode;
      if (target && "fills" in target) {
        (target as GeometryMixin).fills = [
          { type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" },
        ];
        result = target as SceneNode;
      } else {
        const node = figma.createRectangle();
        node.name = "Magic Hour image";
        node.resize(width, height);
        node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
        node.x = figma.viewport.center.x - width / 2;
        node.y = figma.viewport.center.y - height / 2;
        figma.currentPage.appendChild(node);
        result = node;
      }
      figma.currentPage.selection = [result];
      figma.viewport.scrollAndZoomIntoView([result]);
      send({ type: "inserted" });
      figma.notify("Magic Hour image added");
    }
  } catch (error) {
    send({
      type: "plugin-error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : "Figma could not complete this action.",
    });
  }
};
