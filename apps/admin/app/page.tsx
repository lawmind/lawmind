import Link from 'next/link';

import { ADMIN_SCREENS } from '@lawmind/screens';

/**
 * The desk index. Eighteen sections, all reachable.
 *
 * `design/screens/SCREENS.md` heads this block "Admin — seventeen sections" and
 * then lists rows 55–72, which is eighteen. The count in the heading is wrong,
 * not the table; this page reads the table.
 */
export default function Page() {
  return (
    <article className="section">
      <p className="eyebrow">design/screens/SCREENS.md</p>
      <h1 className="section-title">{ADMIN_SCREENS.length} sections</h1>
      <ul className="index-list">
        {ADMIN_SCREENS.map((section) => (
          <li key={section.slug}>
            <Link className="index-row" href={section.route}>
              <span className="record index-number">{String(section.n).padStart(2, '0')}</span>
              <span>{section.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="section-stub">
        Shells only in Sprint 0. Admin renders are authoritative for layout; colour comes from the
        app’s tokens, not from the PNG.
      </p>
    </article>
  );
}
