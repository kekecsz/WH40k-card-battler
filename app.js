let selectedCard = null;
let selectedEntity = null;
let latestGameState = null;
let selectedAttacker = null;
let selectedTarget = null;
let currentSessionId = null;
let currentPlayer = null;
let pollingInterval = null;

// DOM elements for start screen
const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const startGameBtn = document.getElementById("startGame");
const joinGameBtn = document.getElementById("joinGameBtn");
const settingsBtn = document.getElementById("settingsBtn");
const joinDialog = document.getElementById("join-dialog");
const sessionInput = document.getElementById("sessionInput");
const joinGameSubmitBtn = document.getElementById("joinGame");
const cancelJoinBtn = document.getElementById("cancelJoin");
const startConsoleLog = document.getElementById("startConsoleLog");

// DOM elements
const gridSize = 5;
const gameBoard = document.getElementById("game-board");
const player1HandElement = document.getElementById("player1-hand");
const player2HandElement = document.getElementById("player2-hand");
const player1UpgradeDeck = document.getElementById("player1-upgrade-deck");
const player2UpgradeDeck = document.getElementById("player2-upgrade-deck");
const player1Graveyard = document.getElementById("player1-graveyard");
const player2Graveyard = document.getElementById("player2-graveyard");
const statusDisplay = document.getElementById("status-display");
const advanceButton = document.getElementById("advance-button");
const API_BASE = "https://card-battler-server-386329199229.europe-central2.run.app"; // Change to your Cloud Run URL later

document.getElementById("startGame").addEventListener("click", async () => {
  const res = await fetch(`${API_BASE}/newmpsession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  currentSessionId = data.sessionid;
  currentPlayer = "player1";

  // Update console on start screen
  if (data.console?.player1) {
    const messages = data.console.player1;
    startConsoleLog.innerHTML = messages.map(m => `<div>${m}</div>`).join("");
  }

  document.getElementById("playerInfo").textContent =
    `You are player1. Session ID: ${currentSessionId}`;
  
  // Don't switch to game screen yet - wait for player2
  // Start initial game state
  updateGameStateAndRender(data);
  // Setup polling based on player turn
  setupPolling();
});

// Event listener for Join Game button on start screen
joinGameBtn.addEventListener("click", () => {
  joinDialog.classList.remove("hidden");
});

// Cancel Join Game
cancelJoinBtn.addEventListener("click", () => {
  joinDialog.classList.add("hidden");
});

// Modify join game functionality
document.getElementById("joinGame").addEventListener("click", async () => {
  const input = document.getElementById("sessionInput").value.trim();

  const res = await fetch(`${API_BASE}/joinsession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionid: input || null }),
  });

  const data = await res.json();

  if (data.error) {
    startConsoleLog.innerHTML += `<div class="error-message">Error: ${data.error}</div>`;
    return;
  }

  currentSessionId = data.sessionid;

  // Guess player by checking which console section exists
  if (data.console?.player2) {
    currentPlayer = "player2";
  } else {
    currentPlayer = "player1";
  }

  document.getElementById("playerInfo").textContent =
    `You are ${currentPlayer}. Session ID: ${currentSessionId}`;
  
  // Switch to game screen
  switchToGameScreen();
  
  // Start initial game state
  updateGameStateAndRender(data);
  // Setup polling based on player turn
  setupPolling();
  
  // Hide join dialog
  joinDialog.classList.add("hidden");
});

// Function to switch from start screen to game screen
function switchToGameScreen() {
  startScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  
  // Force the body/document to recalculate widths
  document.body.style.width = '100%';
  document.body.style.maxWidth = 'none';
  
  // Force layout recalculation
  requestAnimationFrame(() => {
    // Trigger reflow
    gameScreen.offsetWidth;
    
    // Dispatch resize event to trigger any responsive calculations
    window.dispatchEvent(new Event('resize'));
    
    // Re-render current state with proper sizing
    if (latestGameState) {
      updateGameStateAndRender(latestGameState);
    }
  });
}

// Create board tiles
function createGridTiles(container, columns, rows) {
  container.innerHTML = "";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.x = x;
      tile.dataset.y = y;
      container.appendChild(tile);

      // Only hook battlefield tiles (not hand/upgrade decks)
      if (container.id === "game-board") {
        attachPlacementListener(tile);
      }
    }
  }
}

