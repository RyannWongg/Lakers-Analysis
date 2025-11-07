// =============== PLAYER STATS MANAGEMENT ===============

// Store player stats per game: { gameNumber: { playerId: { stats } } }
let playerStatsData = {};
// also expose globally for debugging/consumers
window.playerStatsData = playerStatsData;

// Load all 82 game CSV files
async function loadPlayerStats() {
  try {
    const gamePromises = [];
    for (let i = 1; i <= 82; i++) {
      gamePromises.push(
        d3.text(`data/2024-2025_reg_per_game/${i}.csv`)
          .then(text => ({ gameNum: i, data: text }))
          .catch(err => {
            console.warn(`Failed to load game ${i}:`, err);
            return { gameNum: i, data: null };
          })
      );
    }
    
    const results = await Promise.all(gamePromises);
    
    let loadedCount = 0;
    
    // Parse each game's CSV
    results.forEach(({ gameNum, data }) => {
      if (!data) {
        console.warn(`No data for game ${gameNum}`);
        return;
      }
      
      try {
        const rows = d3.csvParseRows(data);
        if (rows.length < 2) {
          console.warn(`Game ${gameNum} has insufficient rows:`, rows.length);
          return;
        }
        
  const headers = rows[0].map(h => h.trim());
        const playerIdIdx = headers.length - 1; // Last column is player ID
        
        if (!playerStatsData[gameNum]) {
          playerStatsData[gameNum] = {};
        }
        
        // Parse each player row
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length < headers.length) continue;
          
          const playerId = row[playerIdIdx]?.trim();
          if (!playerId || playerId === '-9999') continue;
          
          // Parse stats
          const parseStat = (idx) => {
            const val = row[idx]?.trim();
            if (!val || val === '') return null;
            // Handle percentages (e.g., ".478")
            if (val.startsWith('.')) return parseFloat(val);
            // Handle regular numbers
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
          };
          // Parse minutes played (MP) like "34:21" or numeric minutes
          const parseMP = (idx) => {
            if (idx < 0) return 0;
            const val = row[idx]?.trim();
            if (!val) return 0;
            if (val.includes(':')) {
              const parts = val.split(':');
              const m = parseInt(parts[0], 10);
              const s = parseInt(parts[1], 10);
              if (!isNaN(m) && !isNaN(s)) return m + (s / 60);
              return 0;
            }
            const num = parseFloat(val);
            return isNaN(num) ? 0 : num;
          };
          
          const getColIdx = (name) => headers.indexOf(name);
          
          playerStatsData[gameNum][playerId] = {
            FG: parseStat(getColIdx('FG')) || 0,
            FGA: parseStat(getColIdx('FGA')) || 0,
            'FG%': parseStat(getColIdx('FG%')),
            '3P': parseStat(getColIdx('3P')) || 0,
            '3PA': parseStat(getColIdx('3PA')) || 0,
            '3P%': parseStat(getColIdx('3P%')),
            FT: parseStat(getColIdx('FT')) || 0,
            FTA: parseStat(getColIdx('FTA')) || 0,
            'FT%': parseStat(getColIdx('FT%')),
            PTS: parseStat(getColIdx('PTS')) || 0,
            TRB: parseStat(getColIdx('TRB')) || 0,
            AST: parseStat(getColIdx('AST')) || 0,
            BLK: parseStat(getColIdx('BLK')) || 0,
            MP: parseMP(getColIdx('MP')) || 0
          };
        }
        
        loadedCount++;
      } catch (parseErr) {
        console.error(`Error parsing game ${gameNum}:`, parseErr);
      }
    });
    
    console.log('Loaded player stats for', loadedCount, 'games out of', results.length);
    console.log('Total games in playerStatsData:', Object.keys(playerStatsData).length);
    // refresh global reference (in case of reassignment elsewhere)
    window.playerStatsData = playerStatsData;
    // Trigger a UI refresh now that data is available
    if (typeof renderPlayerStats === 'function') {
      try { renderPlayerStats(); } catch (e) { console.error('renderPlayerStats() failed:', e); }
    }

    return loadedCount;
  } catch (error) {
    console.error('Error in loadPlayerStats:', error);
    throw error;
  }
}

