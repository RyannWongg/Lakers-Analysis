// ---- Parse + global data ----
const parseDate  = d3.timeParse('%d/%m/%Y');
let data = [];

// Expose data and state globally for other modules
window.data = data;
window.state = null;

// =============== STATE & DOM ===============
const state = {
  type: 'all',
  opponent: 'all',
  range: null,
  smooth: false
};

// Expose state globally for other modules
window.state = state;

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

// Move only the Smoothing control into the timeline legend
const timelinePanel  = document.querySelector('#timeline').closest('.chart-wrap');
const timelineLegend = timelinePanel?.querySelector('.legend');

// Find the <label> that wraps #smoothChk inside the headerControls we just moved
const smoothLabel = headerControls.querySelector('#smoothChk')?.closest('label');

if (smoothLabel && timelineLegend) {
  const chk = smoothLabel.querySelector('#smoothChk');

  // Rebuild the label content to a "select-like" pill
  smoothLabel.textContent = '';                 // clear original "Smoothing" text
  smoothLabel.classList.add('selectlike');      // apply select-like styling

  const dot = document.createElement('span');
  dot.className = 'pill-dot';

  const txt = document.createElement('span');
  const setText = () => { txt.textContent = chk.checked ? 'Smoothing: On' : 'Smoothing: Off'; };
  setText();

  // Put the hidden checkbox back inside the label (keeps native toggle/accessibility)
  smoothLabel.append(dot, txt, chk);

  // Reflect state with a class
  const sync = () => smoothLabel.classList.toggle('on', chk.checked);
  sync();

  // Update visuals on change
  chk.addEventListener('change', () => { setText(); sync(); });

  // Drop it into the timeline legend and push to the right
  timelineLegend.appendChild(smoothLabel);
  smoothLabel.style.marginLeft = 'auto';
}

// --- Opponent code → Full team name ---
const TEAM_NAMES = {
  ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets', CHA: 'Charlotte Hornets',
  CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers', DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons', GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
  LAC: 'Los Angeles Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies', MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves', NOP: 'New Orleans Pelicans', NYK: 'New York Knicks',
  OKC: 'Oklahoma City Thunder', ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers',
  PHO: 'Phoenix Suns', PHX: 'Phoenix Suns', // cover both codes
  POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs',
  TOR: 'Toronto Raptors', UTA: 'Utah Jazz', WAS: 'Washington Wizards'
};

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
const m = {top: 20, right: 40, bottom: 36, left: 46};
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
// Smoothed moving-average line (will be animated when enabled)
const lineSmooth = gT.append('path')
  .attr('class', 'timeline-smooth')
  .attr('fill', 'none')
  .attr('stroke', 'var(--accent2)')
  .attr('stroke-width', 2)
  .attr('opacity', 0);
const dots = gT.append('g');

const brush = d3.brushX().extent([[0,0],[W,H]]).on('brush end', brushed);
const brushG = gT.append('g').attr('class', 'brush').call(brush);

// --- Date range display helpers ---
function formatRange(d0, d1) {
  const fmt = d3.timeFormat('%b %d, %Y');
  if (!d0 || !d1) return 'All games';
  if (d0.getTime() === d1.getTime()) return fmt(d0);
  return fmt(d0) + ' – ' + fmt(d1);
}
function updateRangeDisplays() {
  const allDates = data.map(d => d.date).sort((a,b) => a - b);
  if (!allDates.length) return;
  const fullStart = allDates[0];
  const fullEnd   = allDates[allDates.length - 1];
  const [start, end] = state.range ? state.range : [fullStart, fullEnd];
  const txt = 'Date: ' + formatRange(start, end);
  const elTimeline = document.getElementById('timeline-range');
  const elBeeswarm = document.getElementById('beeswarm-range');
  if (elTimeline) elTimeline.textContent = txt;
  if (elBeeswarm) elBeeswarm.textContent = txt;
}