function attachPlacementListener(tile) {
  // Remove existing listener if any
  const newTile = tile.cloneNode(false);
  while (tile.firstChild) {
    newTile.appendChild(tile.firstChild);
  }
  tile.replaceWith(newTile);
  
  // Now add the placement listener
  newTile.addEventListener("click", async (e) => {
    // Don't trigger if the click was on a card
    if (e.target.closest('.card')) return;
    
    if (!selectedCard) return;
    if (!latestGameState || latestGameState.stage !== "cardplacement") return;

    const x = parseInt(newTile.dataset.x);
    const y = parseInt(newTile.dataset.y);

    const legal =
      (currentPlayer === "player1" && y === 4) ||
      (currentPlayer === "player2" && y === 0);

    if (!legal) {
      newTile.classList.add("invalid-placement");
      setTimeout(() => newTile.classList.remove("invalid-placement"), 600);
      return;
    }

    const res = await fetch(`${API_BASE}/placecardfromhand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionid: currentSessionId,
        player: currentPlayer,
        entityid: selectedCard.entityid,
        position: { x, y }
      })
    });

    const data = await res.json();
    if (data.error) {
      console.error("Placement failed:", data.error);
      return;
    }

    selectedCard = null;
    highlightSelectedCard(null);
    document.querySelectorAll(".tile").forEach(t =>
      t.classList.remove("eligible-placement")
    );

    updateGameStateAndRender(data);
  });
}

createGridTiles(gameBoard, gridSize, gridSize);
createGridTiles(player1HandElement, 7, 1);
createGridTiles(player2HandElement, 7, 1);
createGridTiles(player1UpgradeDeck, 7, 3);
createGridTiles(player2UpgradeDeck, 7, 3);

function findCardById(list, id) {
  return list.find(c => c.entityid === id);
}

function updateConsole(messages) {
  if (!messages) return;
  
  const gameLog = document.getElementById("consoleLog");
  const startLog = document.getElementById("startConsoleLog");
  
  const playerMessages = messages[currentPlayer] || [];
  
  // Update the appropriate console based on which screen is active
  if (gameScreen.classList.contains("hidden")) {
    startLog.innerHTML = playerMessages.map(m => `<div>${m}</div>`).join("");
  } else {
    gameLog.innerHTML = playerMessages.map(m => `<div>${m}</div>`).join("");
  }
}

// Core function to setup polling based on active player
function setupPolling() {
  // Clear any existing polling
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  // Check if we're in the waiting room stage
  const isWaitingRoom = latestGameState && latestGameState.stage === "waitingroom";
  
  // Set up polling if:
  // 1. We're in the waiting room stage (regardless of active player), OR
  // 2. We're not the active player (existing behavior)
  if (isWaitingRoom || !latestGameState || latestGameState.playerturn !== currentPlayer) {
    pollingInterval = setInterval(pollGameState, 3000);
    console.log(`Setting up polling: ${isWaitingRoom ? "waiting room" : "inactive player"}`);
  } else {
    console.log("No polling for active player in gameplay stage");
  }
}

// Function to poll game state - now it also checks for player2 joining
async function pollGameState() {
  if (!currentSessionId || !currentPlayer) return;

  try {
    const res = await fetch(`${API_BASE}/gamestate?sessionid=${currentSessionId}&player=${currentPlayer}`);
    const data = await res.json();
    
    if (data.error) {
      console.error("Poll error:", data.error);
      return;
    }
    
    // Check if player2 has joined (for player1 in waiting room)
    if (currentPlayer === "player1" && 
        startScreen.classList.contains("hidden") === false &&
        data.players && data.players.player2) {
      // Player 2 has joined, switch to game screen
      switchToGameScreen();
    }
    
    // Compare with latest state to see if we need to update anything
    updateGameStateAndRender(data);
    
    // If the turn has changed, adjust polling accordingly
    if (latestGameState && 
        latestGameState.playerturn !== data.playerturn) {
      setupPolling();
    }
  } catch (err) {
    console.error("Polling error:", err);
  }
}

// Function to handle game state updates more intelligently
function updateGameStateAndRender(newState) {
  if (!newState) return;
  
  // Update console log messages if changed
  if (newState.console) {
    updateConsole(newState.console);
  }

  // Store the old board state to detect health changes
  const oldBoardState = latestGameState ? {
    player1: latestGameState.players.player1?.cardsonboard || [],
    player2: latestGameState.players.player2?.cardsonboard || []
  } : { player1: [], player2: [] };

  // Determine what needs updating by comparing with previous state
  const handChanged = didHandChange(latestGameState, newState);
  const boardChanged = didBoardChange(latestGameState, newState);
  const statusChanged = didStatusChange(latestGameState, newState);
  const graveyardChanged = didGraveyardChange(latestGameState, newState);
  const gameOverChanged = latestGameState?.gameover !== newState.gameover;
  
  // Update latestGameState after comparison but before rendering
  latestGameState = newState;
  
  // Only update what's changed
  if (statusChanged) {
    updateGameStatus(newState);
  }
  
  if (handChanged) {
    renderHand(newState.players[currentPlayer].hand, currentPlayer);
  }
  
  if (boardChanged) {
    renderBoard(newState.players);
    
    // After rendering the board, check for health changes and apply damage animations
    animateDamagedCards(oldBoardState, newState.players);
  }
  
  // Update graveyards if changed
  if (graveyardChanged) {
    ["player1", "player2"].forEach(player => {
      if (newState.players[player]?.graveyard) {
        renderGraveyard(newState.players[player].graveyard, player);
      }
    });
  }
  
  // Check for game over status
  if (newState.gameover === true) {
    displayGameOverMessage(newState);
    
    // Disable the advance button
    advanceButton.classList.add("disabled");
  } else if (gameOverChanged) {
    // If game was over but is now not (e.g., new game), hide the overlay
    hideGameOverMessage();
  }
  
  // Restore selections and highlights if necessary
  if (selectedCard) {
    highlightSelectedCard(selectedCard.entityid);
    highlightEligibleTiles();
  }
  
  if (selectedEntity) {
    highlightSelectedCard(selectedEntity.entityid);
    
    if (latestGameState.stage === "movement" && !selectedEntity.moved_this_turn) {
      highlightMovementTiles(selectedEntity);
    }
  }
}

// Helper functions to determine what's changed in the game state
function didHandChange(oldState, newState) {
  if (!oldState) return true;
  
  const oldHand = oldState.players[currentPlayer]?.hand || [];
  const newHand = newState.players[currentPlayer]?.hand || [];
  
  if (oldHand.length !== newHand.length) return true;
  
  // Simple check - just compare entity IDs
  const oldIds = oldHand.map(card => card.entityid).sort();
  const newIds = newHand.map(card => card.entityid).sort();
  
  return !oldIds.every((id, index) => id === newIds[index]);
}

function didBoardChange(oldState, newState) {
  if (!oldState) return true;
  
  const oldBoard = {
    player1: oldState.players.player1?.cardsonboard || [],
    player2: oldState.players.player2?.cardsonboard || []
  };
  
  const newBoard = {
    player1: newState.players.player1?.cardsonboard || [],
    player2: newState.players.player2?.cardsonboard || []
  };
  
  // Check if number of cards changed
  if (oldBoard.player1.length !== newBoard.player1.length ||
      oldBoard.player2.length !== newBoard.player2.length) {
    return true;
  }
  
  // Check if any card moved or changed stats
  for (const player of ['player1', 'player2']) {
    for (const oldCard of oldBoard[player]) {
      const newCard = newBoard[player].find(c => c.entityid === oldCard.entityid);
      
      // Card was removed
      if (!newCard) return true;
      
      // Check position changed
      if (oldCard.position.x !== newCard.position.x || 
          oldCard.position.y !== newCard.position.y) {
        return true;
      }
      
      // Check if stats changed
      if (oldCard.health !== newCard.health || 
          oldCard.armor !== newCard.armor || 
          oldCard.moved_this_turn !== newCard.moved_this_turn ||
          oldCard.sick_this_turn !== newCard.sick_this_turn ||
          oldCard.has_attacked_this_stage !== newCard.has_attacked_this_stage) {
        return true;
      }
      
      // Check if attack targets changed
      if (JSON.stringify(oldCard.valid_target_melee) !== JSON.stringify(newCard.valid_target_melee) ||
          JSON.stringify(oldCard.valid_target_ranged) !== JSON.stringify(newCard.valid_target_ranged) ||
          JSON.stringify(oldCard.valid_target_blast) !== JSON.stringify(newCard.valid_target_blast)) {
        return true;
      }
    }
  }
  
  return false;
}

function didStatusChange(oldState, newState) {
  if (!oldState) return true;
  
  // Basic state changes that are always relevant
  const basicStateChanged = oldState.round !== newState.round || 
                            oldState.playerturn !== newState.playerturn ||
                            oldState.gameover !== newState.gameover ||
                            oldState.winner !== newState.winner || 
                            oldState.stage !== newState.stage;

  
  // If we're in waiting room, only check basic state changes
  if (newState.stage === "waitingroom") {
    return basicStateChanged;
  }
  
  // In other stages, check player health and armor as well
  // First check if player1 properties changed
  const player1Changed = oldState.players.player1?.health !== newState.players.player1?.health ||
                         oldState.players.player1?.armor !== newState.players.player1?.armor;
  
  // Then check player2 properties if player2 exists in both states
  const player2Exists = oldState.players.player2 && newState.players.player2;
  const player2Changed = player2Exists && (
                         oldState.players.player2.health !== newState.players.player2.health ||
                         oldState.players.player2.armor !== newState.players.player2.armor);
  
  return basicStateChanged || player1Changed || player2Changed;
}

// Function to check if graveyards have changed
function didGraveyardChange(oldState, newState) {
  if (!oldState) return true;
  
  // Check player1 graveyard
  const oldGraveyard1 = oldState.players.player1?.graveyard || [];
  const newGraveyard1 = newState.players.player1?.graveyard || [];
  
  // Check player2 graveyard
  const oldGraveyard2 = oldState.players.player2?.graveyard || [];
  const newGraveyard2 = newState.players.player2?.graveyard || [];
  
  // Compare length first (quick check)
  if (oldGraveyard1.length !== newGraveyard1.length || 
      oldGraveyard2.length !== newGraveyard2.length) {
    return true;
  }
  
  // Compare entity IDs (more efficient than comparing entire objects)
  const oldIds1 = oldGraveyard1.map(entity => entity.entityid).sort();
  const newIds1 = newGraveyard1.map(entity => entity.entityid).sort();
  const oldIds2 = oldGraveyard2.map(entity => entity.entityid).sort();
  const newIds2 = newGraveyard2.map(entity => entity.entityid).sort();
  
  // Check if any element differs
  for (let i = 0; i < oldIds1.length; i++) {
    if (oldIds1[i] !== newIds1[i]) return true;
  }
  
  for (let i = 0; i < oldIds2.length; i++) {
    if (oldIds2[i] !== newIds2[i]) return true;
  }
  
  return false;
}

// Function to render graveyard for a player
function renderGraveyard(graveyardEntities, player) {
  const graveyardContainer = player === "player1" ? player1Graveyard : player2Graveyard;
  
  // Clear the current graveyard display
  graveyardContainer.innerHTML = "";
  
  // If there are no cards in the graveyard, display a placeholder
  if (!graveyardEntities || graveyardEntities.length === 0) {
    const emptyText = document.createElement("div");
    emptyText.className = "empty-graveyard";
    emptyText.textContent = "Empty";
    graveyardContainer.appendChild(emptyText);
    return;
  }
  
  // Group entities by cardtype for stacking
  const cardTypeGroups = {};
  graveyardEntities.forEach(entity => {
    const cardType = entity.cardtype;
    if (!cardTypeGroups[cardType]) {
      cardTypeGroups[cardType] = [];
    }
    cardTypeGroups[cardType].push(entity);
  });
  
  // Create a card element for each unique card type
  let index = 0;
  Object.entries(cardTypeGroups).forEach(([cardType, entities]) => {
    const cardContainer = document.createElement("div");
    cardContainer.classList.add("graveyard-card");
    cardContainer.dataset.cardtype = cardType;
    cardContainer.dataset.entityid = entities[0].entityid; // Store the first entity ID for reference
    
    // If there are multiple of the same card type, add a count badge
    if (entities.length > 1) {
      const countBadge = document.createElement("div");
      countBadge.className = "card-count-badge";
      countBadge.textContent = entities.length;
      cardContainer.appendChild(countBadge);
    }
    
    // Create the card image using the entity's image path
    const cardImage = document.createElement("img");
    cardImage.src = entities[0].image; // Use the actual image path from the entity
    cardImage.alt = cardType;
    cardImage.loading = "lazy"; // For performance
    
    cardContainer.appendChild(cardImage);
    
    // Store entity data for tooltips and interactions
    cardContainer.dataset.entities = JSON.stringify(entities.map(e => e.entityid));
    
    // Add tooltip with card name and count
    cardContainer.title = `${cardType} (${entities.length})`;
    
    // Position cards with slight overlap
    cardContainer.style.zIndex = index + 1;
    cardContainer.style.marginTop = index > 0 ? "-80px" : "0";
    
    graveyardContainer.appendChild(cardContainer);
    index++;
  });
}

// Function to display game over message
function displayGameOverMessage(gameState) {
  // Create or get the overlay
  let overlay = document.getElementById("game-over-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "game-over-overlay";
    document.body.appendChild(overlay);
  }
  
  // Determine the message based on winner and current player
  let message = "Game Over";
  
  if (gameState.winner === "neutral") {
    message = "Draw";
  } else if (gameState.winner === currentPlayer) {
    message = "Victory!";
  } else {
    message = "Defeat";
  }
  
  // Set the overlay content and display it
  overlay.textContent = message;
  overlay.classList.add("active");
  
  // Apply the appropriate class based on the message
  overlay.classList.remove("victory", "defeat", "draw");
  if (message === "Victory!") {
    overlay.classList.add("victory");
  } else if (message === "Defeat") {
    overlay.classList.add("defeat");
  } else if (message === "Draw") {
    overlay.classList.add("draw");
  }
}

// Function to hide game over message
function hideGameOverMessage() {
  const overlay = document.getElementById("game-over-overlay");
  if (overlay) {
    overlay.classList.remove("active");
  }
}


// Function to check which cards have taken damage and apply animations
function animateDamagedCards(oldBoardState, newPlayers) {
  // Process each player's cards
  for (const player of ['player1', 'player2']) {
    const oldCards = oldBoardState[player];
    const newCards = newPlayers[player]?.cardsonboard || [];
    
    // Check each card in the new state to see if its health decreased
    newCards.forEach(newCard => {
      const oldCard = oldCards.find(card => card.entityid === newCard.entityid);
      
      // If the card existed before and has less health now
      if (oldCard && newCard.health < oldCard.health) {
        // Find the card element on the board
        const cardElement = document.querySelector(`[data-entityid="${newCard.entityid}"]`);
        if (cardElement) {
          // Create a damage overlay if it doesn't exist
          let damageOverlay = cardElement.querySelector('.damage-overlay');
          if (!damageOverlay) {
            damageOverlay = document.createElement('div');
            damageOverlay.className = 'damage-overlay';
            cardElement.appendChild(damageOverlay);
          }
          
          // Remove any existing animation classes
          cardElement.classList.remove('damage-animation');
          
          // Force a reflow to ensure the animation plays again
          void cardElement.offsetWidth;
          
          // Add the animation class
          cardElement.classList.add('damage-animation');
          
          // Calculate damage amount
          const damageAmount = oldCard.health - newCard.health;
          
          // Create and display a damage number
          const damageNumber = document.createElement('div');
          damageNumber.className = 'damage-number';
          damageNumber.textContent = `-${damageAmount}`;
          cardElement.appendChild(damageNumber);
          
          // Remove the number after animation completes
          setTimeout(() => {
            if (damageNumber.parentNode) {
              damageNumber.parentNode.removeChild(damageNumber);
            }
          }, 1000);
        }
      }
    });
    
    // Check for cards that were completely removed (died)
    oldCards.forEach(oldCard => {
      const stillExists = newCards.some(card => card.entityid === oldCard.entityid);
      
      if (!stillExists) {
        // Find the last known position
        const { x, y } = oldCard.position;
        const tile = document.querySelector(`#game-board .tile[data-x='${x}'][data-y='${y}']`);
        
        if (tile) {
          // Create a clone of the card for the death animation
          const cardClone = document.createElement('div');
          cardClone.className = 'card card-on-board death-animation';
          
          // Clone the card image and info
          const img = document.createElement('img');
          img.src = oldCard.image;
          img.alt = oldCard.cardtype;
          
          const info = document.createElement('div');
          info.className = 'card-info';
          info.textContent = `🏃${oldCard.movement} ⚔️${oldCard.melee} 🏹${oldCard.ranged} 💥${oldCard.blast} 🛡️${oldCard.armor} ❤️${oldCard.health} 🧠${oldCard.courage}`;
          
          cardClone.appendChild(img);
          cardClone.appendChild(info);
          
          // Position the clone in the same place
          cardClone.style.position = 'absolute';
          cardClone.style.top = '0';
          cardClone.style.left = '0';
          cardClone.style.width = '100%';
          cardClone.style.height = '100%';
          
          tile.appendChild(cardClone);
          
          // Remove the clone after the animation completes
          setTimeout(() => {
            if (cardClone.parentNode) {
              cardClone.parentNode.removeChild(cardClone);
            }
          }, 2000); // Match the 2s animation duration
        }
      }
    });
  }
}

