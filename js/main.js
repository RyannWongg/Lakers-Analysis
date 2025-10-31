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

  renderBeeswarm();
  renderKPIs();
  renderSummary();
}

function brushed(event) {
  const sel = event.selection || d3.brushSelection(brushG.node());
  state.range = sel ? sel.map(xT.invert) : null;
  renderBeeswarm();
  renderKPIs();
  renderSummary();
  renderPlayerStats();
}

// =============== Beeswarm (per opponent) ===============
const svgB = d3.select('#bars');
// bars-specific margins & inner size (viewBox of #bars is 900 x 220)
const mB = { top: 20, right: 16, bottom: 46, left: 46 };
const WB = 900 - mB.left - mB.right;   // width inside margins
const HB = 220 - mB.top - mB.bottom;   // height inside margins

const gB = svgB.append('g').attr('transform', `translate(${mB.left},${mB.top})`);
const xB = d3.scaleBand().range([0, WB]).padding(0.2);
const yB = d3.scaleLinear().range([HB, 0]);

const xAxisB = gB.append('g').attr('transform', `translate(0,${HB})`);
const yAxisB = gB.append('g');

function renderBeeswarm() {
  const f = filtered();

  // --- Sum makes/misses by opponent ---
  const byOpp = d3.rollups(
    f,
    v => ({
      makes: d3.sum(v, d => d.makes || 0),
      misses: d3.sum(v, d => d.misses || 0)
    }),
    d => d.opponent
  );

  // --- Two sizes: big = 20 attempts, small = 1 attempt ---
  const UNIT   = 20;     // <<< big dot represents 20
  const rSmall = 3.2;
  const rBig   = 8.0;
  const midY   = H / 2;
  const gap    = 40;

  let nodes = [];
  for (const [opponent, agg] of byOpp) {
    // MAKES
    const bigM = Math.floor(agg.makes / UNIT);
    const remM = agg.makes % UNIT;
    for (let i = 0; i < bigM; i++) nodes.push({ opponent, side:'make',  count: UNIT, r: rBig });
    for (let i = 0; i < remM; i++)  nodes.push({ opponent, side:'make',  count: 1,    r: rSmall });

    // MISSES
    const bigX = Math.floor(agg.misses / UNIT);
    const remX = agg.misses % UNIT;
    for (let i = 0; i < bigX; i++) nodes.push({ opponent, side:'miss',  count: UNIT, r: rBig });
    for (let i = 0; i < remX; i++)  nodes.push({ opponent, side:'miss',  count: 1,    r: rSmall });
  }

  // X scale is opponents; no Y axis
  const opponents = byOpp.map(([opp]) => opp).sort();
  xB.domain(opponents);

  xAxisB.call(d3.axisBottom(xB))
        .selectAll('text')
        .attr('fill','var(--muted)');
  xAxisB.selectAll('path,line').attr('stroke','var(--grid)');
  yAxisB.selectAll('*').remove();

  // Clear old bars/shapes
  gB.selectAll('.bargrp, rect.total, rect.makes, rect.miss').remove();

  // Targets (mirrored around midline)
  nodes.forEach(d => {
    d.xTarget = xB(d.opponent) + xB.bandwidth() / 2;
    d.yTarget = d.side === 'make' ? (midY - gap) : (midY + gap);
  });

  // Draw big on top
  nodes.sort((a,b) => a.count - b.count); // small first, big last

  // Force layout
  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX(d => d.xTarget).strength(0.35))
    .force('y', d3.forceY(d => d.yTarget).strength(0.25))
    .force('collide', d3.forceCollide(d => d.r + 0.9)) // a bit more spacing
    .stop();

  for (let i = 0; i < 260; i++) sim.tick();

  // Midline + labels
  gB.selectAll('.midline').data([0]).join('line')
    .attr('class','midline')
    .attr('x1', 0).attr('x2', W)
    .attr('y1', midY).attr('y2', midY)
    .attr('stroke', 'var(--grid)');

  gB.selectAll('.sideLabelTop').data([0]).join('text')
    .attr('class','sideLabelTop')
    .attr('x', 6).attr('y', midY - gap - 10)
    .attr('fill', 'var(--muted)').attr('font-size', 12)
    .text('Makes — big = 20, small = 1');

  gB.selectAll('.sideLabelBot').data([0]).join('text')
    .attr('class','sideLabelBot')
    .attr('x', 6).attr('y', midY + gap + 16)
    .attr('fill', 'var(--muted)').attr('font-size', 12)
    .text('Misses — big = 20, small = 1');

  // Dots
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
        .attr('r', d => d.r)
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
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
  renderBeeswarm();
  renderKPIs();
  renderSummary();
}

