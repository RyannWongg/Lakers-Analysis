// =============== PLAYER CARDS DATA & MANAGEMENT ===============

// Player cards data with player IDs for stats lookup
window.playerCards = [
  { name: 'LeBron James', file: 'lebron_james.webp', firstName: 'LeBron', id: 'jamesle01', awards: ['MVP-6', 'CPOY-7', 'AS', 'NBA2'] },
  { name: 'Anthony Davis', file: 'anthony_davis.webp', firstName: 'Anthony', id: 'davisan02', awards: ['AS'] },
  { name: 'Austin Reaves', file: 'austin_reaves.webp', firstName: 'Austin', id: 'reaveau01' },
  { name: "D'Angelo Russell", file: "d'angelo russell.webp", firstName: "D'Angelo", id: 'russeda01' },
  { name: 'Rui Hachimura', file: 'rui_hachimura.webp', firstName: 'Rui', id: 'hachiru01' },
  { name: 'Dalton Knecht', file: 'dalton_knecht.webp', firstName: 'Dalton', id: 'knechda01' },
  { name: 'Jaxson Hayes', file: 'jaxson_hayes.webp', firstName: 'Jaxson', id: 'hayesja02' },
  { name: 'Max Christie', file: 'max_christie.webp', firstName: 'Max', id: 'chrisma02' },
  { name: 'Gabe Vincent', file: 'gabe_vincent.webp', firstName: 'Gabe', id: 'vincega01' },
  { name: 'Bronny James', file: 'bronny_james.webp', firstName: 'Bronny', id: 'jamesbr02' },
  { name: 'Luka Doncic', file: 'luka_doncic.webp', firstName: 'Luka', id: 'doncilu01' },
  { name: 'Cam Redish', file: 'cam_reddish.webp', firstName: 'Cam', id: 'reddica01' },
  { name: 'Maxwell Lewis', file: 'maxwell_lewis.webp', firstName: 'Maxwell', id: 'lewisma01' },
  { name: 'Jalen Hood-Schifino', file: 'jalen_hood_schifino.webp', firstName: 'Jalen', id: 'hoodja01' }
];

// Award descriptions for tooltips
window.awardDescriptions = {
  'MVP-6': '6-time Most Valuable Player',
  'CPOY-7': 'Top 7 Clutch Player of the Year',
  'AS': 'All-Star Selection',
  'NBA2': '2-time NBA Champion'
};

window.currentPlayerIndex = 0; // Default to LeBron James

// Initialize player card display and stack
function initPlayerCards() {
  const mainCard = document.getElementById('main-card');
  const mainCardImg = document.getElementById('main-card-img');
  const mainCardName = document.getElementById('main-card-name');
  const cardStack = document.getElementById('card-stack');
  
  // Display default card (LeBron James)
  displayPlayerCard(window.currentPlayerIndex);
  
  // Create stacked cards for all other players
  window.playerCards.forEach((player, index) => {
    if (index === window.currentPlayerIndex) return; // Skip the current player
    
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

// Display a specific player card
function displayPlayerCard(index) {
  const player = window.playerCards[index];
  const mainCardImg = document.getElementById('main-card-img');
  const mainCardName = document.getElementById('main-card-name');
  
  mainCardImg.src = `data/player_cards/${player.file}`;
  mainCardImg.alt = player.name;
  mainCardName.textContent = player.name;
  
  // Update awards display
  displayPlayerAwards(index);
}

// Display player awards
function displayPlayerAwards(index) {
  const player = window.playerCards[index];
  const awardsContainer = document.getElementById('player-awards');
  
  if (!awardsContainer) return;
  
  // Clear previous awards
  awardsContainer.innerHTML = '';
  
  // Only show awards if player has them
  if (!player.awards || player.awards.length === 0) {
    awardsContainer.style.display = 'none';
    return;
  }
  
  awardsContainer.style.display = 'flex';
  
  // Create award badges
  player.awards.forEach(award => {
    const badge = document.createElement('div');
    badge.className = 'award-badge';
    badge.textContent = award;
    badge.setAttribute('data-award-tooltip', window.awardDescriptions[award] || award);
    awardsContainer.appendChild(badge);
  });
}

// Switch to a different player with animation
function switchPlayer(newIndex) {
  if (newIndex === window.currentPlayerIndex) return;
  
  const mainCard = document.getElementById('main-card');
  
  // Smooth animation
  mainCard.style.transform = 'scale(0.9) rotateY(90deg)';
  mainCard.style.opacity = '0.5';
  
  setTimeout(() => {
    window.currentPlayerIndex = newIndex;
    displayPlayerCard(newIndex);
    
    // Rebuild the stack
    const cardStack = document.getElementById('card-stack');
    cardStack.innerHTML = '';
    
    window.playerCards.forEach((player, index) => {
      if (index === window.currentPlayerIndex) return;
      
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
    
    // Update player stats when player changes
    if (typeof renderPlayerStats === 'function') {
      renderPlayerStats();
    }
  }, 200);
}
