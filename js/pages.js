// js/pages.js – alle Seiten 2.4.2
function waitFw(cb) { if (window.fw) cb(); else setTimeout(() => waitFw(cb), 50); }

waitFw(() => {

// ── Helpers ───────────────────────────────────────────────
function datum(d) {
  if (!d) return '–';
  const ts = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(ts)) return '–';
  return ts.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function datumUhrzeit(d) {
  if (!d) return '–';
  const ts = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(ts)) return '–';
  return ts.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
    + ' ' + ts.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
}
function plural(n, singular, plural_) {
  return n + ' ' + (n === 1 ? singular : plural_);
}

function dauerFormat(h) {
  if (h === null || h === undefined) return '';
  const gesamt = Math.round(h * 60);
  const std = Math.floor(gesamt / 60);
  const min = gesamt % 60;
  return min === 0 ? `${std}:00` : `${std}:${String(min).padStart(2,'0')}`;
}
function zeitZeile(u) {
  const z = u.zeitBeginn && u.zeitEnde
    ? `${u.zeitBeginn} – ${u.zeitEnde} Uhr`
    : u.zeitBeginn ? `${u.zeitBeginn} Uhr` : '';
  const d = u.dauer_h ? dauerFormat(u.dauer_h) + 'h' : '';
  return [z, d].filter(Boolean).join(' · ');
}


function kurzName(vorname, nachname) {
  const v = (vorname||'').trim();
  const n = (nachname||'').trim();
  if (!n && !v) return 'Kamerad';
  if (!n) return v;
  if (!v) return n;
  return n + ', ' + v.charAt(0) + '.';
}
function anwesenheitBadge(s) {
  if (s==='bestaetigt' || s==='kommt')       return '<span style="color:#16a34a;font-size:1.1rem">✅</span>';
  if (s==='abgelehnt'  || s==='kommt_nicht') return '<span style="color:#dc2626;font-size:1.1rem">❌</span>';
  return '<span style="color:#f59e0b;font-size:1.1rem">⏳</span>'; // keine Reaktion
}
function getStats(anwesenheiten, dienstMap, einsatzMap) {
  const jetzt   = new Date();
  const jahrAkt = jetzt.getFullYear();
  const vor12m  = new Date(); vor12m.setFullYear(jetzt.getFullYear()-1); vor12m.setHours(0,0,0,0);

  let gesamtEinsatz=0, gesamtDienst=0, einsaetze=0, dienste=0;
  let dienstStundenJahr=0, dienstStunden12m=0;
  for (const a of anwesenheiten) {
    if (a.status !== 'bestaetigt' && a.status !== 'kommt') continue;
    const dienstEintrag  = dienstMap?.get(a.uebungId)  || null;
    const einsatzEintrag = einsatzMap?.get(a.uebungId) || null;
    const eintrag   = dienstEintrag || einsatzEintrag || null;
    const typNorm   = a.typ === 'einsaetze' ? 'einsatz' : a.typ === 'dienste' ? 'dienst' : a.typ;
    const istEinsatz = typNorm === 'einsatz' || (!a.typ && !!einsatzEintrag && !dienstEintrag);
    const h = eintrag?.dauer_h ?? a.dauer_h ?? 0;
    const d = a.datum?.toDate ? a.datum.toDate() : (eintrag?.datum?.toDate?.()  || new Date(a.datum));

    if (istEinsatz) {
      if (d.getFullYear() === jahrAkt) { gesamtEinsatz += h; einsaetze++; }
    } else {
      if (d.getFullYear() === jahrAkt) { gesamtDienst += h; dienste++; dienstStundenJahr += h; }
      if (d >= vor12m) { dienstStunden12m += h; }
    }
  }
  return {
    gesamtEinsatz:  Math.round(gesamtEinsatz*10)/10,
    gesamtDienst:   Math.round(gesamtDienst*10)/10,
    einsaetze, dienste,
    stunden12m: Math.round(dienstStundenJahr*10)/10,  // Anzeige: aktuelles Jahr
    ziel: dienstStunden12m >= 40,                      // 40h-Ziel: letzte 12 Monate
    stunden12mZiel: Math.round(dienstStunden12m*10)/10,
  };
}


// ── Google Places Autocomplete (via Cloud Function Proxy) ─
const AC_URL = 'https://europe-west3-ffw-oegeln-791ca.cloudfunctions.net/ortAutoComplete';

function initOrtAutocomplete(inputId, onSelect) {
  const input = document.getElementById(inputId);
  if (!input || input._acInit) return;
  input._acInit = true;
  let box = null, aktiv = -1, timer = null;

  const schliesseBox = () => { if (box) { box.remove(); box = null; aktiv = -1; } };

  const setAktiv = (idx) => {
    aktiv = idx;
    box?.querySelectorAll('.ac-row').forEach((r, i) => r.classList.toggle('aktiv', i === idx));
  };

  const zeigeBox = (items) => {
    schliesseBox();
    if (!items.length) return;
    const wrapper = input.closest('.ac-wrapper') || input.parentNode;
    box = document.createElement('div');
    box.className = 'ac-dropdown';
    items.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'ac-row';
      row.setAttribute('data-ac', i);
      row.innerHTML =
        `<span class="ac-row-icon">📍</span>` +
        `<span style="min-width:0;flex:1">` +
          `<div class="ac-row-main">${s.main}</div>` +
          (s.secondary ? `<div class="ac-row-sub">${s.secondary}</div>` : '') +
        `</span>`;
      row.addEventListener('mouseover', () => setAktiv(i));
      row.addEventListener('mouseout',  () => row.classList.remove('aktiv'));
      row.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = s.description;
        schliesseBox();
        if (onSelect) onSelect(input.value);
      });
      box.appendChild(row);
    });
    wrapper.appendChild(box);
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { schliesseBox(); return; }
    timer = setTimeout(async () => {
      try {
        const r = await fetch(AC_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({input: q}) });
        const data = await r.json();
        zeigeBox(data.suggestions || []);
      } catch(e) { console.warn('Autocomplete Fehler:', e); }
    }, 220);
  });

  input.addEventListener('blur',    () => setTimeout(schliesseBox, 180));
  input.addEventListener('keydown', e => {
    if (!box) return;
    const rows = box.querySelectorAll('.ac-row');
    if (e.key === 'ArrowDown') { setAktiv(Math.min(aktiv+1, rows.length-1)); e.preventDefault(); }
    if (e.key === 'ArrowUp')   { setAktiv(Math.max(aktiv-1, 0));             e.preventDefault(); }
    if (e.key === 'Enter' && aktiv >= 0) { rows[aktiv].dispatchEvent(new MouseEvent('mousedown')); e.preventDefault(); }
    if (e.key === 'Escape') schliesseBox();
  });
}

