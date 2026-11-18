import { useState } from 'react';
import type { AppData } from '../types';

// Payment happens on SCA's Give Lively page (opens in the browser). Sponsorships and
// "bill me" requests go to the SCA office by email, the same way they are handled today.
export function Give({ data }: { data: AppData }) {
  const [kind, setKind] = useState<'donate' | 'sponsor'>('donate');
  const [pay, setPay] = useState<'now' | 'bill'>('now');
  const [dedication, setDedication] = useState('');
  const [fund, setFund] = useState('');
  const mail = (subject: string, lines: string[]) => `mailto:${data.links.officeEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`;
  const ded = dedication.trim() ? `Dedication: ${dedication.trim()}` : '';
  const billMail = mail(kind === 'sponsor' ? 'Sponsor a class — please bill me' : 'Donation — please bill me', [
    kind === 'sponsor' ? 'I’d like to sponsor a class on Virtual Midrash.' : 'I’d like to make a donation to the SCA.', ded,
    fund.trim() ? `Please bill me so I can pay through: ${fund.trim()}` : 'Please send me a bill.', '', 'Name:', 'Phone:']);
  const sponsorMail = mail('I’d like to sponsor a class', ['I’d like to sponsor a class on Virtual Midrash.', ded, '', 'Name:', 'Phone:']);
  return (
    <div className="page">
      <div className="lockup"><img src="./brand/sca-icon-white.png" alt="" /><b>SEPHARDIC<br />COMMUNITY<br />ALLIANCE</b></div>
      <div><h1 className="big">Keep the Torah flowing</h1><p className="muted">Your gift to the SCA keeps every class on Virtual Midrash free for the whole community.</p></div>
      <div className="seg">
        <button className={kind === 'donate' ? 'on' : ''} aria-pressed={kind === 'donate'} onClick={() => setKind('donate')}>Donate</button>
        <button className={kind === 'sponsor' ? 'on' : ''} aria-pressed={kind === 'sponsor'} onClick={() => setKind('sponsor')}>Sponsor a class</button>
      </div>
      {kind === 'sponsor' && <p className="muted">Dedicate a class, a day or a week of learning in honor or in memory of someone. Your dedication appears with the class. The SCA office will confirm the details with you.</p>}
      <div className="field"><label htmlFor="ded">Dedication (optional)</label><input id="ded" value={dedication} onChange={(e) => setDedication(e.target.value)} placeholder="In honor or in memory of…" /></div>
      <div className="field"><span className="field-label">How would you like to pay?</span>
        <div className="two">
          <button className={'opt' + (pay === 'now' ? ' on' : '')} aria-pressed={pay === 'now'} onClick={() => setPay('now')}><b>Pay now</b><span>Card, Apple Pay or Google Pay through Give Lively</span></button>
          <button className={'opt' + (pay === 'bill' ? ' on' : '')} aria-pressed={pay === 'bill'} onClick={() => setPay('bill')}><b>Bill me</b><span>Get an invoice you can pay through JCF or another fund</span></button>
        </div>
      </div>
      {pay === 'bill' && <div className="field"><label htmlFor="fund">Fund or foundation</label><input id="fund" value={fund} onChange={(e) => setFund(e.target.value)} placeholder="JCF or another donor fund" /></div>}
      {pay === 'bill' ? <a className="btn wide" href={billMail}>Email the office to bill me</a>
        : kind === 'donate' ? <a className="btn wide" href={data.links.giveLively} target="_blank" rel="noreferrer">Donate on Give Lively</a>
          : <><a className="btn wide" href={sponsorMail}>Request a sponsorship</a><a className="btn wide ghost" href={data.links.giveLively} target="_blank" rel="noreferrer">Pay for a sponsorship on Give Lively</a></>}
      <p className="muted small center">{pay === 'bill' ? 'Opens an email to the SCA office, who will send your invoice.' : 'Secure checkout by Give Lively · Tax receipt by email'}</p>
      <p className="muted tiny center">Dedicated in loving memory of Stanley Chera A”H by his family</p>
    </div>
  );
}
