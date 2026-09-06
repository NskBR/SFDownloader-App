import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tokens = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

describe("contrato dos tokens visuais", () => {
  it("mantém a paleta e os aliases semânticos exigidos pela interface", () => {
    const requiredTokens = [
      "--bg:", "--panel:", "--surface:", "--line:", "--text:", "--text-2:",
      "--ember:", "--accent-primary:", "--accent-danger:", "--accent-warning:",
      "--accent-info:", "--cyan:", "--white-08:", "--st-downloading:",
    ];

    for (const token of requiredTokens) {
      expect(tokens).toContain(token);
    }
  });

  it("preserva as variações de tema claro e de cor do aplicativo", () => {
    expect(tokens).toContain(':root[data-theme="light"]');
    for (const color of ["slate", "graphite", "obsidian", "mint", "ocean", "rose"]) {
      expect(tokens).toContain(`:root[data-appcolor="${color}"]`);
    }
  });

  it("mantém os contratos de foco visível e redução de movimento", () => {
    expect(tokens).toContain(":focus-visible");
    expect(tokens).toContain("prefers-reduced-motion: reduce");
    expect(tokens).toContain("animation-duration: 0.01ms !important");
  });
});