document.getElementById("draw-player1").addEventListener("click", () => {
  if (currentPlayer !== "player1") return;
  drawfromdeck(currentPlayer);
});

document.getElementById("draw-player2").addEventListener("click", () => {
  if (currentPlayer !== "player2") return;
  drawfromdeck(currentPlayer);
});

async function drawfromdeck(player) {
  if (!currentSessionId || !player) return;

  const res = await fetch(`${API_BASE}/drawfromdeck`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionid: currentSessionId, player: player }),
  });

  const data = await res.json();
  if (!data || data.error) {
    console.error("Draw failed:", data?.error || "Unknown error");
    return;
  }

  // Update game state after action
  updateGameStateAndRender(data);
}

function highlightSelectedCard(entityid) {
  document.querySelectorAll(".card").forEach(el => {
    if (el.dataset.entityid === entityid) {
      el.classList.add("selected");
      if (latestGameState && latestGameState.stage === "movement") {
        el.classList.remove("selectabletomove");
      }
    } else {
      el.classList.remove("selected");

      if (latestGameState && latestGameState.stage === "movement") {
        if (el.dataset.owner === currentPlayer) {
          const cardData = findCardById(latestGameState.players[currentPlayer].cardsonboard, el.dataset.entityid);
          if (cardData && !cardData.moved_this_turn) {
            el.classList.add("selectabletomove");
          } else {
            el.classList.remove("selectabletomove");
          }
        }
      }
    }
  });
}

