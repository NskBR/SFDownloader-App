import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomSelect } from "./CustomSelect";

describe("CustomSelect", () => {
  it("opens and selects an option with the keyboard", () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        ariaLabel="Limite de downloads simultâneos"
        value="one"
        options={[
          { value: "one", label: "1" },
          { value: "two", label: "2" },
          { value: "three", label: "3" },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Limite de downloads simultâneos" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("two");
  });

  it("skips disabled options while navigating", () => {
    const onChange = vi.fn();
    render(
      <CustomSelect
        ariaLabel="Escolha um valor"
        value="one"
        options={[
          { value: "one", label: "1" },
          { value: "two", label: "2", disabled: true },
          { value: "three", label: "3" },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Escolha um valor" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("three");
  });
});
