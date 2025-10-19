// ---- Parse + global data ----
const parseDate  = d3.timeParse('%d/%m/%Y');
let data = [];

// =============== STATE & DOM ===============
const state = {
  type: 'all',
  opponent: 'all',
  range: null,
  smooth: false
};

const $type = document.querySelector('#typeSel');
const $opp = document.querySelector('#opponentSel');
const $smooth = document.querySelector('#smoothChk');

$type.addEventListener('change', () => { state.type = $type.value; renderAll(); });
$opp.addEventListener('change', () => { state.opponent = $opp.value; renderAll(); });
$smooth.addEventListener('change', () => { state.smooth = $smooth.checked; renderTimeline(); });

// Populate opponent list *after* data loads
function populateOpponents() {
  const keep = $opp.value || 'all';
  $opp.innerHTML = '<option value="all">All</option>';
  const opps = Array.from(new Set(data.map(d => d.opponent))).sort();
  for (const o of opps) {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    $opp.appendChild(opt);
  }
  if ([...$opp.options].some(opt => opt.value === keep)) $opp.value = keep;
}

// =============== FILTERS ===============
function filtered() {
  return data.filter(d => (state.type === 'all' || d.type === state.type)
                       && (state.opponent === 'all' || d.opponent === state.opponent)
                       && (!state.range || (d.date >= state.range[0] && d.date <= state.range[1])));
}

// =============== KPI CARDS ===============
const $k_fg = document.querySelector('#k_fg');
const $k_att = document.querySelector('#k_att');
const $k_mk = document.querySelector('#k_mk');
const $k_ms = document.querySelector('#k_ms');

function renderKPIs() {
  const f = filtered();
  const makes = d3.sum(f, d => d.makes);
  const misses = d3.sum(f, d => d.misses);
  const atts = makes + misses;
  const fg = atts ? (makes / atts) : 0;
  $k_fg.textContent = (fg * 100).toFixed(1) + '%';
  $k_att.textContent = atts;
  $k_mk.textContent = makes;
  $k_ms.textContent = misses;
}

// =============== TIMELINE (FG% per game) ===============
const svgT = d3.select('#timeline');
const m = {top: 20, right: 16, bottom: 46, left: 46};
const W = 900 - m.left - m.right;
const H = 260 - m.top - m.bottom;
const gT = svgT.append('g').attr('transform', `translate(${m.left},${m.top})`);

const xT = d3.scaleTime().range([0, W]);
const yT = d3.scaleLinear().range([H, 0]).domain([0, 1]);

const xAxisT = gT.append('g').attr('transform', `translate(0,${H})`).attr('class', 'x-axis');
const yAxisT = gT.append('g').attr('class', 'y-axis');

const grid = gT.append('g').attr('class', 'grid');
const line = gT.append('path').attr('fill', 'none').attr('stroke', 'var(--accent)').attr('stroke-width', 2);
const lineSmooth = gT.append('path').attr('fill', 'none').attr('stroke', 'var(--accent2)').attr('stroke-width', 2).attr('opacity', 0);
const dots = gT.append('g');

const brush = d3.brushX().extent([[0,0],[W,H]]).on('brush end', brushed);
const brushG = gT.append('g').attr('class', 'brush').call(brush);

