import Link from 'next/link';

import { ADMIN_SCREENS } from '@lawmind/screens';

/**
 * The admin desk navigation — one entry per section of the inventory.
 *
 * ZERO GILT. The identity mark is gilt placement 2 and the only ornament this
 * app is entitled to; every section itself has a budget of none. There is no
 * accent here either: the sidebar is structure, and structure is ink and rules.
 */
export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-mark">
        <span className="eyebrow">Lawmind</span>
        <span className="record">admin</span>
      </div>
      <ul className="sidebar-list">
        {ADMIN_SCREENS.map((section) => (
          <li key={section.slug}>
            <Link className="sidebar-link" href={section.route}>
              <span className="record sidebar-number">{String(section.n).padStart(2, '0')}</span>
              <span>{section.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
