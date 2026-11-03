declare module "@earendil-works/pi-coding-agent" {
  export interface AutocompleteItem {
    value: string;
    label: string;
    description?: string;
  }

  export interface ExtensionCommandContext {
    ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
  }

  export interface ExtensionAPI {
    registerTool(tool: unknown): void;
    registerCommand(
      name: string,
      options: {
        description: string;
        getArgumentCompletions?: (argumentPrefix: string) => AutocompleteItem[] | null | Promise<AutocompleteItem[] | null>;
        handler: (argument: string, ctx: ExtensionCommandContext) => void | Promise<void>;
      },
    ): void;
    sendUserMessage(message: string): void;
    sendMessage(
      message: { customType: string; content: string; display: boolean; details?: unknown },
      options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
    ): void;
    on(event: "agent_end", handler: (event: unknown, context: unknown) => void | Promise<void>): void;
  }
}
