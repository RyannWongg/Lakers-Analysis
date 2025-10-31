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
const m = {top: 20, right: 16, bottom: 36, left: 46};
const W = 900 - m.left - m.right;
const H = 260 - m.top - m.bottom;
const gT = svgT.append('g').attr('transform', `translate(${m.left},${m.top})`);

const Y_MIN = 0.35, Y_MAX = 0.65;
const xT = d3.scaleTime().range([0, W]);
const yT = d3.scaleLinear().range([H, 0]).domain([Y_MIN, Y_MAX]);

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
  const tickVals = d3.range(Y_MIN, Y_MAX + 1e-9, 0.10);

  xAxisT.call(d3.axisBottom(xT).ticks(6).tickSizeOuter(0)).selectAll('text').attr('fill', 'var(--muted)');
  yAxisT.call(d3.axisLeft(yT)
    .tickValues(tickVals)
    .tickFormat(d3.format('.0%'))
    .tickSizeOuter(0))
    .selectAll('text').attr('fill', 'var(--muted)');
  yAxisT.selectAll('path,line').attr('stroke', 'var(--grid)');

  grid.selectAll('line').data(tickVals).join('line')
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
  renderBeeswarm();
  renderKPIs();
  renderSummary();
}

function brushed(event) {
  const sel = event.selection || d3.brushSelection(brushG.node());
  state.range = sel ? sel.map(xT.invert) : null;
  renderDonut();
  renderBeeswarm();
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
     .attr('fill', '#fff')
     .text(d => (d === '–' ? '–' : d + '%'));
}

// =============== Beeswarm (per opponent) ===============
const svgB = d3.select('#bars');

const vb = svgB.node().viewBox.baseVal;
const mB = { top: 20, right: 16, bottom: 46, left: 46 };
const WB = vb.width  - mB.left - mB.right;   // inner width
const HB = vb.height - mB.top  - mB.bottom;  // inner height

const gB = svgB.append('g').attr('transform', `translate(${mB.left},${mB.top})`);
const xB = d3.scaleBand().range([0, WB]).padding(0.2);
const yB = d3.scaleLinear().range([HB, 0]);

const xAxisB = gB.append('g').attr('transform', `translate(0,${HB})`);
const yAxisB = gB.append('g');

// Keep stacks vertical: snap x near center and compact y to avoid overlaps
function compactVertical(arr, pad = 0.6) {
  // sort by target y so we "sweep" along the column
  arr.sort((a,b) => a.y - b.y);
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i-1], cur = arr[i];
    const minGap = (prev.r + cur.r) + pad; // no-touch distance
    if ((cur.y - prev.y) < minGap) {
      cur.y = prev.y + minGap; // push down just enough
    }
  }
}

