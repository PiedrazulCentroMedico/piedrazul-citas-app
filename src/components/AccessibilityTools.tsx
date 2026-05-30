import { useEffect, useState } from 'react';

type FontSize = 'normal' | 'large' | 'extra-large';

const STORAGE_KEYS = {
  contrast: 'pz-accessibility-contrast',
  fontSize: 'pz-accessibility-font-size',
};

export function AccessibilityTools() {
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem(STORAGE_KEYS.contrast) === 'true');
  const [fontSize, setFontSize] = useState<FontSize>(() => (localStorage.getItem(STORAGE_KEYS.fontSize) as FontSize) || 'normal');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('accessibility-contrast', highContrast);
    localStorage.setItem(STORAGE_KEYS.contrast, String(highContrast));
  }, [highContrast]);

  useEffect(() => {
    document.body.classList.remove('font-large', 'font-extra-large');
    if (fontSize === 'large') document.body.classList.add('font-large');
    if (fontSize === 'extra-large') document.body.classList.add('font-extra-large');
    localStorage.setItem(STORAGE_KEYS.fontSize, fontSize);
  }, [fontSize]);

  const reduceFont = () => {
    setFontSize((current) => {
      if (current === 'extra-large') return 'large';
      if (current === 'large') return 'normal';
      return 'normal';
    });
  };

  const increaseFont = () => {
    setFontSize((current) => {
      if (current === 'normal') return 'large';
      if (current === 'large') return 'extra-large';
      return 'extra-large';
    });
  };

  const resetTools = () => {
    setHighContrast(false);
    setFontSize('normal');
  };

  return (
    <aside className={`accessibility-tools ${open ? 'is-open' : ''}`} aria-label="Herramientas de accesibilidad">
      <button
        type="button"
        className="accessibility-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="accessibility-panel"
      >
        ♿
        <span>Ayuda visual</span>
      </button>

      <div id="accessibility-panel" className="accessibility-panel">
        <button type="button" onClick={() => setHighContrast((current) => !current)} title="Activar o desactivar alto contraste">
          ◐
          <span>Contraste</span>
        </button>
        <button type="button" onClick={reduceFont} title="Reducir tamaño de letra">
          A-
          <span>Reducir letra</span>
        </button>
        <button type="button" onClick={increaseFont} title="Aumentar tamaño de letra">
          A+
          <span>Aumentar letra</span>
        </button>
        <button type="button" onClick={resetTools} title="Restablecer ayudas visuales">
          ↺
          <span>Restablecer</span>
        </button>
      </div>
    </aside>
  );
}