function renderTimeline() {
  const fAll = data.filter(d => (state.type === 'all' || d.type === state.type)
                             && (state.opponent === 'all' || d.opponent === state.opponent));
  xT.domain(d3.extent(fAll, d => d.date));
  const tickVals = d3.range(Y_MIN, Y_MAX + 1e-9, 0.10);

  // --- Month ticks formatted as YYYY-MM ---
  const [x0, x1] = xT.domain();
  const monthSpan = d3.timeMonth.count(x0, x1);

  // adapt the step so labels don’t crowd when the span is long
  const monthStep =
    monthSpan > 24 ? 3 :        // every 3 months if > 2 years
    monthSpan > 12 ? 2 : 1;     // every 2 months if > 1 year, else monthly

  const fmtYM = d3.timeFormat('%Y-%m');

  xAxisT.call(
    d3.axisBottom(xT)
      .ticks(d3.timeMonth.every(monthStep))
      .tickFormat(d => fmtYM(d))
      .tickSizeOuter(0)
  );

  // --- X-axis label: "Game date" ---
  gT.selectAll('.x-axis-label')
    .data([0])
    .join('text')
    .attr('class', 'x-axis-label')
    .attr('x', W / 2)
    .attr('y', H + 40)                 // a bit below the axis ticks
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--muted)')
    .attr('font-size', 12)
    .text('Game date (YYYY–MM)');


  // keep your axis label styling
  xAxisT.selectAll('text').attr('fill', 'var(--muted)');
  yAxisT.call(d3.axisLeft(yT)
    .tickValues(tickVals)
    .tickFormat(d3.format('.0%'))
    .tickSizeOuter(0))
    .selectAll('text').attr('fill', 'var(--muted)');
  // --- Y-axis label: "FG%" ---
  gT.selectAll('.y-axis-label')
    .data([0])
    .join('text')
    .attr('class', 'y-axis-label')
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--muted)')
    .attr('font-size', 12)
    .attr('transform', `translate(${-36}, ${H / 2}) rotate(-90)`)
    .text('FG%');
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
  // Handle smoothing animation
  lineSmooth.attr('d', lGen(sm));
  const originalOpacityTarget = state.smooth ? 0.35 : 1;
  line.transition().duration(500).ease(d3.easeCubicOut).attr('opacity', originalOpacityTarget);

  if (state.smooth) {
    // Animate the smooth line drawing if just turned on
    const len = lineSmooth.node().getTotalLength();
    // If currently hidden (opacity 0), set up stroke-dash animation
    if (+lineSmooth.attr('opacity') === 0) {
      lineSmooth
        .attr('stroke-dasharray', len + ' ' + len)
        .attr('stroke-dashoffset', len)
        .attr('opacity', 1)
        .transition()
          .duration(750)
          .ease(d3.easeCubicOut)
          .attr('stroke-dashoffset', 0);
    } else {
      // Already visible; just ensure opacity 1
      lineSmooth.transition().duration(400).attr('opacity', 1);
    }
  } else {
    // Turn smoothing off: fade out line smoothly and reset dash props
    lineSmooth.transition()
      .duration(400)
      .ease(d3.easeCubicOut)
      .attr('opacity', 0)
      .on('end', () => {
        lineSmooth.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
      });
  }

  const tt = d3.select('#tt');
  const fmtPct = d3.format('.1%');
const fmtDate = d3.timeFormat('%b %d, %Y');

