import { useEffect, useState } from 'react';

const STORAGE_KEYS = {
  contrast: 'pz-accessibility-contrast',
  fontLevel: 'pz-accessibility-font-level',
  boldText: 'pz-accessibility-bold-text',
  colorBlind: 'pz-accessibility-color-blind',
};

const MIN_FONT_LEVEL = -3;
const MAX_FONT_LEVEL = 6;

export function AccessibilityTools() {
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem(STORAGE_KEYS.contrast) === 'true');
  const [fontLevel, setFontLevel] = useState(() => Number(localStorage.getItem(STORAGE_KEYS.fontLevel) ?? 0));
  const [boldText, setBoldText] = useState(() => localStorage.getItem(STORAGE_KEYS.boldText) === 'true');
  const [colorBlindMode, setColorBlindMode] = useState(() => localStorage.getItem(STORAGE_KEYS.colorBlind) === 'true');

  useEffect(() => {
    document.body.classList.toggle('accessibility-contrast', highContrast);
    localStorage.setItem(STORAGE_KEYS.contrast, String(highContrast));
  }, [highContrast]);

  useEffect(() => {
    const safeLevel = Math.min(MAX_FONT_LEVEL, Math.max(MIN_FONT_LEVEL, fontLevel));
    document.body.style.setProperty('--accessibility-font-scale', `${100 + safeLevel * 5}%`);
    document.body.classList.toggle('accessibility-font-custom', safeLevel !== 0);
    localStorage.setItem(STORAGE_KEYS.fontLevel, String(safeLevel));
  }, [fontLevel]);

  useEffect(() => {
    document.body.classList.toggle('accessibility-bold', boldText);
    localStorage.setItem(STORAGE_KEYS.boldText, String(boldText));
  }, [boldText]);

  useEffect(() => {
    document.body.classList.toggle('accessibility-color-blind', colorBlindMode);
    localStorage.setItem(STORAGE_KEYS.colorBlind, String(colorBlindMode));
  }, [colorBlindMode]);

  const reduceFont = () => setFontLevel((current) => Math.max(MIN_FONT_LEVEL, current - 1));
  const increaseFont = () => setFontLevel((current) => Math.min(MAX_FONT_LEVEL, current + 1));

  return (
    <aside className="accessibility-tools" aria-label="Herramientas de accesibilidad">
      <button
        type="button"
        className="accessibility-toggle"
        aria-controls="accessibility-panel"
      >
        <span className="accessibility-main-label" aria-hidden="true">
          <span className="accessibility-word">{'AYUDA'.split('').map((letter, index) => <span key={`ayuda-${index}`}>{letter}</span>)}</span>
          <span className="accessibility-word">{'VISUAL'.split('').map((letter, index) => <span key={`visual-${index}`}>{letter}</span>)}</span>
        </span>
        <span className="sr-only">Ayuda visual</span>
      </button>

      <div id="accessibility-panel" className="accessibility-panel">
        <button type="button" onClick={() => setHighContrast((current) => !current)} title="Activar o desactivar alto contraste">
          ◐
          <span>Contraste</span>
        </button>
        <button type="button" onClick={reduceFont} title="Reducir tamaño de letra" disabled={fontLevel <= MIN_FONT_LEVEL}>
          A-
          <span>Reducir letra ({Math.abs(MIN_FONT_LEVEL)} niveles)</span>
        </button>
        <button type="button" onClick={increaseFont} title="Aumentar tamaño de letra" disabled={fontLevel >= MAX_FONT_LEVEL}>
          A+
          <span>Aumentar letra ({MAX_FONT_LEVEL} niveles)</span>
        </button>
        <button type="button" onClick={() => setBoldText((current) => !current)} title="Activar o desactivar negrita">
          B
          <span>Negrita</span>
        </button>
        <button type="button" onClick={() => setColorBlindMode((current) => !current)} title="Activar o desactivar modo daltónico: invierte y diferencia colores">
          C
          <span>Modo daltónico</span>
        </button>
      </div>
    </aside>
  );
}