// === Beeswarm (per opponent), vertical stacks, UNIT = 20 ===
function renderBeeswarm() {
  const f = filtered();

  // --- Sum makes/misses by opponent ---
  const byOpp = d3.rollups(
    f,
    v => ({
      makes: d3.sum(v, d => d.makes || 0),
      misses: d3.sum(v, d => d.misses || 0),
      attempts: d3.sum(v, d => (d.makes || 0) + (d.misses || 0))
    }),
    d => d.opponent
  );

  // --- Scales & axes (x = opponents) ---
  const opponents = byOpp.map(([opp]) => opp).sort();
  xB.domain(opponents);

  xAxisB.call(d3.axisBottom(xB))
        .selectAll('text')
        .attr('fill','var(--muted)');
  xAxisB.selectAll('path,line').attr('stroke','var(--grid)');
  yAxisB.selectAll('*').remove();

  // Clear previous marks
  gB.selectAll('.midline,.sideLabelTop,.sideLabelBot,circle.dot,text.fgLabel,.fgOverall,.fgOverallCap,.fgBlockMake,.fgBlockMiss').remove();

  // --- Sizes & layout controls ---
  const UNIT   = 20;                  // big dot = 20 attempts
  const colBW  = xB.bandwidth();
  const rBig   = Math.min(10, colBW * 0.26);
  const rSmall = Math.max(3.2, rBig * 0.45);
  const midY   = HB / 2;

  // Vertical stacking from midline outward (no force sim)
  const INNER_PX = 32;                // first dot offset from midline
  const PAD      = 1.0;               // space between stacked dots

  // Per-opponent FG% label (centered per column, at midline)
  const FG_LABEL_SIZE = 10;
  const FG_LABEL_DY   = -2;

  // === Overall FG% + left labels ===
  // Adjust these to move the block + spacing
  const FG_LEFT_X = 1;     // move more negative to go further left
  const FG_CAP_DY = -8;      // caption "FG%" vs midline
  const FG_VAL_DY = +12;     // percentage vs midline
  const LINE_H    = 12;      // tspans line height

  // Start y for the top 3-line block ("Makes", "big=20", "small=1")
  // Place it high enough so it doesn't collide with the FG% caption/value.
  const MAKE_Y = FG_CAP_DY - (LINE_H * 3); // first line starts well above FG%
  // Start y for the bottom 3-line block ("Misses", "big=20", "small=1")
  const MISS_Y = FG_VAL_DY + 22;           // a bit below the FG% value

  // --- Build nodes (two sizes: 20 vs 1) ---
  let nodes = [];
  for (const [opponent, agg] of byOpp) {
    const m20 = Math.floor(agg.makes / UNIT), m1 = agg.makes % UNIT;
    const x20 = Math.floor(agg.misses / UNIT), x1 = agg.misses % UNIT;

    for (let i = 0; i < m20; i++) nodes.push({ opponent, side: 'make',  count: UNIT, r: rBig });
    for (let i = 0; i < m1;  i++) nodes.push({ opponent, side: 'make',  count: 1,    r: rSmall });
    for (let i = 0; i < x20; i++) nodes.push({ opponent, side: 'miss',  count: UNIT, r: rBig });
    for (let i = 0; i < x1;  i++) nodes.push({ opponent, side: 'miss',  count: 1,    r: rSmall });
  }

  // --- Deterministic vertical stacking from the midline (no overlap) ---
  const grouped = d3.group(nodes, d => d.opponent, d => d.side);

  for (const [opp, bySide] of grouped) {
    const cx = xB(opp) + colBW / 2;

    function placeSide(side, sign) {
      const arr = bySide.get(side) || [];
      // Larger circles nearer midline
      arr.sort((a, b) => b.r - a.r);

      let cumOffset = 0;
      let lastR = 0;
      arr.forEach((d, i) => {
        const base = INNER_PX;
        if (i === 0) {
          d.x = cx;
          d.y = midY + sign * base;
        } else {
          cumOffset += (lastR + PAD + d.r);
          d.x = cx;
          d.y = midY + sign * (base + cumOffset);
        }
        lastR = d.r;
      });
    }

    placeSide('make', -1); // up
    placeSide('miss', +1); // down
  }

  // --- Midline ---
  gB.append('line')
    .attr('class', 'midline')
    .attr('x1', 0).attr('x2', WB)
    .attr('y1', midY).attr('y2', midY)
    .attr('stroke', 'var(--grid)');

  // --- Per-opponent FG% labels (centered per column) ---
  const fgMap = new Map(
    byOpp.map(([opp, agg]) => {
      const fg = agg.attempts ? agg.makes / agg.attempts : 0;
      return [opp, fg];
    })
  );

  gB.selectAll('text.fgLabel')
    .data(opponents)
    .join('text')
      .attr('class', 'fgLabel')
      .attr('font-size', FG_LABEL_SIZE)
      .attr('fill', 'var(--muted)')
      .attr('text-anchor', 'middle')
      .attr('x', d => xB(d) + colBW / 2)
      .attr('y', midY + FG_LABEL_DY)
      .text(d => d3.format('.0%')(fgMap.get(d) || 0));

  // --- Overall FG% (center-left) ---
  const totalMakes = d3.sum(f, d => d.makes || 0);
  const totalAtts  = d3.sum(f, d => (d.makes || 0) + (d.misses || 0));
  const overallFG  = totalAtts ? totalMakes / totalAtts : 0;

  gB.append('text')
    .attr('class', 'fgOverallCap')
    .attr('x', FG_LEFT_X)
    .attr('y', midY + FG_CAP_DY)
    .attr('text-anchor', 'end')
    .attr('font-size', 12)
    .attr('fill', 'var(--muted)')
    .text('FG%');

  gB.append('text')
    .attr('class', 'fgOverall')
    .attr('x', FG_LEFT_X)
    .attr('y', midY + FG_VAL_DY)
    .attr('text-anchor', 'end')
    .attr('font-size', 14)
    .attr('font-weight', 700)
    .attr('fill', '#fff')
    .text(d3.format('.0%')(overallFG));

  // --- LEFT multi-line "Makes" block (three lines) ---
  const makeBlock = gB.append('text')
    .attr('class', 'fgBlockMake')
    .attr('x', FG_LEFT_X)
    .attr('y', midY + MAKE_Y)
    .attr('text-anchor', 'end');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', -10)
    .attr('font-size', 11).attr('fill', 'var(--muted)')
    .text('big = 20');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', 13)
    .attr('font-size', 11).attr('fill', 'var(--muted)')
    .text('small = 1');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', 15)
    .attr('font-size', 11).attr('fill', 'var(--good)')
    .text('Makes');

  // --- LEFT multi-line "Misses" block (three lines) ---
  const missBlock = gB.append('text')
    .attr('class', 'fgBlockMiss')
    .attr('x', FG_LEFT_X)
    .attr('y', midY + MISS_Y)
    .attr('text-anchor', 'end');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', 0)
    .attr('font-size', 11).attr('fill', 'var(--bad)')
    .text('Misses');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 11).attr('fill', 'var(--muted)')
    .text('big = 20');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 11).attr('fill', 'var(--muted)')
    .text('small = 1');

  // --- Draw dots ---
  const tt = d3.select('#tt');
  gB.selectAll('circle.dot')
    .data(nodes, (d, i) => `${d.opponent}-${d.side}-${d.count}-${i}`)
    .join(
      enter => enter.append('circle')
        .attr('class', 'dot')
        .attr('r', d => d.r)
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('fill', d => d.side === 'make' ? 'var(--good)' : 'var(--bad)')
        .attr('opacity', 0.95)
        .on('mouseenter', (evt, d) => {
          tt.html(
            `<b>${d.opponent}</b><br/>` +
            `${d.side === 'make' ? 'Makes' : 'Misses'}: ${d.count === UNIT ? UNIT : 1}`
          )
          .style('left', (evt.clientX + 12) + 'px')
          .style('top',  (evt.clientY + 12) + 'px')
          .style('opacity', 1);
        })
        .on('mouseleave', () => tt.style('opacity', 0)),
      update => update
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r',  d => d.r)
    );
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
  renderBeeswarm();
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