dots.selectAll('circle')
  .data(f, d => d.date)
  .join(
    enter => enter.append('circle')
      .attr('r', 3.5)
      .attr('cx', d => xT(d.date))
      .attr('cy', d => yT(d.fg))
      .attr('fill', 'var(--accent)')
      .style('cursor', 'default')
      .on('mouseenter', (evt, d) => {
        const tt = d3.select('#tt');
        tt.html(
          `<b>${fmtPct(d.fg)}</b><br/>${fmtDate(d.date)}`
        )
        .style('left', (evt.clientX + 12) + 'px')
        .style('top',  (evt.clientY + 12) + 'px')
        .style('opacity', 1);
      })
      .on('mousemove', (evt) => {
        d3.select('#tt')
          .style('left', (evt.clientX + 12) + 'px')
          .style('top',  (evt.clientY + 12) + 'px');
      })
      .on('mouseleave', () => d3.select('#tt').style('opacity', 0)),
    update => update
      .attr('cx', d => xT(d.date))
      .attr('cy', d => yT(d.fg))
  );

  // --- Add annotations for notable games ---
  // Find games with exceptional FG% (top 5% and bottom 5%)
  const sortedByFG = [...f].filter(d => (d.makes + d.misses) >= 5).sort((a, b) => b.fg - a.fg);
  const topGames = sortedByFG.slice(0, Math.min(3, Math.ceil(sortedByFG.length * 0.05)));
  const bottomGames = sortedByFG.slice(-Math.min(3, Math.ceil(sortedByFG.length * 0.05)));
  
  gT.selectAll('.annotation-line,.annotation-label').remove();
  
  const notableGames = [...topGames, ...bottomGames];
  
  // Add annotation lines and labels
  notableGames.forEach(game => {
    const cx = xT(game.date);
    const cy = yT(game.fg);
    const isTop = topGames.includes(game);
    
    // Annotation line
    gT.append('line')
      .attr('class', 'annotation-line')
      .attr('x1', cx)
      .attr('x2', cx)
      .attr('y1', cy)
      .attr('y2', isTop ? cy - 30 : cy + 15)
      .attr('stroke', isTop ? 'var(--good)' : 'var(--bad)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0.6);
    
    // Annotation label with background for readability
    const labelText = `${fmtPct(game.fg)} ${game.opponent}`;
    const labelGroup = gT.append('g').attr('class', 'annotation-label');
    
    // Background rectangle for better readability
    const tempText = gT.append('text')
      .attr('font-size', 10)
      .attr('font-weight', 700)
      .text(labelText);
    const bbox = tempText.node().getBBox();
    tempText.remove();
    
    labelGroup.append('rect')
      .attr('x', cx - bbox.width / 2 - 3)
      .attr('y', (isTop ? cy - 40 : cy + 20) - bbox.height + 2)
      .attr('width', bbox.width + 6)
      .attr('height', bbox.height + 2)
      .attr('fill', 'var(--panel)')
      .attr('rx', 3);
    
    labelGroup.append('text')
      .attr('x', cx)
      .attr('y', isTop ? cy - 35 : cy + 25)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', isTop ? 'var(--good)' : 'var(--bad)')
      .attr('font-weight', 700)
      .text(labelText)
      .style('pointer-events', 'none');
  });

  brushG.call(brush);
  if (state.range) brushG.call(brush.move, state.range.map(xT));

  renderDonut();
  renderBeeswarm();
  renderKPIs();
  renderSummary();
  updateRangeDisplays();
}

