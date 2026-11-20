import { useEffect, useRef, useState } from 'react';
import type { AppData } from '../types';

// Give Lively's own donation form, shown inside the page. Payment is handled entirely by Give Lively.
function GiveLivelyForm({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const slug = url.split('/donate/')[1]?.split(/[?#/]/)[0] || '';
  useEffect(() => {
    if (!slug) return;
    const s = document.createElement('script');
    s.src = `https://secure.givelively.org/widgets/branded_donation/${slug}.js`;
    document.head.appendChild(s);
    return () => { s.remove(); };
  }, [slug]);
  return (
    <div className="gl-wrap">
      <div ref={box} id="give-lively-widget" className="gl-branded-donation-widget" data-widget-src={`https://secure.givelively.org/donate/${slug}?ref=sd_widget`} />
      <p className="gl-help">Form not showing? <a href={url} target="_blank" rel="noreferrer">Open the donation page</a></p>
    </div>
  );
}

const DAYS: Record<string, string> = { Sun: 'Sundays', Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays' };

export function Give({ data }: { data: AppData }) {
  const [kind, setKind] = useState<'donate' | 'sponsor' | 'pledge'>('donate');
  const [showForm, setShowForm] = useState(false);
  // Sponsor a class
  const [cls, setCls] = useState('');
  const [honor, setHonor] = useState<'memory' | 'honor'>('memory');
  const [honoree, setHonoree] = useState('');
  // Pledge
  const [amount, setAmount] = useState('');
  // Contact (shared by sponsor and pledge)
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const teacher = (id: string) => data.teachers.find((t) => t.id === id)?.name;
  const live = data.schedule.weekly.map((w) => `${w.title}${teacher(w.teacherId) ? ' — ' + teacher(w.teacherId) : ''} (${DAYS[w.day] || w.day} ${w.time})`);
  const recorded = data.teachers.filter((t) => data.classes.some((c) => c.teacherId === t.id)).map((t) => `${t.name}’s recorded classes`);
  const mail = (subject: string, lines: string[]) => `mailto:${data.links.officeEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`;
  const contact = [`Name: ${name.trim()}`, `Phone: ${phone.trim()}`, email.trim() && `Email: ${email.trim()}`];
  const dedication = honoree.trim() ? `${honor === 'memory' ? 'In memory of' : 'In honor of'} ${honoree.trim()}` : '';
  const sponsorMail = mail('Sponsor a class', ['I’d like to sponsor a class on Virtual Midrash.', '', `Class: ${cls || 'Any class — please choose for me'}`, dedication && `Dedication: ${dedication}`, '', ...contact]);
  const pledgeMail = mail('Pledge to the SCA', ['I’d like to make a pledge to the SCA.', '', `Amount: $${amount.trim()}`, '', ...contact, '', 'Please contact me to arrange payment.']);
  const hasContact = name.trim() && phone.trim();
  const pick = (k: typeof kind) => { setKind(k); setShowForm(false); };

  return (
    <div className="page">
      <img className="give-logo" src="./brand/sca-primary-white.png" alt="Sephardic Community Alliance" />
      <div><h1 className="big">Keep the Torah flowing</h1><p className="muted">Your gift to the SCA keeps every class on Virtual Midrash free for the whole community.</p></div>
      <div className="seg three">
        <button className={kind === 'donate' ? 'on' : ''} aria-pressed={kind === 'donate'} onClick={() => pick('donate')}>Donate</button>
        <button className={kind === 'sponsor' ? 'on' : ''} aria-pressed={kind === 'sponsor'} onClick={() => pick('sponsor')}>Sponsor a class</button>
        <button className={kind === 'pledge' ? 'on' : ''} aria-pressed={kind === 'pledge'} onClick={() => pick('pledge')}>Pledge</button>
      </div>

      {kind === 'donate' && (showForm
        ? <GiveLivelyForm url={data.links.giveLively} />
        : <><button className="btn wide" onClick={() => setShowForm(true)}>Donate Now</button><p className="muted small center">Card, Apple Pay or Google Pay · Tax receipt by email</p></>)}

      {kind === 'sponsor' && <>
        <p className="muted">Dedicate a class in memory or in honor of someone. Your dedication is shown with the class.</p>
        <div className="field"><label htmlFor="g-class">Which class?</label>
          <select id="g-class" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">Any class — choose for me</option>
            {live.length > 0 && <optgroup label="Live classes this week">{live.map((l) => <option key={l}>{l}</option>)}</optgroup>}
            {recorded.length > 0 && <optgroup label="Recorded classes">{recorded.map((l) => <option key={l}>{l}</option>)}</optgroup>}
            <option>A full day of learning</option>
            <option>A full week of learning</option>
          </select>
        </div>
        <div className="field"><span className="field-label">Dedication</span>
          <div className="seg">
            <button className={honor === 'memory' ? 'on' : ''} aria-pressed={honor === 'memory'} onClick={() => setHonor('memory')}>In memory of</button>
            <button className={honor === 'honor' ? 'on' : ''} aria-pressed={honor === 'honor'} onClick={() => setHonor('honor')}>In honor of</button>
          </div>
          <label className="sr" htmlFor="g-honoree">Name for the dedication</label>
          <input id="g-honoree" value={honoree} onChange={(e) => setHonoree(e.target.value)} placeholder={honor === 'memory' ? 'Name of the person being remembered' : 'Name of the person being honored'} />
        </div>
      </>}

      {kind === 'pledge' && <>
        <p className="muted">Make a pledge now and pay later. The SCA office will contact you to arrange payment.</p>
        <div className="field"><label htmlFor="g-amount">Pledge amount</label>
          <div className="money"><span>$</span><input id="g-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" /></div>
        </div>
      </>}

      {kind !== 'donate' && <>
        <div className="field"><label htmlFor="g-name">Your name</label><input id="g-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="g-phone">Phone</label><input id="g-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="field"><label htmlFor="g-email">Email (optional)</label><input id="g-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        {kind === 'sponsor'
          ? <a className={'btn wide' + (hasContact ? '' : ' off')} aria-disabled={!hasContact} href={hasContact ? sponsorMail : undefined}>Send sponsorship request</a>
          : <a className={'btn wide' + (hasContact && amount.trim() ? '' : ' off')} aria-disabled={!(hasContact && amount.trim())} href={hasContact && amount.trim() ? pledgeMail : undefined}>Send my pledge</a>}
        <p className="muted small center">{hasContact ? 'Opens an email to the SCA office with these details filled in. Press send to finish.' : 'Add your name and phone so the office can reach you.'}</p>
        {kind === 'sponsor' && (showForm
          ? <GiveLivelyForm url={data.links.giveLively} />
          : <button className="btn wide ghost" onClick={() => setShowForm(true)}>Pay for it now</button>)}
      </>}
      <p className="muted tiny center">Dedicated in loving memory of Stanley Chera A”H by his family</p>
      <p className="muted small center"><a href="#/privacy">Privacy &amp; terms</a></p>
    </div>
  );
}
