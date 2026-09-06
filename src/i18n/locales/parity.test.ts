import { describe, expect, it } from "vitest";
import { enUS } from "./en-US";
import { ptBR } from "./pt-BR";

function leafKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child)
      ? leafKeys(child as object, path)
      : [path];
  });
}

describe("translation catalogs", () => {
  it("keeps Portuguese and English keys in parity", () => {
    expect(leafKeys(enUS).sort()).toEqual(leafKeys(ptBR).sort());
  });
});
