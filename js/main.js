// ---- Parse + global data ----
const parseDate  = d3.timeParse('%d/%m/%Y');
let data = [];

// Player cards data
const playerCards = [
  { name: 'LeBron James', file: 'lebron_james.webp', firstName: 'LeBron' },
  { name: 'Anthony Davis', file: 'anthony_davis.webp', firstName: 'Anthony' },
  { name: 'Austin Reaves', file: 'austin_reaves.webp', firstName: 'Austin' },
  { name: "D'Angelo Russell", file: "d'angelo russell.webp", firstName: "D'Angelo" },
  { name: 'Rui Hachimura', file: 'rui_hachimura.webp', firstName: 'Rui' },
  { name: 'Dalton Knecht', file: 'dalton_knecht.webp', firstName: 'Dalton' },
  { name: 'Jaxson Hayes', file: 'jaxson_hayes.webp', firstName: 'Jaxson' },
  { name: 'Max Christie', file: 'max_christie.webp', firstName: 'Max' },
  { name: 'Gabe Vincent', file: 'gabe_vincent.webp', firstName: 'Gabe' },
  { name: 'Bronny James', file: 'bronny_james.webp', firstName: 'Bronny' },
  { name: 'Luke Doncic', file: 'luke_doncic.webp', firstName: 'Luke' }
];

let currentPlayerIndex = 0; // Default to LeBron James

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

// Move header controls into the beeswarm panel (top-right of the #bars panel)
const headerControls = document.querySelector('header .controls');
const beeswarmPanel  = document.querySelector('#bars').closest('.chart-wrap');
if (headerControls && beeswarmPanel) {
  beeswarmPanel.appendChild(headerControls);
  headerControls.classList.add('beeswarm-controls');
  headerControls.classList.remove('panel'); // optional: drop panel styling
}


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
const mB = { top: 10, right: 5, bottom: 30, left: 150 };
const WB = vb.width  - mB.left - mB.right;   // inner width
const HB = vb.height - mB.top  - mB.bottom;  // inner height