function brushed(event) {
  const sel = event.selection || d3.brushSelection(brushG.node());
  state.range = sel ? sel.map(xT.invert) : null;
  renderDonut();
  renderBeeswarm();
  renderKPIs();
  renderSummary();
  renderPlayerStats(); // Update player stats when brush changes
  updateRangeDisplays();
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
// Adjusted margins to prevent overflow
const mB = { top: 15, right: 15, bottom: 55, left: 115 };  // Increased bottom margin for axis + caption spacing
const WB = vb.width  - mB.left - mB.right;   // inner width
const HB = vb.height - mB.top  - mB.bottom;  // inner height

const gB = svgB.append('g').attr('transform', `translate(${mB.left},${mB.top})`);
const GRAPH_OFFSET = 0; // No offset needed now that we have proper left margin
const xB = d3.scaleBand().range([GRAPH_OFFSET, WB]).padding(0.3);  // increased from 0.2 to 0.3
const yB = d3.scaleLinear().range([HB, 0]);

// Raise the x-axis slightly so both tick labels and the caption sit fully inside the SVG
const xAxisB = gB.append('g').attr('transform', `translate(0,${HB - 18})`);
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

function stackHeight(radii, base, pad){
  if (!radii.length) return 0;
  // larger near midline (you already sort like that in placement)
  radii = radii.slice().sort((a,b) => b - a);
  let h = base + radii[0];                // first dot: base + r0
  for (let i = 1; i < radii.length; i++) {
    h += (radii[i-1] + pad + radii[i]);   // gap: prevR + pad + curR
  }
  return h; // distance from midline to bottom of last circle
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

  xAxisB.call(d3.axisBottom(xB)
    .tickSizeOuter(0))  // Remove outer ticks for cleaner look
  // Enlarge horizontal opponent team labels (tick text) and keep hover handlers
  xAxisB.selectAll('text')
    .attr('font-size', 14)
    .attr('fill','var(--muted)')
    .attr('font-weight', 600)
    .style('cursor','default')
    .on('mouseenter', (evt, code) => {
      const tt = d3.select('#tt');
      const name = TEAM_NAMES[code] || code;
      d3.select(evt.currentTarget).attr('fill', '#fff'); // highlight label
      tt.html(`Lakers VS <b>${name}</b>`)
        .style('left', (evt.clientX + 12) + 'px')
        .style('top',  (evt.clientY + 12) + 'px')
        .style('opacity', 1);
    })
    .on('mousemove', (evt) => {
      d3.select('#tt')
        .style('left', (evt.clientX + 12) + 'px')
        .style('top',  (evt.clientY + 12) + 'px');
    })
    .on('mouseleave', (evt) => {
      d3.select(evt.currentTarget).attr('fill','var(--muted)');
      d3.select('#tt').style('opacity', 0);
    });
  // --- X-axis label for beeswarm ---
  gB.selectAll('.x-axisB-label')
    .data([0])
    .join('text')
    .attr('class', 'x-axisB-label')
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--muted)')
  .attr('font-size', 14)
    // center under the inner plot area
    .attr('x', WB / 2)
  // Move caption up so it no longer sits outside the viewBox (was HB + 20 with only 15px bottom margin)
  .attr('y', HB + 32)
    .text('Opponents (teams the Lakers played against)');
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
  // Position legends within the reduced left margin area
  const FG_LEFT_X = -25;     // Adjusted to fit within smaller left margin
  const LINE_H    = 22;      // tspans line height (increased for more spacing)
  
  // Position FG% label and value centered on the midline (horizontal axis)
  const FG_CAP_DY = -3;      // caption "FG%" slightly above midline
  const FG_VAL_DY = 13;      // percentage value slightly below midline
  
  // Calculate symmetric spacing: both legends should have equal distance from midline
  // Each legend has 4 lines: 3 size descriptions + 1 label
  const LEGEND_BLOCK_HEIGHT = LINE_H * 3; // height for the 3 size description lines
  const LEGEND_GAP = 36; // spacing from midline to nearest label (more breathing room)
  
  // Start y for the top block ("big=25", "med=5", "small=1", "Makes")
  // The "Makes" label should be at the same distance from midline as "Misses"
  const MAKE_Y = -(LEGEND_BLOCK_HEIGHT + LINE_H + LEGEND_GAP);  // Spacing from midline
  
  // Start y for the bottom block ("Misses", "big=25", "med=5", "small=1")
  // Move Misses legend 7 pixels lower
  const MISS_Y = LEGEND_GAP + 10;  // Spacing from midline + a bit lower

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
  // --- Deterministic vertical stacking from the midline (no overlap) ---
  const grouped = d3.group(nodes, d => d.opponent, d => d.side);

  // helper: compute half-column height for a side (no positions needed)
  function stackHeight(radii, base, pad) {
    if (!radii.length) return 0;
    // first dot sits at "base" from midline; then we add (prevR + pad + r)
    let h = base; 
    let lastR = 0, first = true;
    for (const r of radii.sort((a,b)=>b-a)) {
      if (first) { h = base; first = false; }
      else { h += (lastR + pad + r); }
      lastR = r;
    }
    return h;
  }

  // === 1) Compute global vertical scale so the tallest stack fits ===
  const HALF_AVAIL = HB / 2 - 25; // Increased breathing room to prevent overflow
  let worst = 0;

  for (const [opp, bySide] of grouped) {
    for (const side of ['make', 'miss']) {
      const arr = bySide.get(side) || [];
      if (!arr.length) continue;
      const radii = arr.map(d => d.r);                 // current radii
      const h = stackHeight(radii, INNER_PX, PAD);     // unscaled
      if (h > worst) worst = h;
    }
  }

  let s = Math.min(1, worst ? HALF_AVAIL / worst : 1);

  // scaled radii & spacings (initial)
  let rBigS   = rBig   * s;
  let rMedS   = rMed   * s;
  let rSmallS = rSmall * s;
  let BASE_S  = INNER_PX * s;
  let PAD_S   = PAD * s;

  // === 2) Enforce a minimum radius so tiny dots don’t vanish ===
  const MIN_R = 1.5;
  for (const n of nodes) {
    const scaled = n.count === 25 ? rBigS : (n.count === 5 ? rMedS : rSmallS);
    n.r = Math.max(MIN_R, scaled);
  }

  // Post-check: if min-capping made any column too tall, apply a small extra scale
  let worst2 = 0;
  for (const [opp, bySide] of grouped) {
    for (const side of ['make', 'miss']) {
      const arr = bySide.get(side) || [];
      if (!arr.length) continue;
      const radii2 = arr.map(d => d.r);                // after MIN_R
      const h2 = stackHeight(radii2, BASE_S, PAD_S);   // scaled + capped
      if (h2 > worst2) worst2 = h2;
    }
  }
  if (worst2 > HALF_AVAIL) {
    const s2 = HALF_AVAIL / worst2;
    for (const n of nodes) n.r *= s2;  // shrink radii a touch
    BASE_S *= s2;                      // and spacing/base equally
    PAD_S  *= s2;
  }

  // Remove compressed note display
  gB.selectAll('.compressed-note').remove();

  // === 3) Now place dots, using final BASE_S / PAD_S / n.r ===
  for (const [opp, bySide] of grouped) {
    const cx = xB(opp) + colBW / 2;

    function placeSide(side, sign) {
      const arr = bySide.get(side) || [];
      // Larger dots closer to midline
      arr.sort((a, b) => b.r - a.r);

      let cumOffset = 0;
      let lastR = 0;
      arr.forEach((d, i) => {
        if (i === 0) {
          d.x = cx;
          d.y = midY + sign * (BASE_S);
        } else {
          cumOffset += (lastR + PAD_S + d.r);
          d.x = cx;
          d.y = midY + sign * (BASE_S + cumOffset);
        }
        lastR = d.r;
      });
    }

    placeSide('make', -1); // up
    placeSide('miss', +1); // down
  }

  // --- Midline ---
  gB.selectAll('.midline').remove(); // Clear any existing midline
  gB.append('line')
    .attr('class', 'midline')
    .attr('x1', GRAPH_OFFSET).attr('x2', WB)  // Start from graph area, not left edge
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
    .attr('y', midY + FG_CAP_DY - 7)
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
    .text(d3.format('.1%')(overallFG));

  // --- LEFT multi-line "Makes" block (four lines) ---
  const makeBlock = gB.append('text')
    .attr('class', 'fgBlockMake')
    .attr('x', FG_LEFT_X)
    .attr('y', midY + MAKE_Y - 10)
    .attr('text-anchor', 'end');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 20).attr('fill', 'var(--muted)')
    .text('big = 25');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 20).attr('fill', 'var(--muted)')
    .text('med = 5');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 20).attr('fill', 'var(--muted)')
    .text('small = 1');

  makeBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 21.5).attr('fill', 'var(--good)')
    .attr('font-weight', 800)
  .text('Makes basket');

  // --- LEFT multi-line "Misses" block (four lines) ---
  const missBlock = gB.append('text')
    .attr('class', 'fgBlockMiss')
    .attr('x', FG_LEFT_X)
    .attr('y', midY + MISS_Y + 6)
    .attr('text-anchor', 'end');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', 0)
    .attr('font-size', 21.5).attr('fill', 'var(--bad)')
    .attr('font-weight', 800)
  .text('Misses basket');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 20).attr('fill', 'var(--muted)')
    .text('big = 25');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 20).attr('fill', 'var(--muted)')
    .text('med = 5');

  missBlock.append('tspan')
    .attr('x', FG_LEFT_X).attr('dy', LINE_H)
    .attr('font-size', 20).attr('fill', 'var(--muted)')
    .text('small = 1');

  // --- Add hover rectangles for each column to show game count ---
  const tt = d3.select('#tt');
  
  // Calculate how many games were played against each opponent
  const gamesPerOpponent = d3.rollup(
    f,
    v => v.length,
    d => d.opponent
  );

  gB.selectAll('rect.column-hover')
    .data(opponents)
    .join('rect')
      .attr('class', 'column-hover')
      .attr('x', d => xB(d))
      .attr('y', 0)
      .attr('width', colBW)
      .attr('height', HB)
      .attr('fill', 'transparent')
      .attr('cursor', 'pointer')
      .on('mouseenter', (evt, opp) => {
        const gameCount = gamesPerOpponent.get(opp) || 0;
        const teamName = TEAM_NAMES[opp] || opp;
        const oppData = byOpp.find(([o]) => o === opp)?.[1];
        const fg = oppData && oppData.attempts ? (oppData.makes / oppData.attempts) : 0;
        
        // Highlight the column
        d3.select(evt.currentTarget).attr('fill', 'rgba(253, 185, 39, 0.15)');
        
        tt.html(
          `<b>${teamName}</b><br/>` +
          `Games played: ${gameCount}<br/>` +
          `FG%: ${d3.format('.1%')(fg)}<br/>` +
          `Makes basket: ${oppData?.makes || 0} | Misses basket: ${oppData?.misses || 0}`
        )
        .style('left', (evt.clientX + 12) + 'px')
        .style('top',  (evt.clientY + 12) + 'px')
        .style('opacity', 1);
      })
      .on('mousemove', (evt) => {
        tt.style('left', (evt.clientX + 12) + 'px')
          .style('top',  (evt.clientY + 12) + 'px');
      })
      .on('mouseleave', (evt) => {
        d3.select(evt.currentTarget).attr('fill', 'transparent');
        tt.style('opacity', 0);
      });


  // --- Draw dots ---
  gB.selectAll('circle.dot')
    .data(nodes, (d, i) => `${d.opponent}-${d.side}-${d.count}-${i}`)
    .join(
      enter => enter.append('circle')
        .attr('class', 'dot') // .dot has floatY,floatX animations via CSS
        .attr('r', d => d.r)
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('fill', d => d.side === 'make' ? 'var(--good)' : 'var(--bad)')
        .attr('opacity', 0.95)

        // floating animation: per-dot randomness
        .style('--ampY', () => (0.6 + Math.random()*0.8).toFixed(2) + 'px')  // ~0.6–1.4px
        .style('--offsetY', () => ((Math.random()*2 - 1) * 1.5).toFixed(2) + 'px')
        .style('--ampX', () => (0.4 + Math.random()*0.6).toFixed(2) + 'px')  // ~0.4–1.0px
        .style('--offsetX', () => ((Math.random()*2 - 1) * 1.0).toFixed(2) + 'px')

        // set durations via CSS vars (don’t set animation-duration directly)
        .style('--durY', () => (0.25 + Math.random()*0.25).toFixed(2) + 's') // ~0.25–0.50s
        .style('--durX', () => (0.35 + Math.random()*0.30).toFixed(2) + 's') // ~0.35–0.65s

        // optional: start at random phase
        .style('animation-delay', () =>
          `${(-Math.random()*3).toFixed(2)}s, ${(-Math.random()*3).toFixed(2)}s`
        )

        .on('mouseenter', (evt, d) => {
          tt.html(
            `<b>${d.opponent}</b><br/>` +
            `${d.side === 'make' ? 'Makes basket' : 'Misses basket'}: ${d.count}`
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
  if (!el) return; // Guard: summary container not present
  el.innerHTML = `
    <li>Games: ${f.length || '–'}</li>
    <li>FG%: ${(fg*100).toFixed(1)}%</li>
    <li>Attempts: ${atts}</li>
    <li>Avg Pace (min/game): ${minutes.toFixed(1)}</li>
  `;
}

// ---- Calculate and render insights ----
function renderInsights() {
  const f = filtered();
  const insightsEl = document.querySelector('#insights-grid');
  
  if (!insightsEl) return;
  
  if (f.length === 0) {
    insightsEl.innerHTML = '';
    return;
  }
  
  // Calculate insights
  const totalMakes = d3.sum(f, d => d.makes || 0);
  const totalMisses = d3.sum(f, d => d.misses || 0);
  const totalAttempts = totalMakes + totalMisses;
  const overallFG = totalAttempts ? (totalMakes / totalAttempts) : 0;
  
  // Find best and worst games
  const gamesWithFG = f.map(d => ({
    ...d,
    fg: (d.makes + d.misses) > 0 ? d.makes / (d.makes + d.misses) : 0
  })).filter(d => (d.makes + d.misses) >= 5); // At least 5 attempts
  
  const bestGame = gamesWithFG.length > 0 
    ? gamesWithFG.reduce((a, b) => a.fg > b.fg ? a : b)
    : null;
  const worstGame = gamesWithFG.length > 0
    ? gamesWithFG.reduce((a, b) => a.fg < b.fg ? a : b)
    : null;
  
  // Best opponent performance
  const byOpponent = d3.rollups(
    f,
    v => {
      const makes = d3.sum(v, d => d.makes || 0);
      const misses = d3.sum(v, d => d.misses || 0);
      const attempts = makes + misses;
      return {
        games: v.length,
        makes,
        misses,
        attempts,
        fg: attempts ? makes / attempts : 0
      };
    },
    d => d.opponent
  );
  
  const bestOpponent = byOpponent.length > 0
    ? byOpponent.filter(([_, stats]) => stats.games >= 1)
        .reduce((a, b) => a[1].fg > b[1].fg ? a : b)
    : null;
  
  // Calculate trend (comparing first half vs second half)
  let trend = '';
  if (f.length >= 6) {
    const mid = Math.floor(f.length / 2);
    const firstHalf = f.slice(0, mid);
    const secondHalf = f.slice(mid);
    
    const fhMakes = d3.sum(firstHalf, d => d.makes || 0);
    const fhAtts = fhMakes + d3.sum(firstHalf, d => d.misses || 0);
    const fhFG = fhAtts ? fhMakes / fhAtts : 0;
    
    const shMakes = d3.sum(secondHalf, d => d.makes || 0);
    const shAtts = shMakes + d3.sum(secondHalf, d => d.misses || 0);
    const shFG = shAtts ? shMakes / shAtts : 0;
    
    const change = ((shFG - fhFG) / fhFG * 100);
    if (Math.abs(change) > 2) {
      trend = change > 0 
        ? `improving (+${change.toFixed(1)}%)`
        : `declining (${change.toFixed(1)}%)`;
    } else {
      trend = 'stable';
    }
  }
  
  // Home vs Away split
  const homeGames = f.filter(d => d.type === 'home');
  const awayGames = f.filter(d => d.type === 'away');
  const homeFG = homeGames.length > 0 
    ? d3.sum(homeGames, d => d.makes) / (d3.sum(homeGames, d => d.makes + d.misses) || 1)
    : 0;
  const awayFG = awayGames.length > 0
    ? d3.sum(awayGames, d => d.makes) / (d3.sum(awayGames, d => d.makes + d.misses) || 1)
    : 0;
  
  // Render insight cards
  const insights = [];
  
  if (bestGame) {
    insights.push({
      label: '🎯 Best Performance',
      value: d3.format('.1%')(bestGame.fg),
      detail: `vs ${TEAM_NAMES[bestGame.opponent] || bestGame.opponent}`
    });
  }
  
  if (worstGame && f.length > 1) {
    insights.push({
      label: '📉 Toughest Game',
      value: d3.format('.1%')(worstGame.fg),
      detail: `vs ${TEAM_NAMES[worstGame.opponent] || worstGame.opponent}`
    });
  }
  
  if (bestOpponent) {
    insights.push({
      label: '🏆 Best Matchup',
      value: d3.format('.1%')(bestOpponent[1].fg),
      detail: `vs ${TEAM_NAMES[bestOpponent[0]] || bestOpponent[0]} (${bestOpponent[1].games} game${bestOpponent[1].games > 1 ? 's' : ''})`
    });
  }
  
  if (homeGames.length > 0 && awayGames.length > 0) {
    insights.push({
      label: '🏠 Home vs Away',
      value: d3.format('.1%')(homeFG),
      detail: `Home: ${d3.format('.1%')(homeFG)} • Away: ${d3.format('.1%')(awayFG)}`
    });
  }
  
  insightsEl.innerHTML = insights.map(ins => `
    <div class="insight-card">
      <div class="insight-label">${ins.label}</div>
      <div class="insight-value">${ins.value}</div>
      <div class="insight-detail">${ins.detail}</div>
    </div>
  `).join('');
}

function renderAll() {
  renderTimeline();
  renderDonut();
  renderBeeswarm();
  renderKPIs();
  renderSummary();
  renderInsights();
}

// ---- Data loader (use your CSV from /data) ----
// If you used my cleaned file name, this will Just Work™
// ---- Loader that handles the duplicate "Opp" headers by index ----
d3.text('./data/lakers_2024-2025_regular_season.csv').then(text => {
  const rows = d3.csvParseRows(text);
  const H = rows[0].map(h => h.trim());
  const R = rows.slice(1);

  // find column indices (unique ones are straightforward)
  const iRk   = H.indexOf('Rk');             // season game number 1..82
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

  if ([iRk,iDate,iType,iRslt,iTm,iFG,iFGA,iOppCode,iOppPts].some(i => i < 0)) {
    console.warn('Header detection failed. Headers were:', H);
  }

  const out = [];
  for (const row of R) {
    const dateStr = (row[iDate] || '').trim();
    if (!dateStr) continue;

    const dt = parseDate(dateStr);                 // you already set: d3.timeParse('%d/%m/%Y')
    if (!dt || isNaN(+dt)) continue;

  const rkRaw    = row[iRk];
  const rk       = rkRaw != null && rkRaw !== '' ? +rkRaw : NaN; // expected 1..82
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
      gameNumber: isFinite(rk) ? rk : (out.length + 1), // prefer Rk, fallback to row order
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
  window.data = data; // Update global reference
  console.log('Loaded rows:', data.length);
  console.table(data.slice(0,5));
  populateOpponents();
  
  // Initialize player cards and stats (from separate modules)
  initPlayerCards();
  renderAll();
  renderPlayerStats(); // Initial render (will show loading state)
  
  loadPlayerStats().then(() => {
    console.log('Player stats loaded, updating display...');
    renderPlayerStats(); // Update with actual data
  }).catch(err => {
    console.error('Error loading player stats:', err);
    renderPlayerStats(); // Still render to show error state
  });

}).catch(err => console.error('CSV text load error:', err));