function renderTimeline() {
  const fAll = data.filter(d => (state.type === 'all' || d.type === state.type)
                             && (state.opponent === 'all' || d.opponent === state.opponent));
  xT.domain(d3.extent(fAll, d => d.date));

  xAxisT.call(d3.axisBottom(xT).ticks(6).tickSizeOuter(0)).selectAll('text').attr('fill', 'var(--muted)');
  yAxisT.call(d3.axisLeft(yT).ticks(5).tickFormat(d3.format('.0%')).tickSizeOuter(0))
         .selectAll('text').attr('fill', 'var(--muted)');
  yAxisT.selectAll('path,line').attr('stroke', 'var(--grid)');

  grid.selectAll('line').data(d3.range(0, 1.01, 0.25)).join('line')
      .attr('x1', 0).attr('x2', W)
      .attr('y1', d => yT(d)).attr('y2', d => yT(d))
      .attr('stroke', 'var(--grid)');

  const f = fAll.slice().sort((a,b) => a.date - b.date);
  const lGen = d3.line().x(d => xT(d.date)).y(d => yT(d.fg));
  line.attr('d', lGen(f));

  // Moving average (span = 3)
  const span = 3;
  const sm = f.map((d,i) => {
    const s = Math.max(0, i - Math.floor(span/2));
    const e = Math.min(f.length, s + span);
    const window = f.slice(s, e);
    return {date: d.date, fg: d3.mean(window, w => w.fg)};
  });
  lineSmooth.attr('d', lGen(sm)).attr('opacity', state.smooth ? 1 : 0);

  const tt = d3.select('#tt');
  dots.selectAll('circle').data(f, d => d.date).join(
    enter => enter.append('circle')
                  .attr('r', 3.5)
                  .attr('cx', d => xT(d.date))
                  .attr('cy', d => yT(d.fg))
                  .attr('fill', 'var(--accent)')
                  .on('mouseenter', (evt,d) => {
                     const pct = (d.fg*100).toFixed(1)+'%';
                     tt.html(`<b>${d3.timeFormat('%b %d, %Y')(d.date)}</b><br/>FG% ${pct}<br/>${d.makes}/${d.attempts}  • ${d.opponent} • ${d.type}${d.notes?'<br/>'+d.notes:''}`)
                       .style('left', (evt.clientX + 12) + 'px')
                       .style('top', (evt.clientY + 12) + 'px')
                       .style('opacity', 1);
                  })
                  .on('mouseleave', () => tt.style('opacity', 0)),
    update => update
                  .attr('cx', d => xT(d.date))
                  .attr('cy', d => yT(d.fg))
  );

  brushG.call(brush);
  if (state.range) brushG.call(brush.move, state.range.map(xT));

  renderDonut();
  renderBars();
  renderKPIs();
  renderSummary();
}

function brushed(event) {
  const sel = event.selection || d3.brushSelection(brushG.node());
  state.range = sel ? sel.map(xT.invert) : null;
  renderDonut();
  renderBars();
  renderKPIs();
  renderSummary();
}

// =============== DONUT (Makes vs Misses) ===============
const svgD = d3.select('#donut');
const gD = svgD.append('g').attr('transform', 'translate(130,130)');
const arc = d3.arc().innerRadius(60).outerRadius(100);
const pie = d3.pie().value(d => d.v).sort(null);

function renderDonut() {
  const f = filtered();
  const makes = d3.sum(f, d => d.makes);
  const misses = d3.sum(f, d => d.misses);
  const pieData = [
    {k:'Makes', v:makes, c:'var(--good)'},
    {k:'Misses', v:misses, c:'var(--bad)'}
  ];
  gD.selectAll('path').data(pie(pieData)).join('path')
    .attr('d', arc)
    .attr('fill', d => d.data.c);

  const total = makes + misses;
  const pct = total ? (makes/total*100).toFixed(1) : '–';
  gD.selectAll('text.center').data([pct]).join('text')
     .attr('class','center')
     .attr('text-anchor','middle')
     .attr('dy','0.35em')
     .attr('font-size', '22')
     .text(d => (d === '–' ? '–' : d + '%'));
}

// =============== STACKED BARS (per opponent) ===============
const svgB = d3.select('#bars');
const gB = svgB.append('g').attr('transform', `translate(${m.left},${m.top})`);
const xB = d3.scaleBand().range([0, W]).padding(0.2);
const yB = d3.scaleLinear().range([H, 0]);

const xAxisB = gB.append('g').attr('transform', `translate(0,${H})`);
const yAxisB = gB.append('g');

function renderBars() {
  const f = filtered();
  const roll = Array.from(d3.rollup(f, v => ({
    makes: d3.sum(v, d => d.makes),
    misses: d3.sum(v, d => d.misses)
  }), d => d.opponent), ([k, v]) => ({opponent:k, ...v}));

  roll.sort((a,b) => (b.makes + b.misses) - (a.makes + a.misses));

  xB.domain(roll.map(d => d.opponent));
  yB.domain([0, d3.max(roll, d => d.makes + d.misses) || 10]).nice();

  xAxisB.call(d3.axisBottom(xB)).selectAll('text').attr('fill','var(--muted)');
  yAxisB.call(d3.axisLeft(yB).ticks(5)).selectAll('text').attr('fill','var(--muted)');
  xAxisB.selectAll('path,line').attr('stroke','var(--grid)');
  yAxisB.selectAll('path,line').attr('stroke','var(--grid)');

  const groups = gB.selectAll('.bargrp').data(roll, d => d.opponent).join(
    enter => enter.append('g').attr('class','bargrp').attr('transform', d => `translate(${xB(d.opponent)},0)`),
    update => update.attr('transform', d => `translate(${xB(d.opponent)},0)`)
  );

  groups.selectAll('rect.make').data(d => [d]).join('rect')
    .attr('class','make')
    .attr('x', 0)
    .attr('width', xB.bandwidth())
    .attr('y', d => yB(d.makes))
    .attr('height', d => H - yB(d.makes))
    .attr('fill', 'var(--good)');

  groups.selectAll('rect.miss').data(d => [d]).join('rect')
    .attr('class','miss')
    .attr('x', 0)
    .attr('width', xB.bandwidth())
    .attr('y', d => yB(d.makes + d.misses))
    .attr('height', d => H - yB(d.makes + d.misses))
    .attr('fill', 'white');
}

