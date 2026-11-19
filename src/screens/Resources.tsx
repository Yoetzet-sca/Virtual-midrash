import { useState } from 'react';
import type { AppData, Resource } from '../types';
import { usePrefs } from '../store';
import { CodeBox, ErubCard, useUnlocked } from '../ui';

const pretty = (p: string) => { const d = p.replace(/\D/g, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

function Entry({ r }: { r: Resource }) {
  const phone = useUnlocked(r.lockedPhone) || r.phone || '';
  const email = useUnlocked(r.lockedEmail || '') || r.email || '';
  const locked = !phone && !email && !!(r.lockedPhone || r.lockedEmail);
  const digits = phone.replace(/[^\d+]/g, '');
  return (
    <div className="entry">
      <span><b>{r.name}</b><span className="muted small">{[phone && pretty(phone), r.area, r.note].filter(Boolean).join(' · ') || (locked ? 'Contact details locked' : '')}</span></span>
      <span className="actions">
        {phone && <a className="btn small" href={'tel:' + digits}>Call</a>}
        {phone && !r.open && <a className="btn small ghost" href={'sms:' + digits}>Text</a>}
        {email && <a className="btn small ghost" href={'mailto:' + email}>Email</a>}
      </span>
    </div>
  );
}

export function Resources({ data }: { data: AppData }) {
  const { code } = usePrefs();
  const [open, setOpen] = useState('');
  const anyLocked = data.resources.some((r) => r.lockedPhone || r.lockedEmail);
  return (
    <div className="page">
      <div className="head"><div><h1>Community Resources</h1><p className="muted">The people and services our community relies on</p></div><img className="sca" src="./brand/sca-icon-white.png" alt="Sephardic Community Alliance" /></div>
      <div className="label">ERUB</div>
      <ErubCard erub={data.erub} compact />
      <div className="label">FIND SOMEONE</div>
      {anyLocked && !code && <CodeBox data={data} what="phone numbers and emails" />}
      {data.resourceCategories.map((cat) => {
        const list = data.resources.filter((r) => r.category === cat);
        const isOpen = open === cat;
        return (
          <div className="panel col tight" key={cat}>
            <button className="accordion" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : cat)}><span>{cat}</span><span className="accent sign">{isOpen ? '−' : '+'}</span></button>
            {isOpen && (list.length ? list.map((r, i) => <Entry key={i} r={r} />) : <p className="muted small pad">Listings are being added. Contact the SCA office for a referral.</p>)}
          </div>
        );
      })}
    </div>
  );
}
