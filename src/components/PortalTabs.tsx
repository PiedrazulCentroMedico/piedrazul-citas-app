import { NavLink } from 'react-router-dom';

interface PortalTabsProps {
  items: Array<{ to: string; label: string; icon?: string }>;
}

export function PortalTabs({ items }: PortalTabsProps) {
  return (
    <nav className="portal-tabs" aria-label="Secciones del portal">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) => `portal-tab ${isActive ? 'active' : ''}`}
        >
          {({ isActive }) => (
            <>
              {item.icon && <span className="nav-icon" aria-hidden="true">{item.icon}</span>}
              <span>{item.label}</span>
              {isActive && <span className="active-tab-badge">Estás aquí</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
