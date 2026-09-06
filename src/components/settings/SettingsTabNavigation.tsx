import type { ReactNode, Ref } from "react";

export type SettingsTab = "personalizacao" | "downloads" | "arquivos" | "idioma" | "avancado";

export interface TabIndicator {
  left: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface TabItem {
  id: SettingsTab;
  label: string;
  icon: ReactNode;
}

interface Props {
  tabs: TabItem[];
  activeTab: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
  navRef: Ref<HTMLElement>;
  indicator: TabIndicator;
  animationsEnabled: boolean;
}

export function SettingsTabNavigation({
  tabs,
  activeTab,
  onSelect,
  navRef,
  indicator,
  animationsEnabled,
}: Props) {
  return (
    <nav
      className={`cfg-nav-tabs ${animationsEnabled ? "" : "cfg-nav-tabs--no-animation"}`}
      ref={navRef}
    >
      <span
        className="cfg-tabs-indicator"
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: indicator.width,
          height: indicator.height,
          opacity: indicator.visible ? 1 : 0,
        }}
        aria-hidden="true"
      />
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`cfg-tab-btn ${isActive ? "is-active" : ""}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className="cfg-tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}