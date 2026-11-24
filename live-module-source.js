/* =========================================================
   MÓDULO EN VIVO (Sleeper) — cuadros de Playoffs y Camote Bowl
   Lee marcadores de la API pública de Sleeper desde el navegador.
   ========================================================= */
(function(){
  const LEAGUE_IDS = ['1388961070965587968', '1405644370555781120'];
  // Si algún equipo se llama distinto en Sleeper, agrégalo aquí:  'Nombre en reporte': 'Nombre en Sleeper'
  const ALIASES = {};
  const REFRESH_MS = 60000;
  const SLEEPER = 'https://api.sleeper.app/v1';
  const PROJ = 'https://api.sleeper.com/projections/nfl';
  const POS = ['QB','RB','WR','TE','K','DEF'];

  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
  const byName = Object.fromEntries(rankedCombined.map(t => [t.name, t]));
  const T = n => byName[n];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ---------- Definición de los dos cuadros ----------
  const byes = [...mainSplit.byes].sort((a,b) => a.overallRank - b.overallRank);
  const wc = wildcardTeams;
  const cam = campoteCandidates;
  const WK_R1 = [12,13], WK_QF = [14], WK_SF = [15], WK_F = [16];
  const ref = (id, take, label) => ({ ref:id, take, label });

  const PLAY = {
    mode:'win',
    rounds:[
      { label:'Ronda 1 · Wild Card', sub:'S12–13 · ida y vuelta', nodes:[
        { id:'p1', a:wc[0], b:wc[7], weeks:WK_R1 },
        { id:'p2', a:wc[3], b:wc[4], weeks:WK_R1 },
        { id:'p3', a:wc[2], b:wc[5], weeks:WK_R1 },
        { id:'p4', a:wc[1], b:wc[6], weeks:WK_R1 } ]},
      { label:'Cuartos de Final', sub:'S14', nodes:[
        { id:'q1', a:byes[0], b:ref('p2','winner','Ganador Ronda 1 · Partido 2'), weeks:WK_QF },
        { id:'q2', a:byes[1], b:ref('p3','winner','Ganador Ronda 1 · Partido 3'), weeks:WK_QF },
        { id:'q3', a:byes[2], b:ref('p4','winner','Ganador Ronda 1 · Partido 4'), weeks:WK_QF },
        { id:'q4', a:byes[3], b:ref('p1','winner','Ganador Ronda 1 · Partido 1'), weeks:WK_QF } ]},
      { label:'Semifinal', sub:'S15', nodes:[
        { id:'s1', a:ref('q1','winner','Ganador Cuartos · Partido 1'), b:ref('q2','winner','Ganador Cuartos · Partido 2'), weeks:WK_SF },
        { id:'s2', a:ref('q3','winner','Ganador Cuartos · Partido 3'), b:ref('q4','winner','Ganador Cuartos · Partido 4'), weeks:WK_SF } ]},
      { label:'Final', sub:'S16', final:true, nodes:[
        { id:'f', a:ref('s1','winner','Ganador Semifinal 1'), b:ref('s2','winner','Ganador Semifinal 2'), weeks:WK_F } ]},
    ],
    champ:{ icon:'🏆', label:'Campeon', node:'f', take:'winner', empty:'Por definir' }
  };
  const CAMO = {
    mode:'lose',
    rounds:[
      { label:'Ronda de Salvación', sub:'S12–13 · ida y vuelta', nodes:[
        { id:'c1', a:cam[0], b:cam[3], weeks:WK_R1, mode:'win' },
        { id:'c2', a:cam[1], b:cam[2], weeks:WK_R1, mode:'win' } ]},
      { label:'Ronda 1', sub:'S14', nodes:[
        { id:'r1', a:ref('c1','loser','Perdedor Salvación A'), b:cam[9], weeks:WK_QF },
        { id:'r2', a:cam[6], b:cam[7], weeks:WK_QF },
        { id:'r3', a:ref('c2','loser','Perdedor Salvación B'), b:cam[8], weeks:WK_QF },
        { id:'r4', a:cam[4], b:cam[5], weeks:WK_QF } ]},
      { label:'Semifinal', sub:'S15', nodes:[
        { id:'t1', a:ref('r1','loser','Perdedor Ronda 1 · Partido 1'), b:ref('r2','loser','Perdedor Ronda 1 · Partido 2'), weeks:WK_SF },
        { id:'t2', a:ref('r3','loser','Perdedor Ronda 1 · Partido 3'), b:ref('r4','loser','Perdedor Ronda 1 · Partido 4'), weeks:WK_SF } ]},
      { label:'Final', sub:'S16', final:true, nodes:[
        { id:'cf', a:ref('t1','loser','Perdedor Semifinal 1'), b:ref('t2','loser','Perdedor Semifinal 2'), weeks:WK_F } ]},
    ],
    champ:{ icon:'🍠', label:'El Camote Mayor', node:'cf', take:'loser', empty:'Quien PIERDA la final' }
  };

  // ---------- Estado en vivo ----------
  const live = { ok:false, nflWeek:null, scores:{}, proj:{}, unmatched:[], msg:'Conectando con Sleeper…', at:null };
  const weekDone = w => live.nflWeek != null && live.nflWeek > w;

  function cell(name, w){ return ((live.scores[name]||{})[w]) || null; }

  function resolveNode(n, ctx){
    const get = x => {
      if (!x) return null;
      if (x.ref) { const r = ctx[x.ref]; return r ? (x.take === 'winner' ? r.winner : r.loser) : null; }
      return x;
    };
    const a = get(n.a), b = get(n.b);
    const res = { a, b, ptsA:null, ptsB:null, pjA:null, pjB:null, complete:false, winner:null, loser:null, leader:null };
    if (!a || !b) return res;
    const tot = t => {
      let pts = 0, pj = 0, any = false, doneAll = true;
      n.weeks.forEach(w => {
        const c = cell(t.name, w);
        const done = weekDone(w);
        if (!done) doneAll = false;
        if (c && c.pts != null) { pts += c.pts; any = true; }
        const proj = c && c.proj != null ? c.proj : null;
        pj += done ? ((c && c.pts) || 0) : Math.max(proj != null ? proj : 0, (c && c.pts) || 0);
      });
      return { pts, pj, any, doneAll };
    };
    const A = tot(a), B = tot(b);
    res.ptsA = A.any ? A.pts : null; res.ptsB = B.any ? B.pts : null;
    res.pjA = A.pj; res.pjB = B.pj;
    res.complete = live.ok && A.doneAll && B.doneAll && A.any && B.any;
    if (A.any && B.any && A.pts !== B.pts) res.leader = A.pts > B.pts ? a : b;
    if (res.complete) {
      let w = A.pts === B.pts ? (a.overallRank < b.overallRank ? a : b) : (A.pts > B.pts ? a : b);
      res.winner = w; res.loser = w === a ? b : a;
    }
    return res;
  }

  function resolveAll(def){
    const ctx = {};
    def.rounds.forEach(r => r.nodes.forEach(n => { ctx[n.id] = resolveNode(n, ctx); }));
    return ctx;
  }

  const f1 = v => v == null ? '—' : v.toFixed(2);
  function slotHTML(team, label, pts, pj, cls, showProj){
    if (!team) return `<div class="slot tbd"><span class="seed"></span><span class="name">${esc(label||'Por definir')}</span></div>`;
    const pjTxt = showProj && pj != null && pj > 0 ? `<small class="pj">proy. ${pj.toFixed(1)}</small>` : '';
    return `<div class="slot ${team.tag}-seed ${cls||''}">
      <span class="seed">${team.overallRank}</span>
      <span class="name">${esc(team.name)}${pjTxt}</span>
      <span class="pts">${pts == null ? '' : f1(pts)}</span>
    </div>`;
  }

  function render(def, el){
    const ctx = resolveAll(def);
    const frag = [];
    def.rounds.forEach(r => {
      const nodes = r.nodes.map(n => {
        const x = ctx[n.id];
        const mode = n.mode || def.mode;
        const mk = (side) => {
          const team = side === 'a' ? x.a : x.b;
          const ref0 = side === 'a' ? n.a : n.b;
          const pts = side === 'a' ? x.ptsA : x.ptsB;
          const pj = side === 'a' ? x.pjA : x.pjB;
          let cls = '';
          if (team) {
            if (x.complete) {
              const adv = mode === 'win' ? x.winner === team : x.loser === team;
              cls = adv ? 'adv' : 'out';
            } else if (x.leader === team) cls = 'lead';
          }
          return slotHTML(team, ref0 && ref0.label, pts, pj, cls, !x.complete);
        };
        return `<div class="matchup">
          <div class="connector"></div>
          ${mk('a')}
          <div class="vs-divider">vs</div>
          ${mk('b')}
        </div>`;
      }).join('');
      frag.push(`<div class="round"><div class="round-label">${esc(r.label)}<small>${esc(r.sub)}</small></div>${r.final ? nodes.replace('class="matchup"','class="matchup" style="margin-top:auto;margin-bottom:auto;"') : nodes}</div>`);
    });
    const c = def.champ, cn = ctx[c.node];
    const champ = cn && cn.complete ? (c.take === 'winner' ? cn.winner : cn.loser) : null;
    frag.push(`<div class="champion-block"><div class="trophy-icon">${c.icon}</div><div class="trophy-label">${esc(c.label)}</div><div class="champion-name">${esc(champ ? champ.name : c.empty)}</div></div>`);
    el.innerHTML = frag.join('');
  }

  function statusBar(){
    let bar = document.getElementById('live-status');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'live-status';
      const sec = document.getElementById('bracket-section');
      sec.insertBefore(bar, sec.querySelector('.bracket-panel'));
    }
    const t = live.at ? live.at.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) : '';
    const warn = live.unmatched.length ? ` · ⚠ sin enlazar: ${live.unmatched.map(esc).join(', ')}` : '';
    bar.className = live.ok ? 'live-ok' : 'live-wait';
    bar.innerHTML = `<span class="live-dot"></span>${esc(live.msg)}${t ? ' · actualizado ' + t : ''}${warn}`;
  }

  function paint(){
    render(PLAY, document.getElementById('bracket'));
    render(CAMO, document.getElementById('camote-bracket'));
    statusBar();
  }

  // ---------- Sleeper ----------
  async function jget(url){
    const r = await fetch(url, { cache:'no-store' });
    if (!r.ok) throw new Error(url + ' → ' + r.status);
    return r.json();
  }

  let meta = null; // por liga: { league, rosterName: Map rosterId→teamName(report) }
  async function loadMeta(){
    if (meta) return meta;
    const wanted = new Map(rankedCombined.map(t => [norm(ALIASES[t.name] || t.name), t.name]));
    const out = [];
    const found = new Set();
    for (const id of LEAGUE_IDS) {
      const [league, users, rosters] = await Promise.all([
        jget(`${SLEEPER}/league/${id}`), jget(`${SLEEPER}/league/${id}/users`), jget(`${SLEEPER}/league/${id}/rosters`)
      ]);
      const uById = new Map(users.map(u => [u.user_id, u]));
      const map = new Map();
      rosters.forEach(r => {
        const u = uById.get(r.owner_id);
        const cands = [u && u.metadata && u.metadata.team_name, u && u.display_name, u && u.username].filter(Boolean);
        for (const c of cands) {
          const hit = wanted.get(norm(c));
          if (hit) { map.set(r.roster_id, hit); found.add(hit); break; }
        }
      });
      out.push({ id, league, map });
    }
    live.unmatched = rankedCombined.map(t => t.name).filter(n => !found.has(n));
    meta = out;
    return meta;
  }

  function leaguePts(stats, scoring){
    let p = 0;
    for (const k in scoring) if (stats[k] != null) p += stats[k] * scoring[k];
    return p;
  }

  async function loadProjections(season, week, scoring){
    const q = POS.map(p => 'position[]=' + p).join('&');
    const arr = await jget(`${PROJ}/${season}/${week}?season_type=regular&${q}`);
    const m = new Map();
    arr.forEach(x => { if (x && x.player_id && x.stats) m.set(String(x.player_id), leaguePts(x.stats, scoring)); });
    return m;
  }

  async function refresh(){
    try {
      const st = await jget(`${SLEEPER}/state/nfl`);
      live.nflWeek = (st.season_type === 'post' || st.season_type === 'off') ? 99 : st.week;
      const m = await loadMeta();
      const weeks = [...new Set([...WK_R1, ...WK_QF, ...WK_SF, ...WK_F])].filter(w => w <= (live.nflWeek === 99 ? 99 : live.nflWeek + 0));
      const scores = {};
      for (const lg of m) {
        const season = lg.league.season;
        const scoring = lg.league.scoring_settings || {};
        for (const w of weeks) {
          let ms = [];
          try { ms = await jget(`${SLEEPER}/league/${lg.id}/matchups/${w}`); } catch(e) { continue; }
          let pm = null;
          if (!weekDone(w)) { try { pm = await loadProjections(season, w, scoring); } catch(e) { pm = null; } }
          ms.forEach(x => {
            const name = lg.map.get(x.roster_id); if (!name) return;
            const starters = (x.starters || []).filter(s => s && s !== '0');
            const proj = pm ? starters.reduce((s, id) => s + (pm.get(String(id)) || 0), 0) : null;
            (scores[name] = scores[name] || {})[w] = { pts: typeof x.points === 'number' ? x.points : null, proj };
          });
        }
      }
      live.scores = scores; live.ok = true; live.at = new Date();
      live.msg = live.nflWeek === 99 ? 'Temporada terminada' : (live.nflWeek < 12 ? `En vivo · conectado a Sleeper (semana ${live.nflWeek}; playoffs inician en la semana 12)` : `En vivo · semana ${live.nflWeek}`);
    } catch (e) {
      live.msg = live.ok ? 'No se pudo actualizar; mostrando el último dato' : 'Esperando datos de Sleeper…';
      if (window.console) console.warn('[live]', e);
    }
    paint();
  }

  // estilos
  const css = document.createElement('style');
  css.textContent = `
    #live-status{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--chalk-dim);margin:-6px 0 10px}
    .live-dot{width:8px;height:8px;border-radius:50%;background:#8a8a8a;display:inline-block;flex:none}
    #live-status.live-ok .live-dot{background:#4fd16f;box-shadow:0 0 0 0 rgba(79,209,111,.6);animation:livepulse 1.8s infinite}
    @keyframes livepulse{70%{box-shadow:0 0 0 7px rgba(79,209,111,0)}100%{box-shadow:0 0 0 0 rgba(79,209,111,0)}}
    .round-label small{display:block;font-size:8.5px;letter-spacing:.06em;opacity:.75;margin-top:2px;text-transform:none}
    .slot .name small.pj{display:block;font-size:9px;opacity:.65;font-style:normal;line-height:1.1}
    .slot .pts{font-variant-numeric:tabular-nums;font-weight:600;font-size:11.5px;white-space:nowrap}
    .slot.lead{box-shadow:inset 0 0 0 1px rgba(143,207,159,.5),0 1px 3px rgba(0,0,0,.25)}
    .slot.adv{box-shadow:inset 0 0 0 1px var(--gold),0 1px 3px rgba(0,0,0,.25)}
    .slot.adv .pts::after{content:" ✓";color:var(--gold)}
    .slot.out{opacity:.5}
  `;
  document.head.appendChild(css);

  paint();                    // dibujo inicial (sin marcadores)
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.__live = { live, refresh, PLAY, CAMO, resolveAll };
})();