// ── Dienst-Sichtbarkeit ───────────────────────────────────
function dienstSichtbar(d, profil, qualis) {
  const titel = (d.titel || '').toLowerCase();
  const qs = (qualis || []).map(q => (q.bezeichnung || q.titel || q.name || '').toLowerCase());
  // AGT-Termine
  const agtTitel = ['belastungslauf', 'wärmeübung', 'fortbildungstag agt'];
  if (agtTitel.some(t => titel.includes(t))) {
    return qs.some(q => q.includes('agt'));
  }
  // Maschinist
  if (titel.includes('maschinist')) {
    return qs.some(q => q.includes('maschinist'));
  }
  // Führungskräfte
  const fuehTitel = ['führungskräfte', 'gruppenführersitzung', 'zugführersitzung', 'zug- und gruppenführer'];
  if (fuehTitel.some(t => titel.includes(t))) {
    const rolle = profil?.rolle || '';
    return ['gruppenführer','zugführer','wehrfuehrer'].includes(rolle);
  }
  return true; // alle anderen sichtbar
}
// ── Nächste Dienste ──────────────────────────────────────
function dienstKarte(d, label) {
  return `<div class="card" style="margin-bottom:0.5rem;cursor:pointer" onclick="navigate('uebung-detail',{id:'${d.id}',typ:'dienst'})">
    <div style="font-size:0.72rem;color:var(--muted);margin-bottom:0.2rem">${label}</div>
    <div style="font-weight:600">${d.titel}</div>
    <div style="font-size:0.83rem;color:var(--muted)">${datum(d.datum)}${d.zeitBeginn ? ' · '+d.zeitBeginn+' Uhr' : ''}${d.ort ? ' · '+d.ort : ''}</div>
  </div>`;
}
function renderNaechsteDienste(naechster, zweiter) {
  if (!naechster) return '<div class="card" style="font-size:0.85rem;text-align:center;color:var(--muted)">Keine bevorstehenden Dienste</div>';
  let html = dienstKarte(naechster, '📅 Nächster Dienst');
  if (zweiter) html += dienstKarte(zweiter, '📅 Weiterer Dienst');
  return html;
}