// =============== PLAYER CARD STACK ===============
const playerImages = [
  'anthony_davis.webp',
  'austin_reaves.webp',
  'dalton_knecht.webp',
  'lebron_james.webp',
  'luke_doncic.webp',
  'max_christie.webp',
  'rui_hachimura.webp'
];
const playerNames = [
  'Anthony Davis',
  'Austin Reaves',
  'Dalton Knecht',
  'LeBron James',
  'Luke Doncic',
  'Max Christie',
  'Rui Hachimura'
];

// Map player names to their Basketball Reference IDs
const playerIDs = {
  'Anthony Davis': 'davisan02',
  'Austin Reaves': 'reaveau01',
  'Dalton Knecht': 'knechda01',
  'LeBron James': 'jamesle01',
  'Luke Doncic': 'doncilu01',  // placeholder - adjust if needed
  'Max Christie': 'chrisma02',
  'Rui Hachimura': 'hachiru01'
};

// Store per-game player data
let playerGameData = [];

const playerCardStack = document.getElementById('player-card-stack');
let currentFeaturedIdx = 3; // LeBron James (index 3)

function showFeaturedCard(idx) {
  const featuredContainer = document.querySelector('.featured-card-container');
  if (!featuredContainer) return;
  
  const img = playerImages[idx];
  const name = playerNames[idx];
  
  // Create new featured card with animation
  featuredContainer.innerHTML = `
    <div class="featured-card">
      <img src="data/player_cards/${img}" alt="${name}" />
    </div>
  `;
  
  currentFeaturedIdx = idx;
  
  // Update player stats when card changes
  renderPlayerStats();
}

