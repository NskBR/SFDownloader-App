import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import type { LucideProps } from "lucide-react";
import { Settings } from "kineticons";

export function kineticIcon(Icon: typeof Settings, name: string) {
  function Kinetic({ size = 24, className, style, color, "aria-label": label }: LucideProps) {
    const root = useRef<HTMLSpanElement>(null);
    const [active, setActive] = useState(false);
    useEffect(() => {
      const element = root.current;
      if (!element) return;
      const target = element.closest<HTMLElement>("button,a,[role='button'],[role='tab']") ?? element;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      let hovered = false;
      let focused = false;
      const update = () => setActive((hovered || focused) && !reduced?.matches
        && !target.matches(":disabled,[aria-disabled='true']"));
      const enter = () => { hovered = true; update(); };
      const leave = () => { hovered = false; update(); };
      const focus = () => { focused = target.matches(":focus-visible"); update(); };
      const blur = () => { focused = false; update(); };
      target.addEventListener("mouseenter", enter);
      target.addEventListener("mouseleave", leave);
      target.addEventListener("focusin", focus);
      target.addEventListener("focusout", blur);
      reduced?.addEventListener("change", update);
      return () => {
        target.removeEventListener("mouseenter", enter);
        target.removeEventListener("mouseleave", leave);
        target.removeEventListener("focusin", focus);
        target.removeEventListener("focusout", blur);
        reduced?.removeEventListener("change", update);
      };
    }, []);
    const iconProps: ComponentProps<typeof Settings> = {
      variant: "filled", trigger: "manual", active, size,
    };
    return <span ref={root} className={`sf-animated-icon sf-kinetic-icon ${className ?? ""}`}
      data-icon={name} data-animating={active} aria-hidden={label ? undefined : true}
      aria-label={label} style={{ ...style, color: color ?? style?.color }}>
      <Icon {...iconProps}/>
    </span>;
  }
  Kinetic.displayName = `Kineticons(${name})`;
  return Kinetic;
}

