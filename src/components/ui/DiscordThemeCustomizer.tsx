import { Dices, Pipette, Palette, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { AppColor, GradientConfig } from "../../domain/settings";
import { useTranslation } from "../../i18n";

export interface DiscordThemePreset {
  id: string;
  name: string;
  stops: [string, string];
  angle?: number;
  accent?: "ember" | "amber" | "green" | "red" | "blue" | "violet";
}

export const solidPresets: { id: AppColor; name: string; color: string; color2: string }[] = [
  { id: "slate", name: "Padrão (Titânio Escuro)", color: "#12151b", color2: "#181c24" },
];

export const discordPresets: DiscordThemePreset[] = [
  { id: "crimson-void", name: "Carmim Obscuro", stops: ["#41010d", "#080204"], accent: "red" },
  { id: "midnight-sapphire", name: "Safira Meia-Noite", stops: ["#0b1638", "#040714"], accent: "blue" },
  { id: "cyberpunk-violet", name: "Violeta Cyberpunk", stops: ["#320938", "#050a1e"], accent: "violet" },
  { id: "emerald-dusk", name: "Crepúsculo Esmeralda", stops: ["#0a2818", "#040d08"], accent: "green" },
  { id: "sunset-fire", name: "Fogo do Pôr do Sol", stops: ["#381408", "#0e0503"], accent: "amber" },
  { id: "amethyst-glow", name: "Brilho de Ametista", stops: ["#220b38", "#08020e"], accent: "violet" },
  { id: "deep-royal", name: "Azul Real Profundo", stops: ["#071a38", "#020712"], accent: "blue" },
  { id: "titanium-slate", name: "Titânio Metálico", stops: ["#161b24", "#0b0d10"], accent: "ember" },
  { id: "rose-velvet", name: "Veludo Rosa", stops: ["#380b20", "#0e0308"], accent: "red" },
  { id: "oceanic-abyss", name: "Abismo Oceânico", stops: ["#09262b", "#030c0e"], accent: "ember" },
  { id: "golden-amber", name: "Âmbar Dourado", stops: ["#2e1f06", "#0c0802"], accent: "amber" },
  { id: "neon-cyan", name: "Ciano Neon", stops: ["#072a38", "#031017"], accent: "blue" },
  { id: "plum-purple", name: "Roxo Ameixa", stops: ["#25092a", "#0a020b"], accent: "violet" },
  { id: "forest-pine", name: "Pinheiro Selvagem", stops: ["#0e2612", "#040b05"], accent: "green" },
  { id: "dark-obsidian", name: "Obsidian Puro", stops: ["#08090b", "#030405"], accent: "ember" },
  { id: "indigo-dawn", name: "Alvorada Índigo", stops: ["#160b38", "#05020d"], accent: "violet" },
  { id: "copper-glow", name: "Cobre Radiante", stops: ["#331b08", "#0b0502"], accent: "amber" },
  { id: "cobalt-sky", name: "Céu de Cobalto", stops: ["#082038", "#020912"], accent: "blue" },
];

const randomColors = [
  "#41010d", "#160b38", "#0b1638", "#320938", "#0a2818",
  "#381408", "#220b38", "#071a38", "#380b20", "#09262b",
  "#2e1f06", "#072a38", "#25092a", "#0e2612", "#331b08",
];

interface Props {
  config: GradientConfig;
  appColor: AppColor;
  onChangeGradient: (config: GradientConfig) => void;
  onSelectAppColor: (color: AppColor) => void;
}

export function DiscordThemeCustomizer({
  config,
  appColor,
  onChangeGradient,
  onSelectAppColor,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const applyPreset = (preset: DiscordThemePreset) => {
    onChangeGradient({
      enabled: true,
      type: "linear",
      angle: 135,
      intensity: config.intensity ?? 74,
      stops: [
        { color: preset.stops[0], position: 0 },
        { color: preset.stops[1], position: 100 },
      ],
    });
  };

  const applySolid = (color: AppColor) => {
    onSelectAppColor(color);
  };



  const updateColor = (index: number, color: string) => {
    const stops = [...config.stops];
    if (stops[index]) {
      stops[index] = { ...stops[index], color };
    } else {
      stops.push({ color, position: index * 100 });
    }
    onChangeGradient({
      ...config,
      enabled: true,
      stops,
    });
  };

  const addStop = () => {
    const darkColors = ["#090204", "#0a0308", "#050a1e", "#040714", "#040d08", "#0e0503"];
    const newColor = darkColors[Math.floor(Math.random() * darkColors.length)];
    const stops = [...config.stops];
    // Distribute positions evenly
    stops.push({ color: newColor, position: 100 });
    const step = 100 / (stops.length - 1 || 1);
    stops.forEach((s, i) => { s.position = Math.round(i * step); });
    onChangeGradient({
      ...config,
      enabled: true,
      stops,
    });
  };

  const removeStop = (index: number) => {
    if (config.stops.length <= 1) return;
    const stops = config.stops.filter((_, i) => i !== index);
    // Redistribute positions evenly
    const step = 100 / (stops.length - 1 || 1);
    stops.forEach((s, i) => { s.position = Math.round(i * step); });
    onChangeGradient({
      ...config,
      enabled: true,
      stops,
    });
  };

  const updateIntensity = (intensity: number) => {
    onChangeGradient({
      ...config,
      enabled: true,
      intensity,
    });
  };

  const randomize = () => {
    const c1 = randomColors[Math.floor(Math.random() * randomColors.length)];
    let c2 = randomColors[Math.floor(Math.random() * randomColors.length)];
    if (c2 === c1) c2 = "#050608";
    onChangeGradient({
      enabled: true,
      type: "linear",
      angle: 135,
      intensity: 75,
      stops: [
        { color: c1, position: 0 },
        { color: c2, position: 100 },
      ],
    });
  };

  const reset = () => {
    onChangeGradient({
      enabled: false,
      type: "linear",
      angle: 160,
      intensity: 74,
      stops: [
        { color: "#0b0d10", position: 0 },
        { color: "#12151b", position: 100 },
      ],
    });
  };

  const pickEyedropper = async (index: number) => {
    if ("EyeDropper" in window) {
      try {
        // @ts-expect-error EyeDropper API
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          updateColor(index, result.sRGBHex);
        }
      } catch {}
    }
  };

  return (
    <div className="discord-theme-section">
      <header className="discord-theme-header">
        <h3 className="discord-title-with-icon">
          <Sparkles size={17} className="discord-header-icon" />
          <span>Temas da interface</span>
        </h3>
        <p>Personalize a aparência do aplicativo com paletas sólidas ou gradientes dinâmicos.</p>
      </header>

      {/* Grid Unificado de Swatches Sólidos e Gradientes */}
      <div className="discord-swatches-grid">
        {/* Botão de Personalização (Ícone de Paleta) */}
        <button
          type="button"
          className={`discord-swatch discord-swatch-custom ${modalOpen ? "active" : ""}`}
          onClick={() => setModalOpen(true)}
          title="Personalizar tema com seletor de cores"
        >
          <Palette size={20} />
        </button>

        {/* 1. Swatches Sólidos (Titânio, Grafite, Obsidian, Menta, Oceano, Rosa) */}
        {solidPresets.map((solid) => {
          const isSelected = !config.enabled && appColor === solid.id;
          const bg = `linear-gradient(135deg, ${solid.color}, ${solid.color2})`;
          return (
            <button
              key={solid.id}
              type="button"
              className={`discord-swatch ${isSelected ? "active" : ""}`}
              style={{ background: bg }}
              onClick={() => applySolid(solid.id)}
              title={solid.name}
            />
          );
        })}

        {/* 2. Swatches Gradientes */}
        {discordPresets.map((preset) => {
          const bg = `linear-gradient(135deg, ${preset.stops[0]}, ${preset.stops[1]})`;
          const isSelected =
            config.enabled &&
            config.stops[0]?.color?.toLowerCase() === preset.stops[0].toLowerCase() &&
            config.stops[1]?.color?.toLowerCase() === preset.stops[1].toLowerCase();

          return (
            <button
              key={preset.id}
              type="button"
              className={`discord-swatch ${isSelected ? "active" : ""}`}
              style={{ background: bg }}
              onClick={() => applyPreset(preset)}
              title={preset.name}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ThemeCustomizerModal({
  config,
  onChangeGradient,
  onClose,
}: {
  config: GradientConfig;
  onChangeGradient: (config: GradientConfig) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const updateColor = (index: number, color: string) => {
    const stops = [...config.stops];
    if (stops[index]) {
      stops[index] = { ...stops[index], color };
    } else {
      stops.push({ color, position: index * 100 });
    }
    onChangeGradient({
      ...config,
      enabled: true,
      stops,
    });
  };

  const addStop = () => {
    const darkColors = ["#090204", "#0a0308", "#050a1e", "#040714", "#040d08", "#0e0503"];
    const newColor = darkColors[Math.floor(Math.random() * darkColors.length)];
    const stops = [...config.stops];
    stops.push({ color: newColor, position: 100 });
    const step = 100 / (stops.length - 1 || 1);
    stops.forEach((s, i) => { s.position = Math.round(i * step); });
    onChangeGradient({
      ...config,
      enabled: true,
      stops,
    });
  };

  const removeStop = (index: number) => {
    if (config.stops.length <= 1) return;
    const stops = config.stops.filter((_, i) => i !== index);
    const step = 100 / (stops.length - 1 || 1);
    stops.forEach((s, i) => { s.position = Math.round(i * step); });
    onChangeGradient({
      ...config,
      enabled: true,
      stops,
    });
  };

  const updateIntensity = (intensity: number) => {
    onChangeGradient({
      ...config,
      enabled: true,
      intensity,
    });
  };

  const randomize = () => {
    const randomColors = [
      "#41010d", "#160b38", "#0b1638", "#320938", "#0a2818",
      "#381408", "#220b38", "#071a38", "#380b20", "#09262b",
      "#2e1f06", "#072a38", "#25092a", "#0e2612", "#331b08",
    ];
    const c1 = randomColors[Math.floor(Math.random() * randomColors.length)];
    let c2 = randomColors[Math.floor(Math.random() * randomColors.length)];
    if (c2 === c1) c2 = "#050608";
    onChangeGradient({
      enabled: true,
      type: "linear",
      angle: 135,
      intensity: 75,
      stops: [
        { color: c1, position: 0 },
        { color: c2, position: 100 },
      ],
    });
  };

  const reset = () => {
    onChangeGradient({
      enabled: false,
      type: "linear",
      angle: 160,
      intensity: 74,
      stops: [
        { color: "#0b0d10", position: 0 },
        { color: "#12151b", position: 100 },
      ],
    });
  };

  const pickEyedropper = async (index: number) => {
    if ("EyeDropper" in window) {
      try {
        // @ts-expect-error EyeDropper API
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          updateColor(index, result.sRGBHex);
        }
      } catch {}
    }
  };

  return (
    <div className="discord-drawer-wrapper" onClick={onClose}>
      <div className="discord-floating-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="discord-modal-header">
          <span className="discord-title-with-icon">
            <Palette size={17} className="discord-header-icon" />
            <span>Personalizar tema</span>
          </span>
          <button type="button" onClick={onClose} title={t.common.close} aria-label={t.common.close}>
            <X size={18} />
          </button>
        </header>

        <div className="discord-modal-body">
          {/* Seção Cores */}
          <div className="discord-custom-section">
            <label className="discord-section-title">CORES</label>

            {/* Seletores dinâmicos de cor */}
            {config.stops.map((stop, index) => (
              <div className={`discord-color-row${index > 0 ? " margin-top" : ""}`} key={index}>
                <div
                  className="discord-color-box"
                  style={{ background: stop.color }}
                >
                  <input
                    type="color"
                    value={stop.color}
                    onChange={(e) => updateColor(index, e.target.value)}
                  />
                </div>
                <input
                  type="text"
                  className="discord-hex-input"
                  value={stop.color.toUpperCase()}
                  onChange={(e) => updateColor(index, e.target.value)}
                />
                {"EyeDropper" in window && (
                  <button
                    type="button"
                    className="discord-eyedrop-btn"
                    onClick={() => void pickEyedropper(index)}
                    title="Capturar cor da tela"
                  >
                    <Pipette size={16} />
                  </button>
                )}
                {config.stops.length > 1 && (
                  <button
                    type="button"
                    className="discord-eyedrop-btn discord-remove-stop-btn"
                    onClick={() => removeStop(index)}
                    title="Remover esta cor"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}

            {/* Botão Adicionar Cor */}
            <button
              type="button"
              className="discord-add-color-btn"
              onClick={addStop}
            >
              <Plus size={16} />
              <span>Adicionar cor</span>
            </button>
          </div>

          {/* Seção Controles (Intensidade) */}
          <div className="discord-custom-section">
            <div className="discord-slider-header">
              <label className="discord-section-title">INTENSIDADE DE COR</label>
              <span className="discord-slider-value">{config.intensity ?? 74}%</span>
            </div>
            <input
              type="range"
              className="discord-intensity-slider"
              min={10}
              max={100}
              value={config.intensity ?? 74}
              onChange={(e) => updateIntensity(Number(e.target.value))}
            />
          </div>

          {/* Seção Botões de Ação */}
          <div className="discord-action-buttons">
            <button type="button" className="discord-btn-random" onClick={randomize}>
              <Dices size={18} />
              <span>Surpreenda-me!</span>
            </button>
            <button type="button" className="discord-btn-reset" onClick={reset}>
              <RotateCcw size={16} />
              <span>Redefinir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