// Get games within the brush range (requires state and data from main.js)
function getGamesInRange() {
  // Access state from main.js
  if (!window.state || !window.data || !Array.isArray(window.data)) {
    return Array.from({ length: 82 }, (_, i) => i + 1);
  }

  if (!window.state.range) {
    // No brush selection - return all games (1..82)
    return Array.from({ length: 82 }, (_, i) => i + 1);
  }

  const [startDate, endDate] = window.state.range;
  // Filter team games by date and use their explicit gameNumber (Rk)
  const nums = window.data
    .filter(g => g.date >= startDate && g.date <= endDate)
    .map(g => +g.gameNumber)
    .filter(n => Number.isFinite(n));

  // Ensure uniqueness and ascending order
  const uniq = Array.from(new Set(nums)).sort((a, b) => a - b);
  return uniq;
}

// Calculate average stats for a player across selected games
function calculatePlayerStats(playerId, gameNumbers) {
  const stats = {
    'FG%': 0, '3P%': 0, 'FT%': 0, PTS: 0, TRB: 0, AST: 0, BLK: 0, MP: 0,
    gamesPlayed: 0
  };
  
  let totalFG = 0, totalFGA = 0;
  let total3P = 0, total3PA = 0;
  let totalFT = 0, totalFTA = 0;
  let totalPTS = 0;
  let totalTRB = 0, totalAST = 0, totalBLK = 0;
  let totalMP = 0;
  
  gameNumbers.forEach(gameNum => {
    const gameStats = playerStatsData[gameNum]?.[playerId];
    if (!gameStats) return;
    
    stats.gamesPlayed++;
    totalFG += gameStats.FG || 0;
    totalFGA += gameStats.FGA || 0;
    total3P += gameStats['3P'] || 0;
    total3PA += gameStats['3PA'] || 0;
    totalFT += gameStats.FT || 0;
    totalFTA += gameStats.FTA || 0;
    totalPTS += gameStats.PTS || 0;
    totalTRB += gameStats.TRB || 0;
    totalAST += gameStats.AST || 0;
    totalBLK += gameStats.BLK || 0;
    totalMP  += gameStats.MP  || 0;
  });
  
  if (stats.gamesPlayed === 0) return stats;
  
  // Calculate percentages
  stats['FG%'] = totalFGA > 0 ? totalFG / totalFGA : 0;
  stats['3P%'] = total3PA > 0 ? total3P / total3PA : 0;
  stats['FT%'] = totalFTA > 0 ? totalFT / totalFTA : 0;
  
  // Calculate averages per game
  stats.PTS = totalPTS / stats.gamesPlayed;
  stats.TRB = totalTRB / stats.gamesPlayed;
  stats.AST = totalAST / stats.gamesPlayed;
  stats.BLK = totalBLK / stats.gamesPlayed;
  stats.MP  = totalMP; // total minutes across selected games
  
  return stats;
}

