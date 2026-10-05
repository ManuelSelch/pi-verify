declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    registerCommand(
      name: string,
      options: {
        description: string;
        handler: (argument: string) => void | Promise<void>;
      },
    ): void;
    sendUserMessage(message: string): void;
  }
}