// =============== PLAYER STATS BAR CHART ===============
function renderPlayerStats() {
  if (playerGameData.length === 0) return; // Data not loaded yet
  
  const currentPlayerName = playerNames[currentFeaturedIdx];
  const currentPlayerID = playerIDs[currentPlayerName];
  
  // Filter player's games based on selected date range
  let playerGames = playerGameData.filter(d => d.playerId === currentPlayerID);
  
  // Apply date range filter if brush selection exists
  if (state.range) {
    playerGames = playerGames.filter(d => 
      d.gameDate >= state.range[0] && d.gameDate <= state.range[1]
    );
  }
  
  // Select and clear SVG
  const svgStats = d3.select('#player-stats');
  svgStats.selectAll('*').remove();
  
  if (playerGames.length === 0) {
    // Display N/A message for players without data
    const gNA = svgStats.append('g').attr('transform', 'translate(200, 180)');
    gNA.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--muted)')
      .attr('font-size', '16px')
      .attr('font-weight', 'bold')
      .text(`${currentPlayerName}`);
    gNA.append('text')
      .attr('x', 0)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--muted)')
      .attr('font-size', '14px')
      .text('N/A - No data available');
    gNA.append('text')
      .attr('x', 0)
      .attr('y', 55)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--muted)')
      .attr('font-size', '12px')
      .text('(for selected range)');
    return;
  }
  
  // Calculate averages
  const avgStats = {
    'FG%': d3.mean(playerGames, d => d.fgPct) * 100,
    '3P%': d3.mean(playerGames, d => d.tpPct) * 100,
    'FT%': d3.mean(playerGames, d => d.ftPct) * 100,
    'ORB': d3.mean(playerGames, d => d.orb),
    'DRB': d3.mean(playerGames, d => d.drb),
    'AST': d3.mean(playerGames, d => d.ast),
    'STL': d3.mean(playerGames, d => d.stl),
    'BLK': d3.mean(playerGames, d => d.blk),
    'TOV': d3.mean(playerGames, d => d.tov),
    'PF': d3.mean(playerGames, d => d.pf),
    'PTS': d3.mean(playerGames, d => d.pts)
  };
  
  // Max values for scaling (percentage stats scale to 100, counting stats to reasonable max)
  const maxValues = {
    'FG%': 100, '3P%': 100, 'FT%': 100,
    'ORB': 5, 'DRB': 15, 'AST': 15, 'STL': 5, 'BLK': 5, 'TOV': 8, 'PF': 6, 'PTS': 40
  };
  
  const marginStats = {top: 20, right: 40, bottom: 10, left: 60};
  const widthStats = 400 - marginStats.left - marginStats.right;
  const heightStats = 360 - marginStats.top - marginStats.bottom;
  
  const gStats = svgStats.append('g').attr('transform', `translate(${marginStats.left},${marginStats.top})`);
  
  const stats = Object.keys(avgStats);
  const yStats = d3.scaleBand().domain(stats).range([0, heightStats]).padding(0.2);
  const xStats = d3.scaleLinear().domain([0, 100]).range([0, widthStats]);
  
  // Add title
  gStats.append('text')
    .attr('x', widthStats / 2)
    .attr('y', -5)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--text)')
    .attr('font-size', '14px')
    .attr('font-weight', 'bold')
    .text(`${currentPlayerName} Stats${playerGames.length > 1 ? ` (Avg of ${playerGames.length} games)` : ''}`);
  
  // Y axis
  gStats.append('g')
    .call(d3.axisLeft(yStats))
    .selectAll('text')
    .attr('fill', 'var(--muted)')
    .attr('font-size', '12px');
  
  gStats.selectAll('path, line').attr('stroke', 'var(--grid)');
  
  // Bars
  const tt = d3.select('#tt');
  const bars = gStats.selectAll('.stat-bar')
    .data(stats)
    .join('g')
    .attr('class', 'stat-bar')
    .attr('transform', d => `translate(0,${yStats(d)})`);
  
  bars.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('height', yStats.bandwidth())
    .attr('width', d => {
      const val = avgStats[d];
      const max = maxValues[d];
      const pct = (val / max) * 100;
      return xStats(Math.min(pct, 100));
    })
    .attr('fill', d => {
      // Color code: percentages in gold, counting stats in purple
      if (d.includes('%')) return 'var(--lakers-gold)';
      return 'var(--lakers-purple)';
    })
    .attr('opacity', 0.85)
    .on('mouseenter', (evt, d) => {
      const val = avgStats[d];
      const display = d.includes('%') ? val.toFixed(1) + '%' : val.toFixed(1);
      tt.html(`<b>${d}</b><br/>${display}`)
        .style('left', (evt.clientX + 12) + 'px')
        .style('top', (evt.clientY + 12) + 'px')
        .style('opacity', 1);
    })
    .on('mouseleave', () => tt.style('opacity', 0));
  
  // Value labels
  bars.append('text')
    .attr('x', d => {
      const val = avgStats[d];
      const max = maxValues[d];
      const pct = (val / max) * 100;
      return xStats(Math.min(pct, 100)) + 5;
    })
    .attr('y', yStats.bandwidth() / 2)
    .attr('dy', '0.35em')
    .attr('fill', 'var(--text)')
    .attr('font-size', '11px')
    .text(d => {
      const val = avgStats[d];
      return d.includes('%') ? val.toFixed(1) + '%' : val.toFixed(1);
    });
}

