// LexClock App — interactive approval-flow prototype
const { useState, useEffect, useRef, useCallback } = React;

const RATE = 325; // $/hr
const money = (hrs) => '$' + (hrs * RATE).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------- Icons ----------
const I = {
  check: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>,
  clock: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  mail: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>,
  doc: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,
  task: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 11l3 3 8-8"/><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>,
  inbox: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 6h13l3.5 6v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/></svg>,
  folder: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  settings: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.1A1.6 1.6 0 0 0 9 1.1V1a2 2 0 0 1 4 0v.1A1.6 1.6 0 0 0 17 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.1 1.5H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>,
  why: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M9.3 9a2.7 2.7 0 0 1 5.2 1c0 2-2.7 2.5-2.7 2.5"/><path d="M12 16.5h.01"/></svg>,
  x: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  edit: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>,
  bolt: (p={}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>,
};

const logoSvg = (
  <svg viewBox="0 0 64 64" width="28" height="28">
    <circle cx="32" cy="32" r="26" fill="none" stroke="#fff" strokeWidth="3.6"/>
    <line x1="32" y1="9.5" x2="32" y2="14.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"/>
    <line x1="54.5" y1="32" x2="49.5" y2="32" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"/>
    <line x1="32" y1="54.5" x2="32" y2="49.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"/>
    <line x1="9.5" y1="32" x2="14.5" y2="32" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"/>
    <line x1="32" y1="32" x2="23" y2="40.5" stroke="#fff" strokeWidth="4.4" strokeLinecap="round"/>
    <line x1="32" y1="32" x2="47.5" y2="20" stroke="#F2A341" strokeWidth="4.4" strokeLinecap="round"/>
    <circle cx="32" cy="32" r="3.3" fill="#fff"/>
  </svg>
);

// ---------- Seed data ----------
const SEED = [
  { id:'e1', hours:0.4, client:'Henderson v. Atlas Freight', matter:'Litigation',
    desc:"Reviewed opposing counsel's proposed discovery amendments; responded re: extension and flagged two deposition-date conflicts with the pretrial conference.",
    conf:94, source:'Gmail', sourceIcon:'mail', evidence:'Re: Amended discovery schedule', evMeta:'Today · 9:42 AM',
    why:"You sent an email to opposing counsel responding to a 6-paragraph thread about the discovery schedule. LexClock matched it to Henderson v. Atlas Freight by recipient domain and matter history, and estimated 0.4 hr from thread length and your 21 minutes of active drafting.",
    from:'Robert Wills → Daniel Reyes (opposing counsel)',
    subj:'Re: Amended discovery schedule',
    snip:"Daniel — I've reviewed your proposed amendments. We can agree to the extension on document production, but <mark>the two deposition dates conflict with the pretrial conference</mark>. Proposing alternatives below…" },
  { id:'e2', hours:0.3, client:'Coastal Holdings LLC', matter:'Transactional',
    desc:"Reviewed redline of commercial lease §§4–7; drafted summary of indemnification changes for client.",
    conf:91, source:'Outlook', sourceIcon:'doc', evidence:'Lease_redline_v4.docx', evMeta:'Today · 11:18 AM',
    why:"You had Lease_redline_v4.docx open for 18 active minutes, then emailed the client a summary referencing §§4–7. Matched to Coastal Holdings by recipient and matter history. Duration estimated from active document time.",
    from:'Robert Wills → m.tan@coastalholdings.com',
    subj:'Lease redline — summary of indemnification changes',
    snip:"Marcus — attached is my summary of the changes to <mark>sections 4 through 7</mark>. The indemnification language in §6 is the one to watch; I'd recommend we push back on the carve-out…" },
  { id:'e3', hours:0.2, client:'Estate of M. Okafor', matter:'Probate',
    desc:"Call with client re: executor responsibilities and timeline for filing the inventory of assets.",
    conf:72, source:'Tasks', sourceIcon:'task', evidence:'Logged call · 12 min', evMeta:'Today · 1:30 PM',
    why:"A 12-minute call was logged with a contact tied to the Estate of M. Okafor matter, followed by a task you marked complete: 'Explain inventory filing timeline.' Confidence is medium because no email confirmed the call's substance — please verify the description.",
    from:'Logged call · Imelda Okafor (executor)',
    subj:'Inbound call — 12 min',
    snip:"Call logged from contact <mark>Imelda Okafor</mark>, linked to Estate of M. Okafor. Associated completed task: 'Explain inventory filing timeline to executor.'" },
  { id:'e4', hours:0.6, client:'Nguyen Employment Matter', matter:'Litigation',
    desc:"Drafted demand letter to former employer regarding unpaid commissions; incorporated client's documentation of three disputed deals.",
    conf:88, source:'Gmail', sourceIcon:'doc', evidence:'Demand_letter_draft.docx', evMeta:'Today · 2:47 PM',
    why:"You created and edited Demand_letter_draft.docx for 34 active minutes, with content referencing three commission disputes. Matched to the Nguyen Employment Matter by client name in the document and a preceding intake email.",
    from:'Document · Demand_letter_draft.docx',
    subj:'Demand letter — unpaid commissions',
    snip:"Draft demand letter references <mark>three disputed commission payments</mark> from Q3 and Q4, totaling the amounts your client documented in the intake questionnaire…" },
  { id:'e5', hours:0.1, client:'Coastal Holdings LLC', matter:'Transactional',
    desc:"Brief email to client confirming receipt of signed lease amendment and next steps for recording.",
    conf:96, source:'Outlook', sourceIcon:'mail', evidence:'Re: Signed amendment', evMeta:'Today · 3:55 PM',
    why:"A short confirmation email to the Coastal Holdings client thread. Matched with high confidence by recipient and matter. Estimated 0.1 hr (6 minutes) — the minimum billing increment — from the brief reply length.",
    from:'Robert Wills → m.tan@coastalholdings.com',
    subj:'Re: Signed amendment',
    snip:"Got it, thanks Marcus. I'll have this <mark>recorded with the county</mark> by Thursday and send you the stamped copy once it's back…" },
];

const confClass = (c) => c >= 85 ? 'conf-high' : c >= 60 ? 'conf-med' : 'conf-low';
const confLabel = (c) => c >= 85 ? 'High confidence' : c >= 60 ? 'Medium' : 'Needs a look';

// ---------- Confetti ----------
function burst(x, y) {
  const colors = ['#E8842B','#F2A341','#2E9E6B','#1B6FA8'];
  for (let i=0;i<14;i++){
    const s=document.createElement('div'); s.className='spark';
    s.style.left=x+'px'; s.style.top=y+'px'; s.style.background=colors[i%colors.length];
    document.body.appendChild(s);
    const ang=Math.random()*Math.PI*2, dist=40+Math.random()*70;
    const dx=Math.cos(ang)*dist, dy=Math.sin(ang)*dist-30;
    s.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx}px,${dy+90}px) rotate(${Math.random()*360}deg) scale(.4)`,opacity:0}],
      {duration:700+Math.random()*300,easing:'cubic-bezier(.2,.7,.2,1)'}).onfinish=()=>s.remove();
  }
}

// ---------- Entry Card ----------
function EntryCard({ entry, onApprove, onSkip, onEvidence, onSave }) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(entry.hours);
  const [desc, setDesc] = useState(entry.desc);
  const [state, setState] = useState('idle'); // idle | approving | leaving
  const btnRef = useRef(null);

  const doApprove = () => {
    if (btnRef.current){ const r=btnRef.current.getBoundingClientRect(); burst(r.left+r.width/2, r.top+r.height/2); }
    setState('approving');
    setTimeout(()=>setState('leaving'), 280);
    setTimeout(()=>onApprove(entry.id, {...entry, hours:parseFloat(hours)||entry.hours, desc}), 620);
  };
  const doSkip = () => { setState('leaving'); setTimeout(()=>onSkip(entry.id), 360); };
  const saveEdit = () => { setEditing(false); onSave(entry.id, {hours:parseFloat(hours)||entry.hours, desc}); };

  return (
    <div className={'entry fade-in'+(state==='approving'?' approving':'')+(state==='leaving'?' leaving':'')}>
      <div className="top">
        <div className="time-col">
          <span className="time">{(parseFloat(hours)||entry.hours).toFixed(1)}</span>
          <span className="amt">hrs · {money(parseFloat(hours)||entry.hours)}</span>
        </div>
        <div className="mid">
          <div className="client">{entry.client} · {entry.matter}</div>
          {editing
            ? <textarea className="desc-edit" value={desc} onChange={e=>setDesc(e.target.value)} />
            : <div className="desc">{desc}</div>}
          {editing && (
            <div className="edit-row">
              <div className="edit-field">
                <label>Hours</label>
                <input className="time-in" type="number" step="0.1" min="0.1" value={hours} onChange={e=>setHours(e.target.value)} />
              </div>
              <div style={{flex:1}}></div>
              <button className="btn btn-secondary btn-sm" onClick={()=>{setEditing(false);setHours(entry.hours);setDesc(entry.desc);}}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save changes</button>
            </div>
          )}
          {!editing && (
            <div className="chips">
              <span className={'chip '+confClass(entry.conf)}><span className="dot"></span>{confLabel(entry.conf)} · {entry.conf}%</span>
              <span className="chip chip-source">{entry.source}</span>
              <button className="chip chip-ev" onClick={()=>onEvidence(entry)}>{I[entry.sourceIcon]({})}{entry.evidence}</button>
            </div>
          )}
        </div>
      </div>
      {!editing && (
        <div className="actions">
          <button ref={btnRef} className="btn btn-approve btn-sm" onClick={doApprove}>{I.check({})}Approve &amp; bill</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setEditing(true)}>{I.edit({})}Edit</button>
          <button className="btn btn-ghost btn-sm" onClick={doSkip}>Skip</button>
          <button className="why-btn" onClick={()=>onEvidence(entry)}>{I.why({})}Show evidence</button>
        </div>
      )}
    </div>
  );
}

// ---------- Evidence Drawer ----------
function Drawer({ entry, onClose, onApprove }) {
  const [mounted, setMounted] = useState(false);
  const [fill, setFill] = useState(0);
  useEffect(()=>{
    if (entry){ requestAnimationFrame(()=>{ setMounted(true); setTimeout(()=>setFill(entry.conf),120); }); }
    else { setMounted(false); setFill(0); }
  },[entry]);
  if (!entry) return null;
  return (
    <React.Fragment>
      <div className={'drawer-scrim'+(mounted?' open':'')} onClick={onClose}></div>
      <aside className={'drawer'+(mounted?' open':'')}>
        <div className="dh">
          {I.why({style:{width:20,height:20,color:'var(--ocean-600)'}})}
          <h3>Why LexClock suggested this</h3>
          <button className="x" onClick={onClose}>{I.x({})}</button>
        </div>
        <div className="db">
          <div className="d-time">{entry.hours.toFixed(1)} hrs <span style={{fontSize:15,color:'var(--muted)',fontWeight:600}}>· {money(entry.hours)}</span></div>
          <div className="d-client">{entry.client} · {entry.matter}</div>
          <div className="d-desc">{entry.desc}</div>

          <div className="conf-meter">
            <div className="cm-top"><span>Confidence</span><span style={{fontVariantNumeric:'tabular-nums'}}>{entry.conf}% · {confLabel(entry.conf)}</span></div>
            <div className="track"><div className="fill" style={{width:fill+'%', background: entry.conf>=85?'var(--green-600)':entry.conf>=60?'var(--ocean-600)':'var(--muted)'}}></div></div>
          </div>

          <div className="why">
            <div className="h">{I.bolt({})} The reasoning</div>
            <p>{entry.why}</p>
          </div>

          <div className="ev-label">Source evidence</div>
          <div className="source-card">
            <div className="sh">{I[entry.sourceIcon]({})} {entry.source} <span className="meta">{entry.evMeta}</span></div>
            <div className="sb-body">
              <div className="from">{entry.from}</div>
              <div className="subj">{entry.subj}</div>
              <div className="snip" dangerouslySetInnerHTML={{__html: entry.snip}}></div>
            </div>
          </div>
        </div>
        <div className="df">
          <button className="btn btn-approve" onClick={()=>{onApprove(entry.id, entry); onClose();}}>{I.check({})}Approve &amp; bill</button>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </aside>
    </React.Fragment>
  );
}

// ---------- App ----------
function App() {
  const [tab, setTab] = useState('review');
  const [queue, setQueue] = useState(SEED);
  const [approved, setApproved] = useState([]);
  const [drawer, setDrawer] = useState(null);
  const [toasts, setToasts] = useState([]);
  const lastSkip = useRef(null);

  const pushToast = (node, key) => {
    const id = key || Math.random().toString(36).slice(2);
    setToasts(t=>[...t,{id,node}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)), 4200);
  };

  const approve = (id, data) => {
    setQueue(q=>{
      const item = q.find(e=>e.id===id); if(!item) return q;
      const final = {...item, ...data};
      setApproved(a=>[{...final, approvedAt:Date.now()}, ...a]);
      pushToast(<React.Fragment><span className="ic">{I.check({})}</span><span>Approved &amp; billed to Clio — <b>{money(final.hours)}</b></span></React.Fragment>);
      return q.filter(e=>e.id!==id);
    });
  };
  const skip = (id) => {
    setQueue(q=>{
      const item=q.find(e=>e.id===id); lastSkip.current=item;
      pushToast(<React.Fragment><span className="ic" style={{background:'var(--muted)'}}>{I.x({})}</span><span>Entry skipped</span><button className="undo" onClick={undoSkip}>Undo</button></React.Fragment>);
      return q.filter(e=>e.id!==id);
    });
  };
  const undoSkip = () => { if(lastSkip.current){ setQueue(q=>[lastSkip.current,...q]); lastSkip.current=null; setToasts([]); } };
  const saveEdit = (id, data) => setQueue(q=>q.map(e=>e.id===id?{...e,...data}:e));

  const approveAll = () => {
    queue.forEach((e,i)=> setTimeout(()=>approve(e.id, e), i*90));
  };

  const pendingHours = queue.reduce((s,e)=>s+e.hours,0);
  const approvedHours = approved.reduce((s,e)=>s+e.hours,0);
  const capturedHours = pendingHours + approvedHours;

  return (
    <div className="app">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sb-brand">{logoSvg}<span>Lex<span className="clk">Clock</span></span></div>
        <div className="sb-section">Timekeeping</div>
        <button className={'sb-item'+(tab==='review'?' active':'')} onClick={()=>setTab('review')}>{I.inbox({})}Review queue {queue.length>0 && <span className="count">{queue.length}</span>}</button>
        <button className={'sb-item'+(tab==='approved'?' active':'')} onClick={()=>setTab('approved')}>{I.check({})}Approved {approved.length>0 && <span className="count muted">{approved.length}</span>}</button>
        <div className="sb-section">Firm</div>
        <button className="sb-item" onClick={()=>pushToast(<React.Fragment><span className="ic" style={{background:'var(--ocean-600)'}}>{I.folder({})}</span><span>Matters — demo only</span></React.Fragment>)}>{I.folder({})}Matters</button>
        <button className="sb-item" onClick={()=>pushToast(<React.Fragment><span className="ic" style={{background:'var(--ocean-600)'}}>{I.settings({})}</span><span>Settings — demo only</span></React.Fragment>)}>{I.settings({})}Sources &amp; settings</button>
        <div className="sb-spacer"></div>
        <div className="sb-user"><span className="av">RW</span><div><div className="nm">Robert Wills</div><div className="role">Wills Law · $325/hr</div></div></div>
      </nav>

      {/* Main */}
      <div className="main">
        <header className="topbar">
          <div>
            <h1>{tab==='review'?'Review queue':'Approved today'}</h1>
            <div className="sub">{tab==='review'?'Drafts captured from your work — nothing bills until you approve.':'Entries you approved are syncing to Clio.'}</div>
          </div>
          <div className="right">
            <span className="sync"><span className="pulse"></span>Synced with Clio</span>
          </div>
        </header>

        <div className="scroll">
          <div className="content">
            {/* Summary */}
            <div className="summary">
              <div className="stat"><div className="lab">{I.clock({})}Captured today</div><div className="v">{capturedHours.toFixed(1)}<span style={{fontSize:16,color:'var(--muted)',fontWeight:600}}> hrs</span></div><div className="d">{money(capturedHours)} of billable work found</div></div>
              <div className="stat"><div className="lab">{I.inbox({})}Awaiting approval</div><div className="v orange">{queue.length}</div><div className="d">{pendingHours.toFixed(1)} hrs · {money(pendingHours)} pending</div></div>
              <div className="stat"><div className="lab">{I.check({})}Approved &amp; billed</div><div className="v green">{money(approvedHours)}</div><div className="d">{approved.length} {approved.length===1?'entry':'entries'} synced to Clio</div></div>
            </div>

            {tab==='review' ? (
              queue.length === 0 ? (
                <div className="empty fade-in">
                  <div className="ring">{I.check({style:{width:38,height:38}})}</div>
                  <h3>All caught up.</h3>
                  <p>Every draft has been reviewed. New entries will appear here as LexClock captures your work — and nothing will bill until you approve it.</p>
                  <div className="total"><span className="v">{money(approvedHours)}</span><span className="l">Billed today · {approved.length} entries</span></div>
                </div>
              ) : (
                <React.Fragment>
                  <div className="q-head">
                    <h2>Drafts to review</h2>
                    <span className="pill">{queue.length}</span>
                    <button className="btn btn-secondary btn-sm approve-all" onClick={approveAll}>{I.check({})}Approve all ({money(pendingHours)})</button>
                  </div>
                  {queue.map(e=>(
                    <EntryCard key={e.id} entry={e} onApprove={approve} onSkip={skip} onEvidence={setDrawer} onSave={saveEdit} />
                  ))}
                </React.Fragment>
              )
            ) : (
              approved.length === 0 ? (
                <div className="empty fade-in"><div className="ring" style={{background:'var(--surface-2)'}}>{I.check({style:{width:38,height:38,color:'var(--muted)'}})}</div><h3>Nothing approved yet.</h3><p>Approve a draft from the review queue and it'll appear here, billed to Clio.</p></div>
              ) : (
                <React.Fragment>
                  <div className="q-head"><h2>Billed to Clio</h2><span className="pill" style={{color:'var(--green-700)',background:'var(--green-050)'}}>{approved.length}</span></div>
                  {approved.map(e=>(
                    <div key={e.id} className="approved-item fade-in">
                      <span className="check">{I.check({})}</span>
                      <span className="time">{e.hours.toFixed(1)} hr</span>
                      <div className="ai-mid"><div className="ai-client">{e.client}</div><div className="ai-desc">{e.desc}</div></div>
                      <div className="ai-amt">{money(e.hours)}<div className="l">@ ${RATE}/hr</div></div>
                    </div>
                  ))}
                </React.Fragment>
              )
            )}
          </div>
        </div>
      </div>

      <Drawer entry={drawer} onClose={()=>setDrawer(null)} onApprove={approve} />

      <div className="toast-wrap">
        {toasts.map(t=>(<div key={t.id} className="toast">{t.node}</div>))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