function highlightEligibleTiles() {
  document.querySelectorAll("#game-board .tile").forEach(tile => {
    tile.classList.remove("eligible-placement", "invalid-placement");

    if (!selectedCard) return;

    if (!latestGameState || latestGameState.stage !== "cardplacement") return;
    
    const y = parseInt(tile.dataset.y);

    const valid =
      (currentPlayer === "player1" && y === 4) ||
      (currentPlayer === "player2" && y === 0);

    if (valid) {
      tile.classList.add("eligible-placement");
    }
  });
}

function renderHand(hand, player) {
  const handContainer = player === "player1" ? player1HandElement : player2HandElement;
  handContainer.innerHTML = "";

  hand.forEach(card => {
    const cardContainer = document.createElement("div");
    cardContainer.classList.add("card");
    cardContainer.dataset.entityid = card.entityid;

    const cardImage = document.createElement("img");
    cardImage.src = card.image;
    cardImage.alt = card.cardtype;

    const info = document.createElement("div");
    info.classList.add("card-info");
    info.textContent = `🏃${card.movement} ⚔️${card.melee} 🏹${card.ranged} 💥${card.blast} 🛡️${card.armor} ❤️${card.health} 🧠${card.courage}`;

    cardContainer.appendChild(cardImage);
    cardContainer.appendChild(info);

    // Selection handler
    cardContainer.addEventListener("click", () => {
      if (currentPlayer !== player) return;
      selectedCard = card;
      highlightSelectedCard(card.entityid);
      highlightEligibleTiles();
    });

    handContainer.appendChild(cardContainer);
  });
}