function initializePlayerCards() {
  if (!playerCardStack) return;
  
  playerCardStack.innerHTML = '';
  
  // Create featured card container (large card in the center)
  const featuredContainer = document.createElement('div');
  featuredContainer.className = 'featured-card-container';
  playerCardStack.appendChild(featuredContainer);
  
  // Show default featured card (LeBron James)
  showFeaturedCard(currentFeaturedIdx);
  
  // Create container for mini cards (stacked layout)
  const miniCardsContainer = document.createElement('div');
  miniCardsContainer.className = 'mini-cards-container';
  
  const totalCards = playerImages.length;
  const stackSpacing = 30; // spacing between each stacked card
  
  // Create mini cards in a stacked layout
  playerImages.forEach((img, idx) => {
    const name = playerNames[idx];
    const firstName = name.split(' ')[0]; // Get only first name
    const miniCard = document.createElement('div');
    miniCard.className = 'mini-card';
    
    // Stack cards with slight offset
    miniCard.style.top = `${idx * stackSpacing}px`;
    miniCard.style.zIndex = totalCards - idx;
    
    miniCard.innerHTML = `
      <img src="data/player_cards/${img}" alt="${name}" />
      <div class="mini-name-overlay">${firstName}</div>
    `;
    
    // Click to feature this card
    miniCard.addEventListener('click', () => {
      showFeaturedCard(idx);
    });
    
    miniCardsContainer.appendChild(miniCard);
  });
  
  playerCardStack.appendChild(miniCardsContainer);
}

if (playerCardStack) {
  initializePlayerCards();
}

// =============== LOAD PER-GAME PLAYER DATA ===============
async function loadPlayerGameData() {
  const gameFiles = Array.from({length: 20}, (_, i) => i + 1);
  const allPlayerData = [];
  
  for (const gameNum of gameFiles) {
    try {
      const text = await d3.text(`./data/2024-2025_reg_per_game/${gameNum}.csv`);
      const rows = d3.csvParseRows(text);
      if (rows.length < 2) continue;
      
      const headers = rows[0];
      const dataRows = rows.slice(1);
      
      // Find column indices
      const idxMap = {};
      headers.forEach((h, i) => {
        if (h === 'FG%') idxMap.fgPct = i;
        else if (h === '3P%') idxMap.tpPct = i;
        else if (h === 'FT%') idxMap.ftPct = i;
        else if (h === 'ORB') idxMap.orb = i;
        else if (h === 'DRB') idxMap.drb = i;
        else if (h === 'AST') idxMap.ast = i;
        else if (h === 'STL') idxMap.stl = i;
        else if (h === 'BLK') idxMap.blk = i;
        else if (h === 'TOV') idxMap.tov = i;
        else if (h === 'PF') idxMap.pf = i;
        else if (h === 'PTS') idxMap.pts = i;
        else if (h === '-9999') idxMap.playerId = i;
      });
      
      // Parse each player's stats for this game
      for (const row of dataRows) {
        const playerId = row[idxMap.playerId];
        if (!playerId) continue;
        
        // Parse stats, handling empty values
        const parseVal = (idx) => {
          const val = row[idx];
          if (!val || val === '') return 0;
          const num = parseFloat(val);
          return isNaN(num) ? 0 : num;
        };
        
        allPlayerData.push({
          gameNum,
          gameDate: null, // Will be linked after main data loads
          playerId,
          fgPct: parseVal(idxMap.fgPct),
          tpPct: parseVal(idxMap.tpPct),
          ftPct: parseVal(idxMap.ftPct),
          orb: parseVal(idxMap.orb),
          drb: parseVal(idxMap.drb),
          ast: parseVal(idxMap.ast),
          stl: parseVal(idxMap.stl),
          blk: parseVal(idxMap.blk),
          tov: parseVal(idxMap.tov),
          pf: parseVal(idxMap.pf),
          pts: parseVal(idxMap.pts)
        });
      }
    } catch (err) {
      console.warn(`Failed to load game ${gameNum}:`, err);
    }
  }
  
  playerGameData = allPlayerData;
  console.log('Loaded player game data:', playerGameData.length, 'player-game records');
}

// Load player data first
loadPlayerGameData().then(() => {
  console.log('Player game data ready');
});

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
  
  // Link game dates to player data
  data.forEach((game, idx) => {
    const gameNum = idx + 1;
    playerGameData.forEach(pd => {
      if (pd.gameNum === gameNum) {
        pd.gameDate = game.date;
      }
    });
  });
  
  populateOpponents();
  renderAll();
  renderPlayerStats();
  console.log(data);
}).catch(err => console.error('CSV text load error:', err));