// ── Dashboard ─────────────────────────────────────────────
registerPage('dashboard', async (el) => {
  fw.setTitle('Dashboard');
  const [aSnap, diensteSnap, einsaetzeSnap, qualiSnap] = await Promise.all([
    fw.getDocs('anwesenheiten', fw.where('userId','==',fw.user.uid)),
    fw.getDocs('dienste', fw.orderBy('datum','asc')),
    fw.getDocs('einsaetze'),
    fw.getDocs('users/'+fw.user.uid+'/qualifikationen'),
  ]);
  const meine       = aSnap.docs.map(d => ({id:d.id,...d.data()}));
  const dienstMap   = new Map(diensteSnap.docs.map(d => [d.id, d.data()]));
  const einsatzMap  = new Map(einsaetzeSnap.docs.map(d => [d.id, d.data()]));
  const meineQualis = qualiSnap.docs.map(d => d.data());
  const heute    = new Date(); heute.setHours(0,0,0,0);
  const alleDienste = diensteSnap.docs.map(d => ({id:d.id,...d.data()}));
  const kuenftige   = alleDienste.filter(d => {
    const dt = d.datum?.toDate ? d.datum.toDate() : new Date(d.datum);
    return dt >= heute && dienstSichtbar(d, fw.profil, meineQualis);
  });
  // Oegeln-Logik: chronologisch nächster immer oben
  // nächster Dienst ≠ Oegeln → 2 anzeigen (nächster + nächster Oegeln-Dienst)
  // nächster Dienst = Oegeln → nur 1 anzeigen
  const naechster = kuenftige[0] || null;
  const naechsterOegeln = kuenftige.find(d => d.ort === 'Oegeln') || null;
  const zweiter = naechster && naechsterOegeln && naechsterOegeln.id !== naechster.id ? naechsterOegeln : null;
  const stats    = getStats(meine, dienstMap, einsatzMap);

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.8rem">
      <div style="font-family:'DM Serif Display',serif;font-size:1.3rem">
        Hallo, ${fw.profil.vorname || fw.profil.email}
      </div>
      <span id="status-lampe" style="width:12px;height:12px;border-radius:50%;background:#ccc;display:inline-block;flex-shrink:0;cursor:pointer" title="Status wird geprüft..." onclick="zeigeStatusDetail()"></span>
    </div>

    <button class="alarm-btn" onclick="navigate('uebung-form',{typ:'einsatz',alarm:true})">🚨 Einsatz</button>

${renderNaechsteDienste(naechster, zweiter)}

    <div id="news-feed" style="margin-top:0.5rem"></div>

    <div style="text-align:center;color:#374151;font-size:0.7rem;margin-top:1.5rem;margin-bottom:0.5rem" id="version-display"></div>
  `;
  // Versions-Anzeige: "App-Version · PWA-Version"
  // Wenn die native App "-dev" im Namen hat, wird auch die PWA-Version mit "-dev" angezeigt
  const pwaVersionRaw = document.querySelector('meta[name="app-version"]')?.content || '';
  const appVersion = typeof window.AppInfo !== 'undefined' ? window.AppInfo.getVersion() : null;
  const isDev = appVersion?.includes('-dev') || false;
  const pwaVersion = pwaVersionRaw + (isDev ? '-dev' : '');
  const versionEl = document.getElementById('version-display');
  if (versionEl) {
    versionEl.textContent = appVersion ? `${appVersion} · ${pwaVersion}` : pwaVersion;
  }

  checkDeepLink();
  startStatusPruefung();
  ladeNewsFeed();
});

let _newsFeedListener = null;

function renderNewsBeitrag(b, usersMap) {
  const hat = b.abstimmung?.optionen?.some(o => (o.stimmen||[]).includes(fw.user.uid));
  const gesamt = b.abstimmung?.optionen?.reduce((s,o) => s+(o.stimmen?.length||0), 0) || 0;
  const abstimmungHtml = b.abstimmung ? `
    <div style="margin-top:0.8rem;border-top:1px solid var(--border);padding-top:0.6rem">
      <div style="font-weight:600;font-size:0.88rem;margin-bottom:0.6rem">🗳️ ${b.abstimmung.frage}</div>
      ${b.abstimmung.optionen.map((o,i) => {
        const pct = gesamt ? Math.round(((o.stimmen||[]).length)/gesamt*100) : 0;
        const meineStimme = (o.stimmen||[]).includes(fw.user.uid);
        const namen = (o.stimmen||[]).map(uid => {
          const u = usersMap?.get(uid);
          return u ? kurzName(u.vorname, u.nachname) : '?';
        }).join(', ');
        if (hat) {
          // Ergebnis anzeigen nach Stimmabgabe, Option weiterhin anklickbar zum Ändern
          return `<div onclick="newsAbstimmen('${b.id}',${i})"
            style="margin-bottom:0.5rem;cursor:pointer;padding:0.5rem 0.6rem;border-radius:10px;border:2px solid ${meineStimme?'#16a34a':'#e5e7eb'};background:${meineStimme?'#f0fdf4':'transparent'}">
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:0.25rem">
              <span style="font-weight:${meineStimme?'600':'400'}">${meineStimme?'● ':'○ '}${o.text}</span>
              <span style="color:var(--muted)">${(o.stimmen||[]).length} (${pct}%)</span>
            </div>
            <div style="height:5px;background:#e5e7eb;border-radius:3px">
              <div style="height:5px;background:${meineStimme?'#16a34a':'#9ca3af'};border-radius:3px;width:${pct}%;transition:width 0.3s"></div>
            </div>
            ${namen ? `<div style="font-size:0.7rem;color:var(--muted);margin-top:0.25rem">${namen}</div>` : ''}
          </div>`;
        } else {
          // Noch nicht abgestimmt → Option anklickbar
          return `<div onclick="newsAbstimmen('${b.id}',${i})"
            style="margin-bottom:0.4rem;cursor:pointer;padding:0.5rem 0.6rem;border-radius:10px;border:2px solid #e5e7eb;display:flex;align-items:center;gap:0.5rem">
            <span style="width:18px;height:18px;border-radius:50%;border:2px solid #9ca3af;display:inline-block;flex-shrink:0"></span>
            <span style="font-size:0.88rem">${o.text}</span>
          </div>`;
        }
      }).join('')}
      <div style="font-size:0.75rem;color:var(--muted);margin-top:0.3rem">${gesamt} Stimme${gesamt!==1?'n':''}</div>
      ${fw.isWehrfuehrer() && b.abstimmung.aenderungen?.length ? `<div style="font-size:0.72rem;color:#f59e0b;margin-top:0.3rem">⚠️ ${b.abstimmung.aenderungen.length} Stimme${b.abstimmung.aenderungen.length!==1?'n':''} geändert</div>` : ''}
    </div>` : '';
  return `<div class="card" style="margin-bottom:0.6rem">
    <div style="font-weight:600;margin-bottom:0.3rem">${b.titel||''}</div>
    <div style="font-size:0.88rem;color:var(--muted);white-space:pre-wrap">${b.inhalt||''}</div>
    ${b.pdf ? `<a href="${b.pdf.url}" target="_blank" style="display:inline-flex;align-items:center;gap:0.4rem;margin-top:0.5rem;padding:0.4rem 0.8rem;background:var(--panel2);border:1px solid var(--border);border-radius:8px;font-size:0.82rem;color:var(--blue);text-decoration:none;max-width:100%;overflow:hidden">📄 <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${b.pdf.name}</span></a>` : ''}
    ${abstimmungHtml}
    <div style="font-size:0.72rem;color:var(--muted);margin-top:0.5rem">${datum(b.erstelltAm)}</div>
    ${fw.isWehrfuehrer() ? `<button onclick="newsLoeschen('${b.id}')" style="background:none;border:none;color:#9ca3af;font-size:0.75rem;cursor:pointer;padding:0;margin-top:0.3rem">🗑 Löschen</button>` : ''}
    <div style="margin-top:0.7rem;border-top:1px solid var(--border);padding-top:0.6rem">
      <div id="kommentare-${b.id}" style="margin-bottom:0.4rem">
        ${(b.kommentare||[]).map(k => {
          const u = usersMap?.get(k.userId);
          const name = u ? kurzName(u.vorname, u.nachname) : '?';
          const istEigener = k.userId === fw.user.uid;
          const istAdmin = fw.isWehrfuehrer();
          return `<div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:flex-start">
            <div style="width:26px;height:26px;border-radius:50%;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:0.7rem;flex-shrink:0;font-weight:600">${(u?.vorname||'?')[0]}${(u?.nachname||'')[0]||''}</div>
            <div style="flex:1;background:var(--panel2);border-radius:10px;padding:0.4rem 0.6rem;font-size:0.82rem">
              <span style="font-weight:600;font-size:0.75rem">${name}</span>
              <span style="font-size:0.7rem;color:var(--muted);margin-left:0.4rem">${datumUhrzeit(k.datum)}</span>
              ${(istEigener||istAdmin)?`<button onclick="newsKommentarLoeschen('${b.id}','${k.id}')" style="float:right;background:none;border:none;color:var(--muted);font-size:0.7rem;cursor:pointer;padding:0">✕</button>`:''}
              <div style="margin-top:0.15rem;word-break:break-word">${k.text}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:0.4rem;align-items:center">
        <input id="ki-${b.id}" placeholder="Kommentar…" style="flex:1;padding:0.45rem 0.7rem;border:1px solid var(--border);border-radius:20px;background:var(--panel2);color:var(--text);font-size:0.82rem;outline:none"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();newsKommentarSenden('${b.id}');}">
        <button onclick="newsKommentarSenden('${b.id}')" style="background:var(--blue);border:none;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:0.85rem">➤</button>
      </div>
    </div>
  </div>`;
}

window.newsKommentarSenden = async (newsId) => {
  const inp = document.getElementById('ki-'+newsId);
  const text = inp?.value?.trim();
  if (!text) return;
  inp.value = '';
  const kommentar = { id: Date.now()+'_'+fw.user.uid, userId: fw.user.uid, text, datum: new Date() };
  const snap = await fw.getDoc('news/'+newsId);
  if (!snap.exists()) return;
  const bestehende = snap.data().kommentare || [];
  await fw.setDoc('news/'+newsId, { kommentare: [...bestehende, kommentar] });
};

window.newsKommentarLoeschen = async (newsId, komId) => {
  const snap = await fw.getDoc('news/'+newsId);
  if (!snap.exists()) return;
  const gefiltert = (snap.data().kommentare||[]).filter(k => k.id !== komId);
  await fw.setDoc('news/'+newsId, { kommentare: gefiltert });
};

async function ladeNewsFeed() {
  const el = document.getElementById('news-feed');
  if (!el) return;
  // Alten Listener aufräumen
  if (_newsFeedListener) { _newsFeedListener(); _newsFeedListener = null; }

  const beitragBtn = fw.isWehrfuehrer() ? `<button class="btn btn-secondary btn-sm" onclick="navigate('news-form')">📝 Beitrag</button>` : '';
  const header = `<div class="section-header" style="display:flex;align-items:center;justify-content:space-between">Neuigkeiten${beitragBtn}</div>`;

  // usersMap einmalig laden
  const uSnap = await fw.getDocs('users');
  const usersMap = new Map(uSnap.docs.map(d => [d.id, d.data()]));

  // Live-Listener auf news
  _newsFeedListener = fw.onQuerySnapshot('news', snap => {
    const beitraege = snap.docs
      .map(d => ({id:d.id,...d.data()}))
      .sort((a,b) => (b.erstelltAm?.toMillis?.() || 0) - (a.erstelltAm?.toMillis?.() || 0));
    if (!beitraege.length) {
      el.innerHTML = header + '<div class="card" style="color:var(--muted);font-size:0.88rem">Noch keine Neuigkeiten.</div>';
      return;
    }
    el.innerHTML = header + beitraege.map(b => renderNewsBeitrag(b, usersMap)).join('');
  });
}

window.newsAbstimmen = async (newsId, optionIndex) => {
  const snap = await fw.getDoc('news/'+newsId);
  if (!snap.exists()) return;
  const b = snap.data();
  // Alte Stimme merken für Änderungs-Log
  const alteOption = b.abstimmung.optionen.findIndex(o => (o.stimmen||[]).includes(fw.user.uid));
  const hat_geaendert = alteOption !== -1 && alteOption !== optionIndex;
  const optionen = b.abstimmung.optionen.map((o,i) => ({
    ...o,
    stimmen: i===optionIndex
      ? [...new Set([...(o.stimmen||[]), fw.user.uid])]
      : (o.stimmen||[]).filter(uid => uid !== fw.user.uid)
  }));
  // Änderungs-Log für Wehrführer
  const aenderungen = b.abstimmung.aenderungen || [];
  if (hat_geaendert) {
    aenderungen.push({ uid: fw.user.uid, von: alteOption, zu: optionIndex, am: new Date().toISOString() });
  }
  await fw.updateDoc('news/'+newsId, {
    'abstimmung.optionen': optionen,
    'abstimmung.aenderungen': aenderungen,
  });
  ladeNewsFeed();
};

window.newsLoeschen = async (id) => {
  if (!confirm('Beitrag löschen?')) return;
  const snap = await fw.getDoc('news/'+id);
  if (snap.exists() && snap.data().pdf?.pfad) {
    await fw.deletePdf(snap.data().pdf.pfad);
  }
  await fw.deleteDoc('news/'+id);
  ladeNewsFeed();
};

let _letzterStatus = null;
let _statusInterval = null;
let _statusWarnungGesendet = false;
let _statusDetails = [];

window.zeigeStatusDetail = () => {
  const existing = document.getElementById('status-modal');
  if (existing) { existing.remove(); return; }
  const modal = document.createElement('div');
  modal.id = 'status-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:1rem';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--panel);border-radius:14px;padding:1.2rem;width:100%;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
      <div style="font-weight:700;font-size:1rem;margin-bottom:1rem">🔍 System-Status</div>
      ${_statusDetails.map(s => `
        <div style="display:flex;align-items:center;gap:0.7rem;padding:0.5rem 0;border-bottom:1px solid var(--border)">
          <span style="width:10px;height:10px;border-radius:50%;background:${s.ok?'#22c55e':'#ef4444'};flex-shrink:0;box-shadow:0 0 5px ${s.ok?'#22c55e':'#ef4444'}"></span>
          <div style="flex:1">
            <div style="font-size:0.88rem;font-weight:600">${s.label}</div>
            <div style="font-size:0.75rem;color:var(--muted)">${s.info}</div>
          </div>
        </div>`).join('')}
      <button onclick="document.getElementById('status-modal').remove()" style="margin-top:1rem;width:100%;padding:0.6rem;background:var(--panel2);border:none;border-radius:8px;color:var(--text);cursor:pointer;font-size:0.9rem">Schließen</button>
    </div>`;
  document.body.appendChild(modal);
};

async function pruefeStatus() {
  const lampe = document.getElementById('status-lampe');
  if (!lampe) return;
  const online   = navigator.onLine;
  const notifOk  = Notification.permission === 'granted';
  const snap     = await fw.getDoc('users/'+fw.user.uid);
  const tokenOk  = !!(snap.data()?.fcmToken);

  // FCM-Token validieren und ggf. erneuern
  let tokenFrisch = tokenOk;
  let tokenInfo = tokenOk ? 'Token vorhanden' : 'Kein Token gespeichert';
  if (online && notifOk && tokenOk && fw.messaging) {
    try {
      const swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (swReg) {
        const { getToken } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js');
        const aktuellerToken = await getToken(fw.messaging, { vapidKey: fw._vapid, serviceWorkerRegistration: swReg });
        if (aktuellerToken && aktuellerToken !== snap.data()?.fcmToken) {
          await fw.setDoc('users/'+fw.user.uid, { fcmToken: aktuellerToken });
          if (fw.profil) fw.profil.fcmToken = aktuellerToken;
          tokenInfo = 'Token erneuert ✓';
          console.log('Status-Check: FCM Token erneuert');
        } else if (aktuellerToken) {
          tokenInfo = 'Token gültig ✓';
        }
        tokenFrisch = !!aktuellerToken;
      }
    } catch(e) { tokenInfo = 'Token-Prüfung fehlgeschlagen'; }
  }

  const allesOk = online && notifOk && tokenFrisch;
  const grund   = !online ? 'Kein Internet' : !notifOk ? 'Benachrichtigungen nicht erlaubt' : 'Kein Push-Token';

  // Detail-Status für Modal
  _statusDetails = [
    { label: 'Internetverbindung', ok: online, info: online ? 'Verbunden' : 'Nicht verbunden' },
    { label: 'Benachrichtigungen', ok: notifOk, info: notifOk ? 'Erlaubt' : 'Berechtigung verweigert' },
    { label: 'Push-Token', ok: tokenFrisch, info: tokenInfo },
  ];

  lampe.style.background = allesOk ? '#22c55e' : '#ef4444';
  lampe.style.boxShadow  = `0 0 6px ${allesOk ? '#22c55e' : '#ef4444'}`;
  lampe.title = allesOk ? 'Alles bereit – tippen für Details' : grund;

  if (allesOk) {
    _statusWarnungGesendet = false;
  } else if (!_statusWarnungGesendet && fw.profil?.notif_status !== false) {
    _statusWarnungGesendet = true;
    if (Notification.permission === 'granted') {
      new Notification('⚠️ Ortswehr – Problem erkannt', {
        body: grund + ' – Einsatzalarme können möglicherweise nicht empfangen werden!',
        icon: '/ortswehr/icons/icon-192.png',
        tag: 'status-warnung',
        requireInteraction: true,
      });
    }
  }
  _letzterStatus = allesOk;
}

function startStatusPruefung() {
  pruefeStatus();
  if (_statusInterval) clearInterval(_statusInterval);
  _statusInterval = setInterval(pruefeStatus, 30000);
  window.addEventListener('online',  pruefeStatus);
  window.addEventListener('offline', pruefeStatus);
}

// ── Hilfsfunktion: Liste rendern ─────────────────────────
function renderEintrag(u, meineMap) {
  const badge = anwesenheitBadge(meineMap.get(u.id));
  const d = u.datum?.toDate ? u.datum.toDate() : new Date(u.datum);
  const heute = new Date(); heute.setHours(0,0,0,0);
  const morgen = new Date(heute); morgen.setDate(heute.getDate()+1);
  const istHeute = u.typ === 'einsatz' && d >= heute && d < morgen;
  const highlightStyle = istHeute ? 'border-left:3px solid var(--red);padding-left:0.5rem;background:rgba(220,38,38,0.08);' : '';
  return `<div class="list-item" onclick="navigate('uebung-detail',{id:'${u.id}',typ:'${u.typ}'})" style="${highlightStyle}">
    <div class="list-item-body">
      <div class="list-item-title">${istHeute ? '🚨 ' : ''}${u.titel}</div>
      ${u.ort ? `<div class="list-item-sub" style="margin-top:0.05rem">📍 ${u.ort}</div>` : ''}
      <div class="list-item-sub">${datum(u.datum)}${zeitZeile(u) ? ' · '+zeitZeile(u) : ''}</div>
    </div>
    <div class="list-item-right">${badge}</div>
    <div class="list-chevron">›</div>
  </div>`;
}

function renderEintragListe(liste, meineMap) {
  if (!liste.length) return '<div class="empty">Keine Einträge</div>';
  const heute = new Date(); heute.setHours(0,0,0,0);

  const zukunft = liste.filter(u => {
    const d = u.datum?.toDate ? u.datum.toDate() : new Date(u.datum);
    return d >= heute;
  }).sort((a,b) => {
    const da = a.datum?.toDate ? a.datum.toDate() : new Date(a.datum);
    const db = b.datum?.toDate ? b.datum.toDate() : new Date(b.datum);
    return da - db;
  });

  const vergangen = liste.filter(u => {
    const d = u.datum?.toDate ? u.datum.toDate() : new Date(u.datum);
    return d < heute;
  });

  // Archiv nach Jahr gruppieren
  const archivJahre = {};
  for (const u of vergangen) {
    const d = u.datum?.toDate ? u.datum.toDate() : new Date(u.datum);
    const j = d.getFullYear();
    if (!archivJahre[j]) archivJahre[j] = [];
    archivJahre[j].push(u);
  }

  // Nächste Dienste: zeige 1, oder 2 wenn der erste nicht in Oegeln ist
  let sichtbar = [];
  if (zukunft.length > 0) {
    const erster = zukunft[0];
    const erstInOegeln = erster.ort?.toLowerCase().includes('oegeln');
    sichtbar = erstInOegeln ? [erster] : zukunft.slice(0, 2);
  }
  const weitereZukunft = zukunft.slice(sichtbar.length);

  let html = '';

  // Sichtbare zukünftige Dienste
  if (sichtbar.length) {
    html += sichtbar.map(u => renderEintrag(u, meineMap)).join('');
  } else {
    html += '<div class="empty">Keine kommenden Dienste</div>';
  }

  // Weitere zukünftige Dienste einklappbar
  if (weitereZukunft.length) {
    html += `<details style="margin-top:0.2rem">
      <summary style="padding:0.6rem 0;cursor:pointer;color:var(--muted);font-size:0.85rem;list-style:none;display:flex;align-items:center;gap:0.4rem">
        <span>▸</span> Weitere Dienste (${weitereZukunft.length})
      </summary>
      ${weitereZukunft.map(u => renderEintrag(u, meineMap)).join('')}
    </details>`;
  }

  // Archiv einklappbar – Jahre als eigene Dropdowns
  if (vergangen.length) {
    const jahreInnen = Object.keys(archivJahre).sort((a,b)=>b-a).map(jahr => `
      <details style="margin-top:0.1rem">
        <summary style="padding:0.5rem 0;cursor:pointer;color:var(--muted);font-size:0.8rem;list-style:none;display:flex;align-items:center;gap:0.4rem;padding-left:0.5rem">
          <span>▸</span> ${jahr} (${archivJahre[jahr].length})
        </summary>
        ${archivJahre[jahr].map(u => renderEintrag(u, meineMap)).join('')}
      </details>`).join('');
    html += `<details style="margin-top:0.2rem">
      <summary style="padding:0.6rem 0;cursor:pointer;color:var(--muted);font-size:0.85rem;list-style:none;display:flex;align-items:center;gap:0.4rem">
        <span>▸</span> Archiv (${vergangen.length} Einträge)
      </summary>
      ${jahreInnen}
    </details>`;
  }

  return html;
}


// ── Einsatz-Liste: aktuelles Jahr oben, Archiv nach Jahr ──
function renderEinsatzListe(liste, meineMap) {
  if (!liste.length) {
    const jahrAkt = new Date().getFullYear();
    return `<div class="empty">${jahrAkt} noch kein Einsatz</div>`;
  }

  const jahrAkt = new Date().getFullYear();

  // Einträge nach Jahr gruppieren
  const jahreMap = {};
  for (const u of liste) {
    const d = u.datum?.toDate ? u.datum.toDate() : new Date(u.datum);
    const j = d.getFullYear();
    if (!jahreMap[j]) jahreMap[j] = [];
    jahreMap[j].push(u);
  }

  const alleJahre = Object.keys(jahreMap).map(Number).sort((a,b) => b-a);
  let html = '';

  // Aktuelles Jahr direkt anzeigen
  const aktEintraege = jahreMap[jahrAkt] || [];
  if (!aktEintraege.length) {
    html += `<div class="empty">${jahrAkt} noch kein Einsatz</div>`;
  } else {
    html += `<div style="font-size:0.78rem;color:var(--muted);padding:0.5rem 0 0.2rem;font-weight:600">${jahrAkt} · ${aktEintraege.length===1?'1 Einsatz':aktEintraege.length+' Einträge'}</div>`;
    html += aktEintraege.map(u => renderEintrag(u, meineMap)).join('');
  }

  // Vergangene Jahre → alle unter "Archiv" als eigene Dropdowns
  const archivJahre = alleJahre.filter(j => j !== jahrAkt);
  if (archivJahre.length) {
    const archivGesamt = archivJahre.reduce((s, j) => s + jahreMap[j].length, 0);
    const jahreInnen = archivJahre.map(jahr => {
      const eintraege = jahreMap[jahr];
      return `<details style="margin-top:0.1rem">
        <summary style="padding:0.5rem 0;cursor:pointer;color:var(--muted);font-size:0.8rem;list-style:none;display:flex;align-items:center;gap:0.4rem;padding-left:0.5rem">
          <span>▸</span> ${jahr} (${eintraege.length===1?'1 Einsatz':eintraege.length+' Einträge'})
        </summary>
        ${eintraege.map(u => renderEintrag(u, meineMap)).join('')}
      </details>`;
    }).join('');
    html += `<details style="margin-top:0.2rem">
      <summary style="padding:0.6rem 0;cursor:pointer;color:var(--muted);font-size:0.85rem;list-style:none;display:flex;align-items:center;gap:0.4rem">
        <span>▸</span> Archiv (${archivGesamt} Einträge)
      </summary>
      ${jahreInnen}
    </details>`;
  }

  return html;
}

// Collection je nach Typ
function col(typ) { return typ === 'einsatz' ? 'einsaetze' : 'dienste'; }

// ── Einsätze ──────────────────────────────────────────────
registerPage('einsaetze', async (el) => {
  fw.setTitle('Einsätze');
  fw.showHeaderAction('+ Einsatz', () => navigate('uebung-form', {typ:'einsatz', alarm:false}));
  const [uSnap, aSnap] = await Promise.all([
    fw.getDocs('einsaetze', fw.orderBy('datum','desc')),
    fw.getDocs('anwesenheiten', fw.where('userId','==',fw.user.uid)),
  ]);
  const liste    = uSnap.docs.map(d => ({id:d.id,...d.data()}));
  const meineMap = new Map(aSnap.docs.map(d => [d.data().uebungId, d.data().status]));
  el.innerHTML = `<div class="card">${renderEinsatzListe(liste, meineMap)}</div>`;
});

// ── Dienste ───────────────────────────────────────────────
registerPage('dienste', async (el) => {
  fw.setTitle('Dienste');
  if (fw.isWehrfuehrer()) fw.showHeaderAction('+ Dienst', () => navigate('uebung-form', {typ:'dienst'}));
  const [uSnap, aSnap, dQualiSnap] = await Promise.all([
    fw.getDocs('dienste', fw.orderBy('datum','desc')),
    fw.getDocs('anwesenheiten', fw.where('userId','==',fw.user.uid)),
    fw.getDocs('users/'+fw.user.uid+'/qualifikationen'),
  ]);
  const dQualis  = dQualiSnap.docs.map(d => d.data());
  const istMaschinist = dQualis.some(q => (q.bezeichnung||'').toLowerCase().includes('maschinist'));
  const liste    = uSnap.docs.map(d => ({id:d.id,...d.data()})).filter(d => dienstSichtbar(d, fw.profil, dQualis));
  const meineMap = new Map(aSnap.docs.map(d => [d.data().uebungId, d.data().status]));
  el.innerHTML = `
    <div class="card">${renderEintragListe(liste, meineMap)}</div>
    ${(fw.isWehrfuehrer() || istMaschinist) ? `
    <details class="card" style="margin-top:0.8rem;padding:0">
      <summary style="font-weight:600;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0.8rem;font-size:13px;border-radius:8px">
        <span>🔧 Fahrzeug- und Geräteprüfungen</span>
        <span style="color:var(--muted)">▾</span>
      </summary>
      <div id="pruef-inline" style="padding:0 0.8rem 0.8rem">⏳ Lade...</div>
    </details>` : ''}
    ${fw.isWehrfuehrer() ? `
    <div style="margin-top:0.8rem">
      <button class="btn btn-secondary btn-sm btn-full" onclick="kalenderImportieren()" id="kal-btn">📅 Aus Google Kalender importieren</button>
      <div id="kal-status" class="muted" style="font-size:0.8rem;text-align:center;margin-top:0.4rem"></div>
    </div>` : ''}
  `;
  if (fw.isWehrfuehrer() || istMaschinist) ladePruefaufgabenInline();
});

window.kalenderImportieren = async () => {
  const btn    = document.getElementById('kal-btn');
  const status = document.getElementById('kal-status');
  btn.disabled = true; btn.textContent = '⏳ Wird geladen...';
  try {
    const res = await fetch('https://europe-west3-ffw-oegeln-791ca.cloudfunctions.net/kalenderImport',
      { headers: { 'x-uid': fw.user.uid } });
    const { events, error } = await res.json();
    if (error) throw new Error(error);

    // Bestehende Dienste laden – Matching per Datum (YYYY-MM-DD)
    const snap = await fw.getDocs('dienste');
    // Map: datum-String → {id, data}
    const vorhandeneMap = new Map(snap.docs.map(d => [
      d.data().datum?.toDate?.().toISOString().slice(0,10),
      { id: d.id, data: d.data() }
    ]));

    let neu = 0, aktualisiert = 0, unveraendert = 0;
    for (const e of events) {
      const bestehend = vorhandeneMap.get(e.datum);
      const neuerEintrag = {
        titel: e.titel, datum: new Date(e.datum),
        dauer_h: e.dauer_h, beschreibung: e.beschreibung || '',
        zeitBeginn: e.zeitBeginn || null, zeitEnde: e.zeitEnde || null,
        ort: e.ort || null, typ: 'dienst',
      };

      if (!bestehend) {
        // Neu anlegen
        await fw.addDoc('dienste', { ...neuerEintrag, erstelltVon: fw.user.uid, erstelltAm: new Date() });
        neu++;
      } else {
        // Prüfen ob sich Kerndaten geändert haben
        const alt = bestehend.data;
        const geaendert =
          alt.titel !== e.titel ||
          (alt.ort || '') !== (e.ort || '') ||
          (alt.zeitBeginn || '') !== (e.zeitBeginn || '') ||
          (alt.zeitEnde || '') !== (e.zeitEnde || '') ||
          Math.abs((alt.dauer_h || 0) - (e.dauer_h || 0)) > 0.01;

        if (geaendert) {
          // Nur Kerndaten updaten – Anwesenheiten bleiben unberührt
          await fw.setDoc('dienste/' + bestehend.id, neuerEintrag);
          aktualisiert++;
        } else {
          unveraendert++;
        }
      }
    }

    const teile = [];
    if (neu > 0)          teile.push(neu + ' neu');
    if (aktualisiert > 0) teile.push(aktualisiert + ' aktualisiert');
    if (unveraendert > 0) teile.push(unveraendert + ' unverändert');
    status.textContent = teile.join(' · ');
    btn.textContent = '📅 Aus Google Kalender importieren';
    btn.disabled = false;
    if (neu > 0 || aktualisiert > 0) setTimeout(() => navigate('dienste'), 1200);
  } catch(e) {
    status.textContent = 'Fehler: ' + e.message;
    btn.textContent = '📅 Aus Google Kalender importieren';
    btn.disabled = false;
  }
};


function hatLkwFs(fs) {
  if (!fs) return false;
  return /\b(C1E|C1|CE|C)\b/.test(fs.toUpperCase());
}

window.rolleGeaendert = (rolle) => {
  const row = document.getElementById('staerke-rolle-row');
  if (row) row.style.display = rolle === 'wehrfuehrer' ? 'block' : 'none';
};

window.einsatzReagieren = async (uebungId, status) => {
  const name = kurzName(fw.profil.vorname, fw.profil.nachname);
  // Typ und Datum aus Quell-Collection ermitteln
  let typ = 'dienst', datum = new Date(), dauer_h = 0;
  const dSnap = await fw.getDoc('dienste/'+uebungId);
  if (dSnap.exists()) {
    typ = 'dienst'; datum = dSnap.data().datum?.toDate?.() || new Date(); dauer_h = dSnap.data().dauer_h || 0;
  } else {
    const eSnap = await fw.getDoc('einsaetze/'+uebungId);
    if (eSnap.exists()) { typ = 'einsatz'; datum = eSnap.data().datum?.toDate?.() || new Date(); dauer_h = eSnap.data().dauer_h || 0; }
  }
  const snap = await fw.getDocs('anwesenheiten',
    fw.where('uebungId','==',uebungId), fw.where('userId','==',fw.user.uid));
  if (snap.docs.length > 0) {
    await fw.updateDoc('anwesenheiten/'+snap.docs[0].id, {
      status, typ, datum, dauer_h,
      rolle: fw.profil.staerkeRolle || fw.profil.rolle || 'kamerad',
      fuehrerschein: fw.profil.fuehrerschein || '', aktualisiertAm: new Date()
    });
  } else {
    await fw.addDoc('anwesenheiten', {
      uebungId, userId: fw.user.uid, userName: name, typ, datum, dauer_h,
      rolle: fw.profil.staerkeRolle || fw.profil.rolle || 'kamerad',
      fuehrerschein: fw.profil.fuehrerschein || '',
      status, gemeldetAm: new Date(),
    });
  }
};


// ── Detail ────────────────────────────────────────────────
let _einsatzListener = null; // aktiver onSnapshot Listener

registerPage('uebung-detail', async (el, {id, typ}) => {
  // alten Listener aufräumen
  if (_einsatzListener) { _einsatzListener(); _einsatzListener = null; }
  const snap = await fw.getDoc(col(typ||'dienst')+'/'+id);
  if (!snap.exists()) { el.innerHTML='<div class="empty">Nicht gefunden</div>'; return; }
  const u = {id,...snap.data()};
  const isEinsatz = u.typ === 'einsatz';
  fw.setTitle(isEinsatz ? 'Einsatz' : 'Dienst');
  fw.showBack(() => navigateBack());
  if (fw.isWehrfuehrer()) fw.showHeaderAction('✏️ Edit', () => navigate('uebung-form',{id, typ: u.typ}));

  const aSnap = await fw.getDocs('anwesenheiten',
    fw.where('uebungId','==',id), fw.where('userId','==',fw.user.uid));
  const meineA = aSnap.docs[0] ? {id:aSnap.docs[0].id,...aSnap.docs[0].data()} : null;

  const eintragNavFn = `navigate('uebung-eintragen',{id:'${id}',titel:'${u.titel.replace(/'/g,"\'")}',dauer:${u.dauer_h||0},typ:'${u.typ}',datumStr:'${u.datum?.toDate?.().toISOString()||u.datum}'})`;
  const eintragBtn = fw.isWehrfuehrer()
    ? `<button class="btn btn-secondary btn-sm" onclick="${eintragNavFn}">+ Kamerad eintragen</button>`
    : '';

  el.innerHTML = `
    <div class="card">
      <span class="badge badge-blue">${isEinsatz?'⚡ Einsatz':'📅 Dienst'}</span>
      <div style="margin-top:0.6rem;font-weight:600;font-size:1.1rem">${u.titel}</div>
      <div style="margin-top:0.3rem;color:var(--muted);font-size:0.85rem">${datum(u.datum)}${zeitZeile(u) ? ' · '+zeitZeile(u) : ''}</div>
      ${u.beschreibung ? `<p class="muted" style="margin-top:0.4rem;font-size:0.85rem">${u.beschreibung}</p>` : ''}
      ${u.ort ? `<div style="margin-top:0.5rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <span style="font-size:0.85rem">📍 ${u.ort}</span>
        ${isEinsatz ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.ort)}" target="_blank"
          style="font-size:0.75rem;padding:0.2rem 0.6rem;background:var(--panel2);border-radius:20px;color:var(--blue);text-decoration:none;border:1px solid var(--border)">
          🗺 Navigation
        </a>` : ''}
      </div>` : ''}
      ${isEinsatz && !u.zeitEnde && fw.isWehrfuehrer() ? `
        <button class="btn btn-secondary btn-sm" style="margin-top:0.6rem" onclick="navigate('uebung-form',{id:'${u.id}',typ:'einsatz'})">⏱ Endzeit nachtragen</button>
      ` : ''}
      ${isEinsatz && !u.ort && fw.isWehrfuehrer() ? `
        <div class="ac-wrapper" style="display:flex;gap:0.5rem;margin-top:0.6rem;align-items:center;position:relative">
          <input id="ort-inline" placeholder="Adresse eintragen…" style="flex:1;font-size:0.85rem">
          <button class="btn btn-secondary btn-sm" onclick="ortSpeichern('${u.id}')">📍 Speichern</button>
        </div>
      ` : ''}
    </div>
    <div class="section-header">Wer kommt? <span id="einsatz-zaehler" style="font-weight:400;font-size:0.85rem"></span></div>
    <div id="einsatz-reaktionen" class="card">⏳ Lade...</div>
    <div class="card" style="display:flex;gap:0.8rem">
      <button class="btn btn-full" id="btn-kommt"
        style="background:#16a34a;color:#fff;font-size:1rem;padding:0.6rem"
        onclick="einsatzReagieren('${id}','kommt')">👍 Ich komme</button>
      <button class="btn btn-full" id="btn-kommt-nicht"
        style="background:#dc2626;color:#fff;font-size:1rem;padding:0.6rem"
        onclick="einsatzReagieren('${id}','kommt_nicht')">👎 Komme nicht</button>
    </div>
    ${fw.isWehrfuehrer() ? `<div style="padding:0 0 0.5rem">${eintragBtn}</div>` : ''}
  `;

  // Autocomplete für inline Adress-Eingabe (Detail-Seite, kein <script> in innerHTML)
  requestAnimationFrame(() => initOrtAutocomplete('ort-inline'));

  // Live-Listener für Reaktionen (Einsatz + Dienst)
  if (true) {
    // usersMap + agtMap: beim Start laden und bei jedem Snapshot neu laden
    let usersMap = new Map();
    let agtMap   = new Map();
    const ladeProfilDaten = async () => {
      const usersSnap = await fw.getDocs('users');
      usersMap = new Map(usersSnap.docs.map(d => [d.id, d.data()]));
      agtMap   = new Map();
      await Promise.all(usersSnap.docs.map(async d => {
        const profil = d.data();
        const qSnap = await fw.getDocs('users/'+d.id+'/qualifikationen');
        const hatAgt = qSnap.docs.some(q => (q.data().bezeichnung||q.data().titel||q.data().name||'').toLowerCase().includes('agt'));
        if (!hatAgt) return;
        // AGT nur aktiv wenn alle 3 Nachweise gültig
        const heute = new Date();
        const j3 = new Date(); j3.setFullYear(heute.getFullYear()-3); j3.setHours(0,0,0,0);
        const j1 = new Date(); j1.setFullYear(heute.getFullYear()-1); j1.setHours(0,0,0,0);
        const unt  = profil.agt_untersuchung ? new Date(profil.agt_untersuchung) : null;
        const waer = profil.agt_waermeuebung ? new Date(profil.agt_waermeuebung) : null;
        const bel  = profil.agt_belastung    ? new Date(profil.agt_belastung)    : null;
        const agtAktiv = unt && unt >= j3 && waer && waer >= j1 && bel && bel >= j1;
        if (agtAktiv) agtMap.set(d.id, true);
      }));
    };
    await ladeProfilDaten();

    _einsatzListener = fw.onQuerySnapshot(
      'anwesenheiten',
      async (snap) => {
        // Profildaten bei jedem Update neu laden (Rollen/Lehrgänge können sich geändert haben)
        await ladeProfilDaten();
        const alle = snap.docs.map(d => {
          const a = {id:d.id,...d.data()};
          const profil = usersMap.get(a.userId) || {};
          a.rolle         = profil.staerkeRolle || profil.rolle || a.rolle || 'kamerad';
          a.fuehrerschein = profil.fuehrerschein || a.fuehrerschein || '';
          return a;
        });
        const kommen      = alle.filter(a => a.status === 'kommt' || a.status === 'bestaetigt');
        const kommenNicht = alle.filter(a => a.status === 'kommt_nicht');
        const meineR      = alle.find(a => a.userId === fw.user.uid);

        const normRolle = r => [...(r||'').trim().toLowerCase()]
          .map(ch => ({'ü':'ue','ö':'oe','ä':'ae','ß':'ss'}[ch]||ch)).join('');
        const zugf  = kommen.filter(a => normRolle(a.rolle) === 'zugfuehrer').length;
        const gruf  = kommen.filter(a => normRolle(a.rolle) === 'gruppenfuehrer').length;
        const kamf  = kommen.filter(a => normRolle(a.rolle) !== 'zugfuehrer' && normRolle(a.rolle) !== 'gruppenfuehrer').length;
        const agtZ  = kommen.filter(a => agtMap.get(a.userId)).length;
        const zaehler = document.getElementById('einsatz-zaehler');
        if (zaehler) zaehler.textContent = isEinsatz
          ? `👍 ${kommen.length}  👎 ${kommenNicht.length}  ·  Stärke: ${zugf}/${gruf}/${kamf}  ·  AGT: ${agtZ}`
          : `👍 ${kommen.length}  👎 ${kommenNicht.length}`;

        const container = document.getElementById('einsatz-reaktionen');
        if (container) {
          const rows = [...kommen, ...kommenNicht].map(a => {
            const kommt = a.status === 'kommt' || a.status === 'bestaetigt';
            const lkw = kommt && hatLkwFs(a.fuehrerschein);
            const agt = isEinsatz && kommt && agtMap.get(a.userId);
            const loeschBtn = fw.isWehrfuehrer()
              ? `<button onclick="teilnehmerEntfernen('${a.id}','${id}','${u.typ}')" style="background:none;border:none;cursor:pointer;font-size:0.9rem;color:#9ca3af;padding:0.1rem 0.3rem" title="Entfernen">🗑</button>`
              : '';
            return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0;border-bottom:1px solid var(--border)">
              <span style="font-size:1.1rem">${kommt?'👍':'👎'}${lkw?'🚛':''}${agt?'💨':''}</span>
              <span style="flex:1;font-weight:${a.userId===fw.user.uid?'600':'400'}">${kurzName(usersMap.get(a.userId)?.vorname, usersMap.get(a.userId)?.nachname) || a.userName || 'Kamerad'}</span>
              ${loeschBtn}
            </div>`;
          }).join('');
          container.innerHTML = rows || '<div class="muted" style="text-align:center;font-size:0.85rem;padding:0.5rem">Noch keine Rückmeldungen</div>';
        }

        const btnK  = document.getElementById('btn-kommt');
        const btnKN = document.getElementById('btn-kommt-nicht');
        if (btnK && btnKN) {
          btnK.style.opacity  = meineR?.status === 'kommt'       ? '1' : '0.5';
          btnKN.style.opacity = meineR?.status === 'kommt_nicht' ? '1' : '0.5';
        }
      },
      fw.where('uebungId','==',id)
    );
    // Listener auch in window damit navigate() ihn aufräumen kann
    window._einsatzListener = _einsatzListener;
  }
});

