import { notFound } from 'next/navigation';

import { screenByNumber } from '@lawmind/screens';

/**
 * Sprint 0 ships SHELLS. Each names the section and the render it is built
 * from, so the next sprint opens the right drawing.
 *
 * PD-11 — six admin sections deliberately have no golden render: they are built
 * and clickable in `design/screens/LawMind Admin.dc.html`, and the live file is
 * the reference. That is not the same thing as NOT YET DESIGNED, and this shell
 * says which it is rather than leaving the cell empty.
 *
 * Admin renders are authoritative for LAYOUT ONLY — the desk still carries the
 * v2 palette. Colour comes from the tokens, not from the PNG.
 */
export function SectionShell({ n }: { n: number }) {
  const section = screenByNumber(n);
  if (!section || section.surface !== 'admin') notFound();

  return (
    <article className="section">
      <p className="eyebrow">{section.group}</p>
      <h1 className="section-title">{section.title}</h1>

      <div className="card section-reference">
        <Row label="Inventory row" value={`#${section.n}`} />
        <Row label="Render" value={section.render ?? 'live canvas — LawMind Admin.dc.html'} />
      </div>

      {section.notes ? <p className="section-notes">{section.notes}</p> : null}

      <p className="section-stub">Shell only — no business logic in Sprint 0.</p>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="section-row">
      <span className="eyebrow section-row-label">{label}</span>
      <span className="record">{value}</span>
    </div>
  );
}