// Render player stats display (requires playerCards and currentPlayerIndex from playerCards.js)
function renderPlayerStats() {
  const statsSection = document.getElementById('player-stats-section');
  if (!statsSection) {
    console.warn('player-stats-section element not found');
    return;
  }
  
  // Access playerCards and currentPlayerIndex from playerCards.js
  if (!window.playerCards || window.currentPlayerIndex === undefined) {
    console.warn('Player cards not initialized');
    return;
  }
  
  const currentPlayer = window.playerCards[window.currentPlayerIndex];
  if (!currentPlayer) {
    console.warn('Current player not found');
    return;
  }
  
  // Determine selected games (by brush) and how many are currently available in loaded per-game data
  const gameNumbers = getGamesInRange();
  const availableGames = gameNumbers.filter(n => !!playerStatsData[n]);
  
  // If none of the requested games are loaded yet, render a neutral panel state (no more indefinite "Loading...")
  if (availableGames.length === 0) {
    const totalGamesInRange = gameNumbers.length;
    statsSection.innerHTML = `
      <div class="player-stats-header">
        <div class="games-played">
          <div class="games-played-label">Games Played: <span class="games-played-number">0 / ${totalGamesInRange || 82}</span> 
            &nbsp;•&nbsp; MP: <span class="games-played-number">0 min</span>
          </div>
        </div>
      </div>
      <div class="player-stats-grid">
        <div class="stat-item"><div class="stat-label" title="Field Goal Percentage">FG%</div><div class="stat-value">–</div></div>
        <div class="stat-item"><div class="stat-label" title="3-Point Percentage">3P%</div><div class="stat-value">–</div></div>
        <div class="stat-item"><div class="stat-label" title="Free Throw Percentage">FT%</div><div class="stat-value">–</div></div>
        <div class="stat-item stat-item-pts" style="grid-row: 1 / 3; grid-column: 4;"><div class="stat-label" title="Average Points per Game">PTS</div><div class="stat-value">–</div></div>
        <div class="stat-item"><div class="stat-label" title="Average Blocks per Game">BLK</div><div class="stat-value">–</div></div>
        <div class="stat-item"><div class="stat-label" title="Average Total Rebounds per Game">TRB</div><div class="stat-value">–</div></div>
        <div class="stat-item"><div class="stat-label" title="Average Assists per Game">AST</div><div class="stat-value">–</div></div>
      </div>
    `;
    return;
  }

  const playerStats = calculatePlayerStats(currentPlayer.id, availableGames);
  
  const fmtPct = d3.format('.1%');
  const fmtNum = d3.format('.1f');
  
  // Count how many games in the selected range the player actually played
  const totalGamesInRange = gameNumbers.length;
  const playerGamesInRange = playerStats.gamesPlayed;
  
  // Display format: show "X / Y" when brush is selected, or just "X" when showing all games
  let displayText;
  if (window.state && window.state.range && totalGamesInRange > 0) {
    // Brush is selected - show "X / Y" format
    displayText = `${playerGamesInRange} / ${totalGamesInRange}`;
  } else {
    // No brush or no games - show total games player played
    displayText = `${playerGamesInRange || 0}`;
  }
  // Format total minutes to integer minutes
  const fmtTotalMin = d3.format('.0f');
  const totalMinText = fmtTotalMin(playerStats.MP || 0);
  
  statsSection.innerHTML = `
    <div class="player-stats-header">
      <div class="games-played">
        <div class="games-played-label">Games Played: <span class="games-played-number">${displayText}</span> 
          &nbsp;•&nbsp; MP: <span class="games-played-number">${totalMinText} min</span>
        </div>
      </div>
    </div>
    <div class="player-stats-grid">
      <div class="stat-item" data-tooltip="Field Goal Percentage">
        <div class="stat-label">FG%</div>
        <div class="stat-value">${playerStats.gamesPlayed > 0 ? fmtPct(playerStats['FG%']) : '–'}</div>
      </div>
      <div class="stat-item" data-tooltip="3-Point Percentage">
        <div class="stat-label">3P%</div>
        <div class="stat-value">${playerStats.gamesPlayed > 0 ? fmtPct(playerStats['3P%']) : '–'}</div>
      </div>
      <div class="stat-item" data-tooltip="Free Throw Percentage">
        <div class="stat-label">FT%</div>
        <div class="stat-value">${playerStats.gamesPlayed > 0 ? fmtPct(playerStats['FT%']) : '–'}</div>
      </div>
      <div class="stat-item stat-item-pts" style="grid-row: 1 / 3; grid-column: 4;" data-tooltip="Average Points per Game">
        <div class="stat-label">PTS</div>
        <div class="stat-value">${playerStats.gamesPlayed > 0 ? fmtNum(playerStats.PTS) : '–'}</div>
      </div>
      <div class="stat-item" data-tooltip="Average Blocks per Game">
        <div class="stat-label">BLK</div>
        <div class="stat-value">${playerStats.gamesPlayed > 0 ? fmtNum(playerStats.BLK) : '–'}</div>
      </div>
      <div class="stat-item" data-tooltip="Average Total Rebounds per Game">
        <div class="stat-label">TRB</div>
        <div class="stat-value">${playerStats.gamesPlayed > 0 ? fmtNum(playerStats.TRB) : '–'}</div>
      </div>
      <div class="stat-item" data-tooltip="Average Assists per Game">
        <div class="stat-label">AST</div>
        <div class="stat-value">${playerStats.gamesPlayed > 0 ? fmtNum(playerStats.AST) : '–'}</div>
      </div>
    </div>
  `;
}