function updateGameStatus(gamestate) {
  const roundBox = document.getElementById("round-indicator");
  const turnBox = document.getElementById("turn-indicator");
  const stageBox = document.getElementById("stage-indicator");

  // Update round
  roundBox.textContent = `Round: ${gamestate.round}`;

  // Update player turn
  const turnPlayer = gamestate.playerturn;
  turnBox.textContent = `${turnPlayer === "player1" ? "Player 1" : "Player 2"}'s Turn`;
  turnBox.className = `status-box ${turnPlayer === "player1" ? "blue" : "red"}`;

  // Update stage
  const stage = gamestate.stage;
  stageBox.textContent = `Stage: ${stage}`;
  stageBox.className = `status-box stage-${stage}`;

  // Enable or disable the advance button
  if (turnPlayer === currentPlayer && stage !== "waitingroom") {
    advanceButton.classList.remove("disabled");
  } else {
    advanceButton.classList.add("disabled");
  }

  const p1 = gamestate.players.player1;
  const p2 = gamestate.players.player2;

  if (p1) {
    document.getElementById("player1-health").textContent = p1.health;
    document.getElementById("player1-armor").textContent = p1.armor ?? 0;
  }

  if (p2) {
    document.getElementById("player2-health").textContent = p2.health;
    document.getElementById("player2-armor").textContent = p2.armor ?? 0;
  }
  
  // Adjust polling based on whose turn it is
  setupPolling();
}