const gB = svgB.append('g').attr('transform', `translate(${mB.left},${mB.top})`);
const GRAPH_OFFSET = 30; // shift graph content to the right
const xB = d3.scaleBand().range([GRAPH_OFFSET, WB]).padding(0.3);  // increased from 0.2 to 0.3
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
  const UNIT_BIG = 25;                // big dot = 25 attempts
  const UNIT_MED = 5;                 // medium dot = 5 attempts
  const UNIT_SML = 1;                 // small dot = 1 attempt
  const colBW  = xB.bandwidth();
  const rBig   = Math.min(20, colBW * 0.43);  // increased from 13 to 20, and 0.32 to 0.43
  const rMed   = rBig * Math.sqrt(UNIT_MED / UNIT_BIG);   // sqrt(5/25) = 0.447 for area scaling
  const rSmall = rBig * Math.sqrt(UNIT_SML / UNIT_BIG);   // sqrt(1/25) = 0.2 for area scaling
  const midY   = HB / 2;

  // Vertical stacking from midline outward (no force sim)
  const INNER_PX = 31;                // first dot offset from midline (increased by 5)
  const PAD      = 2.5;               // space between stacked dots (increased from 0.7)

  // Per-opponent FG% label (centered per column, at midline)
  const FG_LABEL_SIZE = 12;           // increased from 9 to 12
  const FG_LABEL_DY   = 3;

  // === Overall FG% + left labels ===
  // Adjust these to move the block + spacing
  const FG_LEFT_X = 15;     // positive value moves legends to the right
  const LINE_H    = 18;      // tspans line height (increased from 14 to 18 for more spacing)
  
  // Position FG% label and value centered on the midline (horizontal axis)
  const FG_CAP_DY = -3;      // caption "FG%" slightly above midline
  const FG_VAL_DY = 13;      // percentage value slightly below midline
  
  // Calculate symmetric spacing: both legends should have equal distance from midline
  // Each legend has 4 lines: 3 size descriptions + 1 label
  const LEGEND_BLOCK_HEIGHT = LINE_H * 3; // height for the 3 size description lines
  const LEGEND_GAP = 25; // spacing from midline to nearest label
  
  // Start y for the top block ("big=25", "med=5", "small=1", "Makes")
  // The "Makes" label should be at the same distance from midline as "Misses"
  const MAKE_Y = -(LEGEND_BLOCK_HEIGHT + LINE_H + LEGEND_GAP);  // Spacing from midline
  
  // Start y for the bottom block ("Misses", "big=25", "med=5", "small=1")
  // Move Misses legend 7 pixels lower
  const MISS_Y = LEGEND_GAP + 7;  // Spacing from midline + 7px lower

  // --- Build nodes (three sizes: 25, 5, and 1) ---
  let nodes = [];
  for (const [opponent, agg] of byOpp) {
    // MAKES: break down into 25s, 5s, and 1s
    let remainingMakes = agg.makes;
    const m25 = Math.floor(remainingMakes / UNIT_BIG);
    remainingMakes -= m25 * UNIT_BIG;
    const m5 = Math.floor(remainingMakes / UNIT_MED);
    remainingMakes -= m5 * UNIT_MED;
    const m1 = Math.floor(remainingMakes / UNIT_SML);
    remainingMakes -= m1 * UNIT_SML;
    
    for (let i = 0; i < m25; i++) nodes.push({ opponent, side: 'make',  count: UNIT_BIG, r: rBig });
    for (let i = 0; i < m5;  i++) nodes.push({ opponent, side: 'make',  count: UNIT_MED, r: rMed });
    for (let i = 0; i < m1;  i++) nodes.push({ opponent, side: 'make',  count: UNIT_SML, r: rSmall });
    
    // MISSES: break down into 25s, 5s, and 1s
    let remainingMisses = agg.misses;
    const x25 = Math.floor(remainingMisses / UNIT_BIG);
    remainingMisses -= x25 * UNIT_BIG;
    const x5 = Math.floor(remainingMisses / UNIT_MED);
    remainingMisses -= x5 * UNIT_MED;
    const x1 = Math.floor(remainingMisses / UNIT_SML);
    remainingMisses -= x1 * UNIT_SML;
    
    for (let i = 0; i < x25; i++) nodes.push({ opponent, side: 'miss',  count: UNIT_BIG, r: rBig });
    for (let i = 0; i < x5;  i++) nodes.push({ opponent, side: 'miss',  count: UNIT_MED, r: rMed });
    for (let i = 0; i < x1;  i++) nodes.push({ opponent, side: 'miss',  count: UNIT_SML, r: rSmall });
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
    .attr('font-size', 16)
    .attr('fill', 'var(--muted)')
    .text('FG%');

  gB.append('text')
    .attr('class', 'fgOverall')
    .attr('x', FG_LEFT_X)
    .attr('y', midY + FG_VAL_DY)
    .attr('text-anchor', 'end')
    .attr('font-size', 19)
    .attr('font-weight', 700)
    .attr('fill', '#fff')
    .text(d3.format('.0%')(overallFG));

  // --- LEFT multi-line "Makes" block (four lines) ---
  const makeBlock = gB.append('text')
    .attr('class', 'fgBlockMake')
    .attr('x', FG_LEFT_X)
    .attr('y', midY + MAKE_Y)
    .attr('text-anchor', 'end');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 15).attr('fill', 'var(--muted)')
    .text('big = 25');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 15).attr('fill', 'var(--muted)')
    .text('med = 5');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 15).attr('fill', 'var(--muted)')
    .text('small = 1');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 16).attr('fill', 'var(--good)')
    .attr('font-weight', 600)
    .text('Makes');

  // --- LEFT multi-line "Misses" block (four lines) ---
  const missBlock = gB.append('text')
    .attr('class', 'fgBlockMiss')
    .attr('x', FG_LEFT_X)
    .attr('y', midY + MISS_Y)
    .attr('text-anchor', 'end');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', 0)
    .attr('font-size', 16).attr('fill', 'var(--bad)')
    .attr('font-weight', 600)
    .text('Misses');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 15).attr('fill', 'var(--muted)')
    .text('big = 25');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 15).attr('fill', 'var(--muted)')
    .text('med = 5');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 15).attr('fill', 'var(--muted)')
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
            `${d.side === 'make' ? 'Makes' : 'Misses'}: ${d.count}`
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
  initPlayerCards();
  renderAll();
  console.log(data);

}).catch(err => console.error('CSV text load error:', err));

// =============== PLAYER CARDS ===============
function initPlayerCards() {
  const mainCard = document.getElementById('main-card');
  const mainCardImg = document.getElementById('main-card-img');
  const mainCardName = document.getElementById('main-card-name');
  const cardStack = document.getElementById('card-stack');
  
  // Display default card (LeBron James)
  displayPlayerCard(currentPlayerIndex);
  
  // Create stacked cards for all other players
  playerCards.forEach((player, index) => {
    if (index === currentPlayerIndex) return; // Skip the current player
    
    const stackCard = document.createElement('div');
    stackCard.className = 'stacked-card';
    stackCard.dataset.index = index;
    
    const img = document.createElement('img');
    img.src = `data/player_cards/${player.file}`;
    img.alt = player.name;
    
    const nameLabel = document.createElement('div');
    nameLabel.className = 'stack-name';
    nameLabel.textContent = player.firstName;
    
    stackCard.appendChild(img);
    stackCard.appendChild(nameLabel);
    
    stackCard.addEventListener('click', () => {
      switchPlayer(index);
    });
    
    cardStack.appendChild(stackCard);
  });
}