function renderSummary() {
  const f = filtered();
  const makes = d3.sum(f, d => d.makes);
  const misses = d3.sum(f, d => d.misses);
  const atts = makes + misses;
  const fg = atts ? (makes/atts) : 0;
  const minutes = d3.mean(f, d => d.minutes) || 0;
  const el = document.querySelector('#summary');
  el.innerHTML = `
    <li>Games: ${f.length || '–'}</li>
    <li>FG%: ${(fg*100).toFixed(1)}%</li>
    <li>Attempts: ${atts}</li>
    <li>Avg Pace (min/game): ${minutes.toFixed(1)}</li>
  `;
}

function renderAll() {
  renderTimeline();
  renderDonut();
  renderBars();
  renderKPIs();
  renderSummary();
}

// ---- Data loader (use your CSV from /data) ----
// If you used my cleaned file name, this will Just Work™
// ---- Loader that handles the duplicate "Opp" headers by index ----
d3.text('./data/lakers_2024-2025_regular_season.csv').then(text => {
  const rows = d3.csvParseRows(text);
  const H = rows[0].map(h => h.trim());
  const R = rows.slice(1);

  // find column indices (unique ones are straightforward)
  const iDate = H.indexOf('Date');           // e.g., 22/10/2024  (dd/mm/yyyy)
  const iType = H.indexOf('Type');           // '' for home, '@' for away
  const iRslt = H.indexOf('Rslt');           // W/L
  const iTm   = H.indexOf('Tm');             // Lakers points
  const iFG   = H.indexOf('FG');             // team FG
  const iFGA  = H.indexOf('FGA');            // team FGA

  // handle the two "Opp" columns by position
  const oppIdxs = H.reduce((a,h,i) => (h === 'Opp' ? (a.push(i), a) : a), []);
  // opponent code is between Type and Rslt; opponent points is after Tm
  const iOppCode = oppIdxs.find(i => i > iType && i < iRslt);
  const iOppPts  = oppIdxs.find(i => i > iTm);

  if ([iDate,iType,iRslt,iTm,iFG,iFGA,iOppCode,iOppPts].some(i => i < 0)) {
    console.warn('Header detection failed. Headers were:', H);
  }

  const out = [];
  for (const row of R) {
    const dateStr = (row[iDate] || '').trim();
    if (!dateStr) continue;

    const dt = parseDate(dateStr);                 // you already set: d3.timeParse('%d/%m/%Y')
    if (!dt || isNaN(+dt)) continue;

    const makes    = +row[iFG]  || 0;
    const attempts = +row[iFGA] || 0;
    const misses   = Math.max(0, attempts - makes);
    const fg       = attempts ? makes / attempts : 0;

    const tmPts   = +row[iTm]     || 0;
    const oppPts  = +row[iOppPts] || 0;
    const wlRaw   = (row[iRslt] || '').toString().trim().toUpperCase();
    const wl      = wlRaw ? wlRaw[0] : (tmPts && oppPts ? (tmPts > oppPts ? 'W' : 'L') : '');

    const siteRaw = (row[iType] || '').toString().trim();
    const site    = siteRaw === '@' ? 'away' : 'home';

    out.push({
      date: dt,
      opponent: (row[iOppCode] || 'UNK').toString().trim(), // e.g., MIN/PHO/SAC
      type: site,                  // 'home' | 'away'
      makes,
      misses,
      attempts,
      fg,                          // 0–1
      minutes: 48,
      notes: `${wl}${tmPts && oppPts ? ` ${tmPts}-${oppPts}` : ''}`.trim()
    });
  }

  data = out;
  console.log('Loaded rows:', data.length);
  console.table(data.slice(0,5));
  populateOpponents();
  renderAll();
  console.log(data);
}).catch(err => console.error('CSV text load error:', err));


