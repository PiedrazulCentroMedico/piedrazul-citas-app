import { useEffect, useState } from 'react';

interface CurrentClockWidgetProps {
  compact?: boolean;
}

export function CurrentClockWidget({ compact = false }: CurrentClockWidgetProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hour = now.toLocaleTimeString('es-CO', { hour: '2-digit', hour12: false });
  const minute = now.toLocaleTimeString('es-CO', { minute: '2-digit' });
  const second = now.toLocaleTimeString('es-CO', { second: '2-digit' });
  const dateLabel = now.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  });
  const year = now.getFullYear();

  return (
    <aside className={`patient-clock-widget global-clock-widget ${compact ? 'clock-compact' : ''}`} aria-label="Hora y fecha actual" title="Hora y fecha actual">
      <div className="watch">
        <div className="frame">
          <div className="text">
            <div>{hour}</div>
            <div>{minute}</div>
          </div>
          <span className="clock-seconds">:{second}</span>
        </div>
        <div className="sideBtn" />
        <div className="powerBtn" />
        <div className="dots" aria-hidden="true">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      </div>
      <div className="clock-date-card">
        <span>Hoy</span>
        <strong>{dateLabel}</strong>
        <small>{year}</small>
      </div>
    </aside>
  );
}
