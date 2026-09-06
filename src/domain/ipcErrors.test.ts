import { describe, expect, it } from "vitest";
import { ipcErrorMessage } from "./ipcErrors";

describe("ipcErrorMessage", () => {
  it("preserves meaningful IPC errors and uses the contextual fallback", () => {
    expect(ipcErrorMessage(new Error("Falha de rede"), "Falha desconhecida")).toBe("Falha de rede");
    expect(ipcErrorMessage(null, "Falha desconhecida")).toBe("Falha desconhecida");
  });
});