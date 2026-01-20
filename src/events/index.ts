import { Client } from "discord.js";
import { handleMessageCreate } from "./messageCreate";

export function registerEvents(client: Client): void {
  client.on("messageCreate", handleMessageCreate);

  console.log("Event handlers registered");
}