advanceButton.addEventListener("click", async () => {
  if (!currentSessionId || !currentPlayer || advanceButton.classList.contains("disabled")) return;

  const res = await fetch(`${API_BASE}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionid: currentSessionId })
  });

  const data = await res.json();
  if (data.error) {
    console.error("Advance failed:", data.error);
    return;
  }

  // Update game state after action
  updateGameStateAndRender(data);

  // If we're advancing to prebattle, immediately poll again to ensure attack targets are populated
  if (data.stage === "prebattle") {
    console.log("Advanced to prebattle stage, fetching fresh data with attack targets...");
    setTimeout(pollGameState, 500); // Poll after a brief delay to ensure server has calculated targets
  }
});

// This function can be simplified since we're managing movement tiles differently
function clearTileListenersAndClasses() {
  document.querySelectorAll("#game-board .tile").forEach(tile => {
    tile.classList.remove("eligible-placement", "invalid-placement", "selected", "movement-tile");
    
    // Only remove movement-related listeners
    if (tile.getAttribute('data-has-move-listener') === 'true') {
      const newTile = tile.cloneNode(false); // shallow clone
      while (tile.firstChild) {
        newTile.appendChild(tile.firstChild); // preserve children
      }
      tile.replaceWith(newTile);
      newTile.removeAttribute('data-has-move-listener');
    }
  });
}

function renderBoard(players) {
  // First, clear all tiles
  document.querySelectorAll("#game-board .tile").forEach(tile => {
    // Keep the tile element but remove its content
    tile.innerHTML = "";
    
    // Remove all classes except the base 'tile' class
    const classList = Array.from(tile.classList);
    classList.forEach(cls => {
      if (cls !== 'tile') {
        tile.classList.remove(cls);
      }
    });
  });

  // Render cards on board
  ["player1", "player2"].forEach(player => {
    if (!players[player]?.cardsonboard) return;
    
    players[player].cardsonboard.forEach(card => {
      const { x, y } = card.position;
      const tile = document.querySelector(`#game-board .tile[data-x='${x}'][data-y='${y}']`);

      if (tile) {
        const cardElement = document.createElement("div");
        cardElement.classList.add("card", "card-on-board");

        const img = document.createElement("img");
        img.src = card.image;
        img.alt = card.cardtype;

        const info = document.createElement("div");
        info.classList.add("card-info");
        info.textContent = `🏃${card.movement} ⚔️${card.melee} 🏹${card.ranged} 💥${card.blast} 🛡️${card.armor} ❤️${card.health} 🧠${card.courage}`;

        cardElement.appendChild(img);
        cardElement.appendChild(info);

        if (card.sick_this_turn) {
          const sickOverlay = document.createElement("div");
          sickOverlay.classList.add("sick-overlay");
          sickOverlay.innerHTML = "🌀"; // Use an emoji or insert an <img> here for custom spiral
          cardElement.appendChild(sickOverlay);
        }

        cardElement.dataset.entityid = card.entityid;
        cardElement.dataset.owner = card.owner;

        tile.appendChild(cardElement);

        if (card.owner === currentPlayer) {
          cardElement.style.cursor = "pointer";

          if (latestGameState.stage === "movement" && !card.moved_this_turn) {
            cardElement.classList.add("selectabletomove");
          }

          if (latestGameState.stage === "prebattle" && !card.has_attacked_this_stage) {
            cardElement.classList.add("selectabletoattack");
          }

          // Add card selection listener
          cardElement.addEventListener("click", (e) => {
            e.stopPropagation(); // Prevent tile click event
            
            console.log("Card clicked:", card.entityid);
            
            // If we're in movement phase, handle card selection
            if (latestGameState.stage === "movement") {
              // Only allow selection of own cards that haven't moved
              if (card.moved_this_turn) {
                console.log("Card has already moved this turn");
                return;
              }
              
              // Update selected entity
              selectedEntity = card;
              
              // Highlight the selected card
              highlightSelectedCard(card.entityid);
              
              // Update movement tiles
              highlightMovementTiles(card);
            }

            if (latestGameState.stage === "prebattle") {
              // Only allow selection of own cards that haven't moved
              if (card.owner !== currentPlayer) {
                console.log("Card not yours");
                return;
              }

              if (card.has_attacked_this_stage) {
                console.log("Card has already attacked this turn");
                return;
              }

              // Update selected entity
              selectedAttacker = card;
              console.log("selectedAttacker:", selectedAttacker);
              
              // Highlight the selected card
              highlightSelectedCard(card.entityid);
            }
          });
        }
      }
    });
  });
  
  // Re-attach placement listeners for card placement phase
  if (latestGameState.stage === "cardplacement") {
    document.querySelectorAll("#game-board .tile").forEach(tile => {
      attachPlacementListener(tile);
    });
  }
}