window.teilnahmeMelden = async (uebungId, titel, dauer_h, typ, datumStr) => {
  const name = kurzName(fw.profil.vorname, fw.profil.nachname);
  await fw.addDoc('anwesenheiten', {
    uebungId, userId: fw.user.uid, userName: name,
    status: 'vorgeschlagen', uebungTitel: titel,
    dauer_h, typ, datum: new Date(datumStr), vorgeschlagenAm: new Date(),
  });
  fw.toast('Teilnahme gemeldet ⏳');
  navigate('uebung-detail', {id: uebungId, typ});
};
window.teilnehmerEntfernen = async (aId, uebungId, typ) => {
  if (!confirm('Anwesenheit entfernen?')) return;
  await fw.deleteDoc('anwesenheiten/'+aId);
  fw.toast('Entfernt'); navigate('uebung-detail', {id: uebungId, typ});
};

// ── Kamerad direkt eintragen ──────────────────────────────
registerPage('uebung-eintragen', async (el, {id, titel, dauer, typ, datumStr}) => {
  fw.setTitle('Eintragen');
  fw.showBack(() => navigateBack());
  const [usersSnap, bereitsSnap] = await Promise.all([
    fw.getDocs('users'),
    fw.getDocs('anwesenheiten', fw.where('uebungId','==',id)),
  ]);
  const bereits = new Set(bereitsSnap.docs.map(d => d.data().userId));
  const verfuegbar = usersSnap.docs.map(d => ({id:d.id,...d.data()}))
    .filter(u => !bereits.has(u.id) && u.aktiv !== false)
    .sort((a,b) => (a.nachname||'').localeCompare(b.nachname||''));
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Kamerad eintragen</div>
      <p class="muted" style="font-size:0.85rem;margin-bottom:0.8rem">${titel}</p>
      ${verfuegbar.length===0 ? '<div class="empty">Alle bereits eingetragen</div>' :
        verfuegbar.map(u => `
          <div class="list-item">
            <div class="list-item-body">
              <div class="list-item-title">${u.nachname||''}, ${u.vorname||''}</div>
              <div class="list-item-sub">${u.dienstgrad||'–'}</div>
            </div>
            <button class="btn btn-sm btn-success" onclick="direktEintragen('${id}','${u.id}','${kurzName(u.vorname,u.nachname)}',${dauer},'${typ}','${datumStr}')">Eintragen</button>
          </div>`).join('')}
    </div>`;
});

window.direktEintragen = async (uebungId, userId, name, dauer_h, typ, datumStr) => {
  // Profil laden damit fuehrerschein + rolle mitgespeichert werden
  const userSnap = await fw.getDoc('users/' + userId);
  const profil = userSnap.exists() ? userSnap.data() : {};
  await fw.addDoc('anwesenheiten', {
    uebungId, userId, userName: name, status:'kommt',
    dauer_h, typ, datum: new Date(datumStr), bestaetigtAm: new Date(),
    rolle: profil.staerkeRolle || profil.rolle || 'kamerad',
    fuehrerschein: profil.fuehrerschein || '',
  });
  fw.toast(name+' eingetragen ✅');
  // Seite neu laden damit neue Anwesenheit sofort sichtbar
  navigate('uebung-eintragen', {id: uebungId, titel: '', dauer: dauer_h, typ, datumStr});
};

// ── Einsatz / Dienst Form ─────────────────────────────────
registerPage('uebung-form', async (el, {id, typ: vorTyp, alarm: mitAlarm}) => {
  let u = null;
  if (id) { const s = await fw.getDoc(col(vorTyp||'dienst')+'/'+id); if (!s.exists()) { const s2 = await fw.getDoc(col('einsatz')+'/'+id); if(s2.exists()) u={id,...s2.data()}; } else { u={id,...s.data()}; } }
  const selTyp = u?.typ || vorTyp || 'dienst';
  const isEinsatz = selTyp === 'einsatz';
  fw.setTitle(u ? 'Bearbeiten' : (isEinsatz ? 'Einsatz melden' : 'Neuer Dienst'));
  fw.showBack(() => navigateBack());

  const datumVal = u?.datum?.toDate ? u.datum.toDate().toISOString().slice(0,10)
    : new Date().toISOString().slice(0,10);

  if (isEinsatz) {
    const jetztH  = new Date().getHours().toString().padStart(2,'0');
    const jetztM  = new Date().getMinutes().toString().padStart(2,'0');
    const jetztZeit = `${jetztH}:${jetztM}`;
    el.innerHTML = `
      <div class="card">
        <div style="font-family:'DM Serif Display',serif;font-size:1.3rem;color:var(--red);margin-bottom:0.75rem">🚨 Einsatz</div>
        <input type="hidden" id="f-alarm" value="${mitAlarm ? '1' : '0'}">
        <div class="btn-row" style="margin-top:0;margin-bottom:0.75rem">
          <button class="btn btn-primary btn-full" onclick="uebungSpeichern('${id||''}','einsatz')">${u ? '💾 Speichern' : mitAlarm ? '🚨 Einsatz melden & Alarm senden' : '💾 Einsatz speichern'}</button>
          ${u ? `<button class="btn btn-danger" onclick="uebungLoeschen('${id}','einsatz')">🗑 Löschen</button>` : ''}
        </div>
        ${u ? `<button class="btn btn-secondary btn-full" style="margin-bottom:0.75rem" onclick="einsatzNachbenachrichtigen('${id}')">🔔 Benachrichtigung erneut senden</button>` : ''}
        <input id="f-titel" value="${u?.titel||''}" placeholder="Einsatzstichwort" style="margin-bottom:0.5rem" autofocus>
        <div class="ac-wrapper" style="position:relative;margin-bottom:0.5rem">
          <input id="f-ort" value="${u?.ort||''}" placeholder="Einsatzort / Adresse (optional)">
        </div>
        <div style="display:flex;gap:0.5rem">
          <input id="f-beginn" type="time" value="${u?.zeitBeginn||jetztZeit}" style="flex:1">
          <input id="f-ende" type="time" value="${u?.zeitEnde||''}" placeholder="Ende (optional)" style="flex:1">
        </div>
      </div>