function displayPlayerCard(index) {
  const player = playerCards[index];
  const mainCardImg = document.getElementById('main-card-img');
  const mainCardName = document.getElementById('main-card-name');
  
  mainCardImg.src = `data/player_cards/${player.file}`;
  mainCardImg.alt = player.name;
  mainCardName.textContent = player.name;
}

function switchPlayer(newIndex) {
  if (newIndex === currentPlayerIndex) return;
  
  const mainCard = document.getElementById('main-card');
  
  // Smooth animation
  mainCard.style.transform = 'scale(0.9) rotateY(90deg)';
  mainCard.style.opacity = '0.5';
  
  setTimeout(() => {
    currentPlayerIndex = newIndex;
    displayPlayerCard(newIndex);
    
    // Rebuild the stack
    const cardStack = document.getElementById('card-stack');
    cardStack.innerHTML = '';
    
    playerCards.forEach((player, index) => {
      if (index === currentPlayerIndex) return;
      
      const stackCard = document.createElement('div');
      stackCard.className = 'stacked-card';
      stackCard.dataset.index = index;
      
      const img = document.createElement('img');
      img.src = `data/player_cards/${player.file}`;
      img.alt = player.name;
      
      const nameLabel = document.createElement('div');
      nameLabel.className = 'stack-name';
      nameLabel.textContent = player.firstName;
      
      stackCard.appendChild(img);
      stackCard.appendChild(nameLabel);
      
      stackCard.addEventListener('click', () => {
        switchPlayer(index);
      });
      
      cardStack.appendChild(stackCard);
    });
    
    // Animate back
    mainCard.style.transform = 'scale(1) rotateY(0deg)';
    mainCard.style.opacity = '1';
  }, 200);
}

// =============== PLAYER CARDS ===============
function initPlayerCards() {
  const mainCard = document.getElementById('main-card');
  const mainCardImg = document.getElementById('main-card-img');
  const mainCardName = document.getElementById('main-card-name');
  const cardStack = document.getElementById('card-stack');
  
  // Display default card (LeBron James)
  displayPlayerCard(currentPlayerIndex);
  
  // Create stacked cards for all other players
  playerCards.forEach((player, index) => {
    if (index === currentPlayerIndex) return; // Skip the current player
    
    const stackCard = document.createElement('div');
    stackCard.className = 'stacked-card';
    stackCard.dataset.index = index;
    
    const img = document.createElement('img');
    img.src = `data/player_cards/${player.file}`;
    img.alt = player.name;
    
    const nameLabel = document.createElement('div');
    nameLabel.className = 'stack-name';
    nameLabel.textContent = player.firstName;
    
    stackCard.appendChild(img);
    stackCard.appendChild(nameLabel);
    
    stackCard.addEventListener('click', () => {
      switchPlayer(index);
    });
    
    cardStack.appendChild(stackCard);
  });
}

function displayPlayerCard(index) {
  const player = playerCards[index];
  const mainCardImg = document.getElementById('main-card-img');
  const mainCardName = document.getElementById('main-card-name');
  
  mainCardImg.src = `data/player_cards/${player.file}`;
  mainCardImg.alt = player.name;
  mainCardName.textContent = player.name;
}

function switchPlayer(newIndex) {
  if (newIndex === currentPlayerIndex) return;
  
  const mainCard = document.getElementById('main-card');
  
  // Smooth animation
  mainCard.style.transform = 'scale(0.9) rotateY(90deg)';
  mainCard.style.opacity = '0.5';
  
  setTimeout(() => {
    currentPlayerIndex = newIndex;
    displayPlayerCard(newIndex);
    
    // Rebuild the stack
    const cardStack = document.getElementById('card-stack');
    cardStack.innerHTML = '';
    
    playerCards.forEach((player, index) => {
      if (index === currentPlayerIndex) return;
      
      const stackCard = document.createElement('div');
      stackCard.className = 'stacked-card';
      stackCard.dataset.index = index;
      
      const img = document.createElement('img');
      img.src = `data/player_cards/${player.file}`;
      img.alt = player.name;
      
      const nameLabel = document.createElement('div');
      nameLabel.className = 'stack-name';
      nameLabel.textContent = player.firstName;
      
      stackCard.appendChild(img);
      stackCard.appendChild(nameLabel);
      
      stackCard.addEventListener('click', () => {
        switchPlayer(index);
      });
      
      cardStack.appendChild(stackCard);
    });
    
    // Animate back
    mainCard.style.transform = 'scale(1) rotateY(0deg)';
    mainCard.style.opacity = '1';
  }, 200);
}