function highlightMovementTiles(card) {
  // Clear any previous movement highlights
  document.querySelectorAll("#game-board .tile").forEach(tile => {
    tile.classList.remove("eligible-placement", "invalid-placement", "movement-tile");
    
    // Remove only movement tile listeners by using a class marker
    const oldMoveListener = tile.getAttribute('data-has-move-listener');
    if (oldMoveListener === 'true') {
      // Clone the tile but preserve its children (the cards)
      const newTile = tile.cloneNode(false); // shallow clone
      while (tile.firstChild) {
        newTile.appendChild(tile.firstChild); // move children instead of cloning
      }
      tile.replaceWith(newTile);
    }
  });

  // Now add movement destination handlers
  document.querySelectorAll("#game-board .tile").forEach(tile => {
    const tileX = parseInt(tile.dataset.x);
    const tileY = parseInt(tile.dataset.y);

    const dx = Math.abs(card.position.x - tileX);
    const dy = Math.abs(card.position.y - tileY);
    const distance = Math.max(dx, dy); // diagonal movement allowed

    const occupied = Array.from(document.querySelectorAll("#game-board .card")).some(c => {
      const parent = c.parentElement;
      return (
        parseInt(parent.dataset.x) === tileX &&
        parseInt(parent.dataset.y) === tileY &&
        c.dataset.entityid !== card.entityid
      );
    });

    if (
      distance > 0 &&
      distance <= card.movement &&
      !occupied
    ) {
      tile.classList.add("eligible-placement", "movement-tile");
      tile.setAttribute('data-has-move-listener', 'true');

      tile.addEventListener("click", async function handleMoveClick() {
        // Remove all movement listeners and classes
        document.querySelectorAll("#game-board .tile").forEach(t => {
          t.classList.remove("eligible-placement", "movement-tile");
          t.removeAttribute('data-has-move-listener');
        });
        
        const res = await fetch(`${API_BASE}/moveentity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionid: currentSessionId,
            player: currentPlayer,
            entityid: card.entityid,
            destination: { x: tileX, y: tileY }
          })
        });

        const data = await res.json();
        if (data.error) {
          console.error("Move failed:", data.error);
          return;
        }

        selectedEntity = null;
        
        // Update game state after action
        updateGameStateAndRender(data);
      });
    }
  });
}

function getEntityFromElement(cardEl, players) {
  const entityId = cardEl.dataset.entityid;
  let allEntities = [];
  
  if (players.player1 && players.player1.cardsonboard) {
    allEntities = allEntities.concat(players.player1.cardsonboard);
  }
  
  if (players.player2 && players.player2.cardsonboard) {
    allEntities = allEntities.concat(players.player2.cardsonboard);
  }
  
  return allEntities.find(e => e.entityid === entityId);
}

function getEntityById(entityId, players) {
  for (const player of Object.values(players)) {
    if (!player.cardsonboard) continue;
    const match = player.cardsonboard.find(card => card.entityid === entityId);
    if (match) return match;
  }
  return null;
}

function showAttackMenu(x, y, attackTypes) {
  const menu = document.getElementById('attack-menu');
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = 'block';

  document.querySelectorAll('.attack-btn').forEach(btn => {
    const type = btn.dataset.type;
    btn.style.display = attackTypes.includes(type) ? 'inline-block' : 'none';
  });
}

function setupGlobalClickListener() {
  // Remove any existing listener first to avoid duplicates
  document.removeEventListener('click', handleGlobalClick);
  document.addEventListener('click', handleGlobalClick);
}

function handleGlobalClick(e) {
  const attackMenu = document.getElementById('attack-menu');
  if (attackMenu.style.display === 'block') {
    // If clicking outside the attack menu and not on an attack button
    if (!e.target.closest('#attack-menu') && !e.target.classList.contains('attack-btn')) {
      hideAttackMenu();
      // Only clear selections if clicking outside a card
      if (!e.target.closest('.card-on-board')) {
        clearSelections();
      }
    }
  }
}

function hideAttackMenu() {
  const menu = document.getElementById('attack-menu');
  menu.style.display = 'none';
}

function clearSelections() {
  selectedAttacker = null;
  selectedTarget = null;
  document.querySelectorAll('.card-on-board').forEach(el => el.classList.remove('selected'));
  hideAttackMenu();
}



document.addEventListener('contextmenu', (e) => {
  console.log("contextmenu event listener is active");
  e.preventDefault();
  const cardEl = e.target.closest('.card-on-board');

  if (!cardEl || !selectedAttacker || !latestGameState || !latestGameState.players) {
    return;
  }

  const targetEntity = getEntityFromElement(cardEl, latestGameState.players);

  if (!targetEntity || targetEntity.owner === currentPlayer) {
    return;
  }

  const attacker = selectedAttacker;
  const targetId = targetEntity.entityid;

  const validTypes = [];
  if (attacker.valid_target_melee && attacker.valid_target_melee.includes(targetId)) validTypes.push('melee');
  if (attacker.valid_target_ranged && attacker.valid_target_ranged.includes(targetId)) validTypes.push('ranged');
  if (attacker.valid_target_blast && attacker.valid_target_blast.includes(targetId)) validTypes.push('blast');

  if (validTypes.length === 0) {
    return;
  }

  selectedTarget = targetEntity;
  cardEl.classList.add('selected');
  showAttackMenu(e.pageX, e.pageY, validTypes);
});

function designateAttack(attackerId, targetId, attackType) {
  const attacker = getEntityById(attackerId, latestGameState.players);
  const target = getEntityById(targetId, latestGameState.players);
  
  if (!attacker || !target) {
    console.error("Attacker or target not found");
    return;
  }

  const payload = {
    sessionid: currentSessionId,
    player: currentPlayer,
    attacker_col: attacker.position.x,
    attacker_row: attacker.position.y,
    target_col: target.position.x,
    target_row: target.position.y,
    attack_type: attackType
  };

  fetch(`${API_BASE}/designate_attack`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success || !data.error) {
      console.log("Attack designated successfully");
      // Poll for updated state after attack
      pollGameState();
    } else {
      console.error("Attack designation failed:", data.error);
      alert("Error: " + data.error);
    }
  })
  .catch(err => {
    console.error("Network or server error:", err);
    alert("An error occurred while sending the attack.");
  });
}

// Handle attack button click
document.querySelectorAll('.attack-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedAttacker || !selectedTarget) return;

    const attackType = btn.dataset.type;
    designateAttack(selectedAttacker.entityid, selectedTarget.entityid, attackType);

    clearSelections();
  });
});

function setupGraveyardInteraction() {
  // Add event listeners to both graveyards
  document.querySelectorAll('#player1-graveyard, #player2-graveyard').forEach(graveyard => {
    graveyard.addEventListener('click', (e) => {
      const cardElement = e.target.closest('.graveyard-card');
      if (!cardElement) return;
      
      // Show a detailed view of the card and its group
      try {
        const entityIds = JSON.parse(cardElement.dataset.entities);
        const player = graveyard.id.includes('player1') ? 'player1' : 'player2';
        displayGraveyardCardDetails(entityIds, player);
      } catch (err) {
        console.error("Error parsing entity data:", err);
      }
    });
  });
}

// Display a detailed view of cards from the graveyard
function displayGraveyardCardDetails(entityIds, player) {
  if (!latestGameState || !latestGameState.players[player]?.graveyard) return;
  
  // Find all matching entities in the graveyard
  const entities = latestGameState.players[player].graveyard.filter(entity => 
    entityIds.includes(entity.entityid)
  );
  
  if (entities.length === 0) return;
  
  // Log information about the card(s)
  console.log(`Viewing ${entities.length} ${entities[0].cardtype} cards in ${player}'s graveyard`);
  
  // Example of how you might implement a modal preview for the group:
  // const modal = document.createElement('div');
  // modal.className = 'graveyard-modal';
  // 
  // const cardDetails = entities.map(entity => `
  //   <div class="graveyard-card-detail">
  //     <img src="${entity.image}" alt="${entity.cardtype}">
  //     <div class="card-stats">
  //       <p>🏃${entity.movement} ⚔️${entity.melee} 🏹${entity.ranged} 💥${entity.blast}</p>
  //       <p>🛡️${entity.armor} ❤️${entity.health} 🧠${entity.courage}</p>
  //       <p>ID: ${entity.entityid.substring(0, 8)}...</p>
  //     </div>
  //   </div>
  // `).join('');
  // 
  // modal.innerHTML = `
  //   <div class="modal-content">
  //     <span class="close-button">&times;</span>
  //     <h2>${entities[0].cardtype} (${entities.length})</h2>
  //     <div class="cards-container">
  //       ${cardDetails}
  //     </div>
  //     <button class="resurrect-button">Resurrect Selected</button>
  //   </div>
  // `;
  // 
  // document.body.appendChild(modal);
  // 
  // // Add close functionality
  // modal.querySelector('.close-button').addEventListener('click', () => {
  //   document.body.removeChild(modal);
  // });
  // 
  // // In the future, you could add resurrection mechanics here
  // modal.querySelector('.resurrect-button').addEventListener('click', () => {
  //   // Send request to resurrect the card(s)
  //   console.log("Resurrection requested for:", entityIds);
  //   document.body.removeChild(modal);
  // });
}

// Function to properly initialize the graveyard at game start
function initializeGraveyards() {
  // Set up empty graveyards for both players
  renderGraveyard([], "player1");
  renderGraveyard([], "player2");
  
  // Add interaction handlers
  setupGraveyardInteraction();
}

// Call this function when the game starts
document.addEventListener('DOMContentLoaded', () => {
  console.log("Game client initialized");
  setupGlobalClickListener();
  initializeGraveyards();
});