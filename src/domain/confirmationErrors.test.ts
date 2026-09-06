import { describe, expect, it } from "vitest";
import { formatDownloadStartError } from "./confirmationErrors";

describe("formatDownloadStartError", () => {
  it("maps known download errors and normalizes generic messages", () => {
    expect(
      formatDownloadStartError("erro: já está em andamento ou pausado"),
    ).toContain("outra instância");
    expect(formatDownloadStartError("erro: já foi baixado")).toContain(
      "baixado anteriormente",
    );
    expect(formatDownloadStartError("")).toContain("inesperado");
    expect(formatDownloadStartError("network: arquivo indisponível")).toBe(
      "Arquivo indisponível",
    );
    expect(formatDownloadStartError("HTTP 403")).toContain("Faça login");
    expect(formatDownloadStartError("HTTP 404")).toContain("link ainda é válido");
    expect(formatDownloadStartError("Tempo limite excedido")).toContain(
      "tente novamente",
    );
  });
});
