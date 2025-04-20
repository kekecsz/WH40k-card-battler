// Constants and global variables
const gridSize = 5;
const cardData = {};
const entitiesOnGrid = {};
const decks = {};
let selectedCard = null;

// DOM elements
const grid = document.getElementById("game-board");
const player1HandElement = document.getElementById("player1-hand");
const player2HandElement = document.getElementById("player2-hand");
const player1UpgradeDeck = document.getElementById("player1-upgrade-deck");
const player2UpgradeDeck = document.getElementById("player2-upgrade-deck");
const player1Graveyard = document.getElementById("player1-graveyard");
const player2Graveyard = document.getElementById("player2-graveyard");

// Track cards in each player's hand and graveyard
const player1Hand = [];
const player2Hand = [];
const graveyard_player1 = [];
const graveyard_player2 = [];

let cardIdCounter = 1;

function generateCardId() {
  const padded = String(cardIdCounter).padStart(5, '0');
  const id = `id_${padded}`;
  cardIdCounter++;
  return id;
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

      tile.addEventListener("click", () => {
        if (selectedCard) {
          const entityId = selectedCard.dataset.entityId;
          const entity = entitiesOnGrid[entityId];
          if (!entity) return;
          
          const fromHand = entity.container === player2HandElement || entity.container === player1HandElement;
          
          if (fromHand) {
            // Check placement restrictions for cards from hand
            const isPlayer1 = entity.container === player1HandElement;
            const targetRow = isPlayer1 ? gridSize - 1 : 0; // Bottom row for P1, top row for P2
            const clickedRow = parseInt(tile.dataset.y);
            
            // If not placing on the correct row, reject placement
            if (clickedRow !== targetRow) {
              console.warn(`Player ${isPlayer1 ? 1 : 2} can only place cards on ${isPlayer1 ? 'bottom' : 'top'} row`);
              // Optional: Show a visual error indication
              tile.classList.add('invalid-placement');
              setTimeout(() => tile.classList.remove('invalid-placement'), 500);
              return;
            }
            
            // Store the original position
            const oldX = entity.position.x;
            const oldY = entity.position.y;
            
            // Determine which hand this card is coming from
            let playerHand;
            if (entity.container === player2HandElement) {
              playerHand = player2Hand;
              entity.owner = 2;
            } else {
              playerHand = player1Hand;
              entity.owner = 1;
            }
            
            // Check if there's already a card in this tile
            if (tile.querySelector('.card')) {
              console.warn("Tile already occupied");
              return;
            }
            
            // Remove card from hand array
            const index = playerHand.findIndex(card => card.id === entity.id);
            if (index !== -1) {
              playerHand.splice(index, 1);
            }
            
            // Update entity position & container
            entity.position = { x: parseInt(tile.dataset.x), y: parseInt(tile.dataset.y) };
            entity.container = grid;
            
            // Remove card from the hand DOM
            if (entity.container === player2HandElement) {
              player2HandElement.children[oldY * 7 + oldX].innerHTML = "";
            } else {
              player1HandElement.children[oldY * 7 + oldX].innerHTML = "";
            }
            
            // Place on the board
            tile.appendChild(selectedCard);
            
            // Re-render hand to close gaps
            if (entity.container === player2HandElement) {
              renderHand(player2Hand, player2HandElement);
            } else {
              renderHand(player1Hand, player1HandElement);
            }
          } else {
            // Moving on the grid
            const dx = Math.abs(entity.position.x - parseInt(tile.dataset.x));
            const dy = Math.abs(entity.position.y - parseInt(tile.dataset.y));
            const distance = Math.max(dx, dy); // Chebyshev distance allows diagonals
            
            // First check if the tile is already occupied
            if (tile.querySelector('.card')) {
              console.warn("Tile already occupied");
              // Show invalid placement animation for occupied tiles
              tile.classList.add('invalid-placement');
              setTimeout(() => tile.classList.remove('invalid-placement'), 500);
              return;
            }
            
            if (distance <= entity.movement) {
              moveEntityTo(entity, parseInt(tile.dataset.x), parseInt(tile.dataset.y));
            } else {
              console.warn("Move too far for movement stat.");
              // Show invalid placement animation for out-of-range moves
              tile.classList.add('invalid-placement');
              setTimeout(() => tile.classList.remove('invalid-placement'), 500);
              
              // Optional: You could also flash the entity's movement range again
              highlightEligiblePlacement();
            }
          }

          selectedCard.classList.remove("selected");
          selectedCard = null;
          
          // Clear highlighting after placement
          highlightEligiblePlacement();
        }
      });

      tile.addEventListener("contextmenu", (e) => {
        e.preventDefault(); // prevent browser context menu

        if (selectedCard) {
          const attackerId = selectedCard.dataset.entityId;
          const targetCard = tile.querySelector(".card");

          if (!targetCard) {
            console.warn("No target on this tile.");
            return;
          }

          const targetId = targetCard.dataset.entityId;
          console.log(`Attacking from ${attackerId} to ${targetId}`);

          handleAttack(attackerId, targetId);
        }
      });
    }
  }
}

function renderHand(handArray, handElement) {
  // Clear all tiles in the hand container
  for (let i = 0; i < handElement.children.length; i++) {
    handElement.children[i].innerHTML = "";
  }
  
  // Place cards according to the handArray
  handArray.forEach((entity, index) => {
    const x = index % 7; // Column position in hand
    const y = 0;         // Always row 0 for hands
    
    // Update entity position to reflect new layout
    entity.position = { x, y };
    
    // Create visual card element
    const card = createCardElement(entity);
    
    // Place card in correct tile
    handElement.children[y * 7 + x].appendChild(card);
  });
}

function renderGraveyard(graveyardArray, container) {
  container.innerHTML = "";
  
  graveyardArray.forEach(entity => {
    const item = document.createElement("div");
    item.className = "graveyard-item";
    
    if (cardData[entity.name]?.image) {
      const img = document.createElement("img");
      img.src = cardData[entity.name].image;
      img.alt = entity.name;
      item.appendChild(img);
    }
    
    const info = document.createElement("div");
    info.className = "graveyard-info";
    info.innerText = entity.name;
    item.appendChild(info);
    
    // Add tooltip with complete card info
    item.title = `${entity.name}: 🏃${entity.movement} ⚔️${entity.meele} 🏹${entity.ranged} 💥${entity.blast} 🛡️${entity.armor} ❤️${entity.health} 🧠${entity.courage}`;
    
    container.appendChild(item);
  });
}

function createCardElement(entity) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.entityId = entity.id;
  
  // Add owner-specific styling
  const ownerClass = entity.owner === 1 ? "player1-card" : "player2-card";
  card.classList.add(ownerClass);
  
  if (cardData[entity.name]?.image) {
    const img = document.createElement("img");
    img.src = cardData[entity.name].image;
    img.alt = entity.name;
    img.className = "card-img";
    card.appendChild(img);
  }
  
  const overlay = document.createElement("div");
  overlay.className = "damage-overlay";
  card.appendChild(overlay);
  
  // Add owner indicator
  const ownerIndicator = document.createElement("div");
  ownerIndicator.className = "owner-indicator";
  ownerIndicator.innerText = entity.owner === 1 ? "P1" : "P2";
  card.appendChild(ownerIndicator);
  
  const info = document.createElement("div");
  info.className = "card-info";
  info.innerText = ` 🏃${entity.movement} ⚔️${entity.meele} 🏹${entity.ranged} 💥${entity.blast} 🛡️${entity.armor} ❤️${entity.health} 🧠${entity.courage}`;
  card.appendChild(info);
  
  card.addEventListener("click", (e) => {
    e.stopPropagation();
    if (selectedCard) {
      selectedCard.classList.remove("selected");
      if (selectedCard === card) {
        selectedCard = null;
        highlightEligiblePlacement(); // Clear highlighting
        return;
      }
    }
    selectedCard = card;
    card.classList.add("selected");
    highlightEligiblePlacement(); // Add highlighting for eligible placements
  });

  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    showAttackMenu(e.pageX, e.pageY, card.dataset.entityId);
  });
  
  return card;
}

createGridTiles(grid, gridSize, gridSize);
createGridTiles(player1HandElement, 7, 1);
createGridTiles(player2HandElement, 7, 1);
createGridTiles(player1UpgradeDeck, 7, 3);
createGridTiles(player2UpgradeDeck, 7, 3);

function createEntity(cardName, x, y, container, ownerId) {
  const cardInfo = cardData[cardName] || {
    movement: 1, meele: 1, ranged: 0, blast: 0, 
    health: 5, armor: 1, courage: 3,
    image: "placeholder.jpg"
  };

  const entityId = generateCardId();
  const entity = {
    id: entityId,
    name: cardName,
    movement: cardInfo.movement,
    meele: cardInfo.meele,
    ranged: cardInfo.ranged,
    blast: cardInfo.blast,
    health: cardInfo.health,
    armor: cardInfo.armor,
    courage: cardInfo.courage,
    position: { x, y },
    container,
    owner: ownerId
  };
  
  entitiesOnGrid[entityId] = entity;
  
  // If going to hand, add to player hand array
  if (container === player2HandElement) {
    player2Hand.push(entity);
    renderHand(player2Hand, player2HandElement);
  } else if (container === player1HandElement) {
    player1Hand.push(entity);
    renderHand(player1Hand, player1HandElement);
  } else {
    // For grid and upgrade decks, just place it directly
    const columns = container === grid ? gridSize : 7;
    const tileIndex = y * columns + x;
    if (container.children[tileIndex]) {
      const card = createCardElement(entity);
      container.children[tileIndex].appendChild(card);
    }
  }
}

function showAttackMenu(x, y, targetId) {
  if (!selectedCard) return; // Don't open menu if no attacker selected

  const attackerId = selectedCard.dataset.entityId;
  const attacker = entitiesOnGrid[attackerId];
  const target = entitiesOnGrid[targetId];

  // Check if target belongs to the same player
  if (attacker.owner === target.owner) {
    console.warn("Cannot attack your own cards!");
    return; // Don't show attack menu for friendly targets
  }

  const menu = document.getElementById("attack-menu");
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = "block";

  // Remove old listeners
  const newMenu = menu.cloneNode(true);
  menu.parentNode.replaceChild(newMenu, menu);

  newMenu.querySelectorAll(".attack-btn").forEach(btn => {
    const type = btn.dataset.type;
    const attackPower = attacker?.[type] ?? 0;
    let disabled = attackPower <= 0;

    const dx = Math.abs(attacker.position.x - target.position.x);
    const dy = Math.abs(attacker.position.y - target.position.y);
    const distance = Math.max(dx, dy);

    const ranges = {
      meele: { min: 1, max: 1 },
      ranged: { min: 1, max: 2 },
      blast: { min: 2, max: 3 }
    };

    const { min, max } = ranges[type] || { min: 0, max: 0 };

    // Check if attack is in allowed range
    if (distance < min || distance > max) {
      disabled = true;
      btn.title = `${type} attack out of range (${min}-${max})`;
    }

    // Special rule for blast: only vertical allowed
    if (type === "blast" && attacker.position.x !== target.position.x) {
      disabled = true;
      btn.title = "Blast attack must be vertical";
    }

    // Fallback title if none set
    if (!btn.title && disabled) {
      btn.title = "No attack value in this type";
    }

    btn.disabled = disabled;
    btn.style.opacity = disabled ? 0.4 : 1;

    btn.addEventListener("click", () => {
      handleAttack(attackerId, targetId, type);
      selectedCard.classList.remove("selected");
      selectedCard = null;
      newMenu.style.display = "none";
    });
  });

  document.addEventListener("click", () => {
    newMenu.style.display = "none";
  }, { once: true });
}

function moveEntityTo(entity, newX, newY) {
  const oldX = entity.position.x;
  const oldY = entity.position.y;
  const oldIndex = oldY * gridSize + oldX;
  const oldTile = grid.children[oldIndex];
  const newIndex = newY * gridSize + newX;
  const newTile = grid.children[newIndex];

  const card = oldTile.querySelector(`.card[data-entity-id='${entity.id}']`);
  if (card) {
    oldTile.removeChild(card);
    newTile.appendChild(card);

    // Update position, but keep ID the same
    entity.position = { x: newX, y: newY };
  }
}

function handleAttack(attackerId, targetId, type = "meele") {
  const attacker = entitiesOnGrid[attackerId];
  const target = entitiesOnGrid[targetId];

  if (!attacker || !target || attackerId === targetId) {
    console.warn("Invalid attacker or target.");
    return;
  }

  // Check if target belongs to the same player
  if (attacker.owner === target.owner) {
    console.warn("Cannot attack your own cards!");
    return;
  }

  const dx = Math.abs(attacker.position.x - target.position.x);
  const dy = Math.abs(attacker.position.y - target.position.y);
  const distance = Math.max(dx, dy); // allow diagonal

  if (type === "blast") {
    // Only allow blast on vertical axis (same x)
    if (attacker.position.x !== target.position.x) {
      console.warn("Blast attack must be vertical.");
      return;
    }
  }

  const ranges = {
    meele: { min: 0, max: 1 },
    ranged: { min: 1, max: 5 },
    blast: { min: 2, max: 5 }
  };

  const { min, max } = ranges[type] || { min: 0, max: 0 };

  if (distance < min || distance > max) {
    console.warn(`${type} attack out of range. Distance: ${distance}, allowed: ${min}-${max}`);
    return;
  }
  
  // Get the attack value from the attacker for the attack type
  const attackValue = attacker[type] ?? 0;
  if (attackValue <= 0) {
    console.warn("No attack value for selected type.");
    return;
  }

  const rawDamage = type === "blast" ? attackValue : attackValue - target.armor;
  const actualDamage = Math.max(0, rawDamage);
  updateEntityProperty("health", targetId, -actualDamage);
}

function drawFromDeck(playerNumber, deckId) {
  console.log(`===== DRAWING CARD for ${playerNumber} from ${deckId} =====`);
  
  const deck = decks[deckId];
  if (!deck || deck.length === 0) {
    console.warn("Deck is empty!");
    return;
  }

  // Play card draw sound with explicit debugging
  console.log("About to play draw sound...");
  // First try to play it directly
  sounds.draw.play()
    .then(() => console.log("Draw sound played successfully via direct call"))
    .catch(err => {
      console.error("Direct draw sound failed:", err);
      // Try the regular method as fallback
      playSound("draw", 0.8);
    });
  
  const cardName = deck.shift();
  const ownerId = playerNumber === "player1" ? 1 : 2;
  const container = playerNumber === "player1" ? player1HandElement : player2HandElement;
  
  // Get next available position
  const playerHand = playerNumber === "player1" ? player1Hand : player2Hand;
  const x = playerHand.length % 7;
  const y = 0;
  
  console.log(`Creating entity ${cardName} at position ${x},${y}`);
  createEntity(cardName, x, y, container, ownerId);
  console.log("Card successfully drawn and added to hand");
}

async function getPlayerDeck(playerNumber, jsonFile) {
  try {
    const response = await fetch(jsonFile);
    const data = await response.json();
    const deck = [];
    for (let cardName in data) {
      const count = data[cardName].count || 1;
      for (let i = 0; i < count; i++) {
        deck.push(cardName);
      }
    }
    decks[playerNumber] = deck;
  } catch (error) {
    console.error("Error loading deck:", error);
    // Create a default deck if loading fails
    decks[playerNumber] = ["Default Card", "Default Card", "Default Card"];
  }
}

function shuffleDeck(deckId) {
  const deck = decks[deckId];
  if (!deck || deck.length === 0) return;
  
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function sendToGraveyard(entityId) {
  const entity = entitiesOnGrid[entityId];
  if (!entity) return;
  
  // Play death sound
  playSound("death");
  
  // Get the card element
  const cardElement = document.querySelector(`.card[data-entity-id="${entityId}"]`);
  if (!cardElement) return;
  
  // First remove any existing damage animation
  cardElement.classList.remove("damage-animation");
  
  // Add a dramatic glow effect before death
  cardElement.style.boxShadow = "0 0 20px 10px rgba(255, 0, 0, 0.7)";
  cardElement.style.zIndex = "100"; // Bring to front
  
  // Wait a moment for the glow to be visible
  setTimeout(() => {
    // Create a death animation
    cardElement.classList.add("death-animation");
    
    // Wait for animation to complete before removing
    setTimeout(() => {
      // Find the parent tile and remove the card
      const parentTile = cardElement.parentElement;
      if (parentTile) {
        parentTile.removeChild(cardElement);
      }
      
      // Add card to appropriate graveyard
      const playerGraveyard = entity.owner === 1 ? graveyard_player1 : graveyard_player2;
      playerGraveyard.push({...entity}); // Add a copy to graveyard
      
      // Update graveyard display
      if (entity.owner === 1) {
        renderGraveyard(graveyard_player1, player1Graveyard);
      } else {
        renderGraveyard(graveyard_player2, player2Graveyard);
      }
      
      // Remove from entities object
      delete entitiesOnGrid[entityId];
      
      console.log(`Card ${entity.name} (${entityId}) sent to Player ${entity.owner} graveyard`);
    }, 2000); // Increased animation duration
  }, 300); // Short delay for the glow effect
}

async function initializeGame() {
  try {
    const cardDataResponse = await fetch("cards.json");
    Object.assign(cardData, await cardDataResponse.json());
  } catch (error) {
    console.warn("Could not load card data, using defaults");
    // Create some default cards
    cardData["Default Card"] = {
      movement: 1, meele: 1, ranged: 0, blast: 0, 
      health: 5, armor: 1, courage: 3
    };
  }
  
  await getPlayerDeck("player1_deck", "player1_deck.json");
  await getPlayerDeck("player2_deck", "player2_deck.json");
  
  // Shuffle initial decks
  shuffleDeck("player1_deck");
  shuffleDeck("player2_deck");
  
  // Load sounds
  loadSounds();
}

initializeGame();

function updateEntityProperty(propertyName, entityId, delta) {
  const entity = entitiesOnGrid[entityId];
  if (!entity || typeof entity[propertyName] !== 'number') {
    console.warn("Invalid entity or property:", entityId, propertyName);
    return;
  }

  entity[propertyName] += delta;

  // Clamp to 0 if needed (optional)
  if (entity[propertyName] < 0) {
    entity[propertyName] = 0;
  }

  // Update the display
  const card = document.querySelector(`.card[data-entity-id="${entityId}"]`);
  if (card) {
    const info = card.querySelector(".card-info");
    if (info) {
      info.innerText = ` 🏃${entity.movement} ⚔️${entity.meele} 🏹${entity.ranged} 💥${entity.blast} 🛡️${entity.armor} ❤️${entity.health} 🧠${entity.courage}`;
    }

    // Play damage sound if health is decreasing
    if (propertyName === "health" && delta < 0) {
      playSound("damage");
    }

    // Trigger damage animation
    card.classList.add("damage-animation");
    setTimeout(() => {
      card.classList.remove("damage-animation");
    }, 1000); // Matches animation duration
    
    // Check if health is zero and send to graveyard if needed
    if (propertyName === "health" && entity.health <= 0) {
      console.log(`Entity ${entityId} health is zero, sending to graveyard`);
      sendToGraveyard(entityId);
    }
  }
}

document.getElementById("damage-button").addEventListener("click", () => {
  const id = document.getElementById("damage-target-id").value.trim();
  if (id) {
    updateEntityProperty("health", id, -1);
  }
});

// Sound system
const sounds = {
  damage: null,
  death: null,
  attack: null,
  draw: null
};

// Preload sounds
function loadSounds() {
  let soundsLoaded = 0;
  const expectedSounds = 3; // damage, death, draw
  
  function checkAllLoaded() {
    soundsLoaded++;
    console.log(`Sound loaded: ${soundsLoaded}/${expectedSounds}`);
    if (soundsLoaded >= expectedSounds) {
      console.log("✅ All sounds loaded successfully!");
    }
  }
  
  try {
    console.log("Starting sound system initialization...");
    
    // Create audio objects with load event tracking
    sounds.damage = new Audio("Sounds/damage.mp3");
    sounds.damage.addEventListener('canplaythrough', () => {
      console.log("Damage sound loaded and ready");
      checkAllLoaded();
    }, {once: true});
    
    sounds.death = new Audio("Sounds/death.mp3");
    sounds.death.addEventListener('canplaythrough', () => {
      console.log("Death sound loaded and ready");
      checkAllLoaded();
    }, {once: true});
    
    sounds.draw = new Audio("Sounds/draw.mp3"); 
    sounds.draw.addEventListener('canplaythrough', () => {
      console.log("Draw sound loaded and ready");
      checkAllLoaded();
    }, {once: true});
    
    // Set volume for all sounds
    Object.values(sounds).forEach(sound => {
      if (sound) {
        sound.volume = 0.6;
        // Force loading to start
        sound.load();
      }
    });
    
    console.log("Sound initialization requested - waiting for loads to complete");
  } catch (error) {
    console.error("❌ Error loading sounds:", error);
  }
}

function playSound(soundName, volume = null) {
  console.log(`Attempting to play sound: ${soundName}`);
  
  const sound = sounds[soundName];
  if (!sound) {
    console.error(`Sound '${soundName}' not found`);
    return;
  }
  
  // Clone the audio to allow overlapping sounds
  const soundClone = sound.cloneNode();
  if (volume !== null) soundClone.volume = volume;
  
  // Set up event listeners for debugging
  soundClone.onplay = () => console.log(`${soundName} sound started playing`);
  soundClone.onerror = (e) => console.error(`Error playing ${soundName} sound:`, e);
  
  // Try to play the sound
  try {
    const playPromise = soundClone.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => console.log(`${soundName} sound played successfully`))
        .catch(error => {
          console.error(`Failed to play ${soundName} sound:`, error);
          
          // Additional recovery attempt - sometimes a fresh Audio object works better
          console.log("Attempting recovery play...");
          setTimeout(() => {
            const recoverySound = new Audio(sound.src);
            recoverySound.volume = volume !== null ? volume : 0.6;
            recoverySound.play().catch(e => console.error("Recovery attempt failed:", e));
          }, 100);
        });
    }
  } catch (error) {
    console.error(`Exception playing ${soundName} sound:`, error);
  }
}

// This will handle highlighting eligible tiles when a card is selected
function highlightEligiblePlacement() {
  // Clear any existing highlights
  document.querySelectorAll('.tile.eligible-placement').forEach(tile => {
    tile.classList.remove('eligible-placement');
  });
  
  // If no card is selected, return
  if (!selectedCard) return;
  
  const entityId = selectedCard.dataset.entityId;
  const entity = entitiesOnGrid[entityId];
  
  if (!entity) return;
  
  // If card is from hand, highlight eligible tiles based on player
  if (entity.container === player2HandElement || entity.container === player1HandElement) {
    const isPlayer1 = entity.container === player1HandElement;
    const targetRow = isPlayer1 ? gridSize - 1 : 0; // Bottom row or top row
    
    // Highlight only the appropriate row
    for (let x = 0; x < gridSize; x++) {
      const tileIndex = targetRow * gridSize + x;
      const tile = grid.children[tileIndex];
      
      // Only highlight if tile is empty
      if (!tile.querySelector('.card')) {
        tile.classList.add('eligible-placement');
      }
    }
  } else if (entity.container === grid) {
    // If card is already on grid, highlight tiles within movement range
    const x = entity.position.x;
    const y = entity.position.y;
    const movementRange = entity.movement;
    
    // Check each tile on the grid
    for (let gridY = 0; gridY < gridSize; gridY++) {
      for (let gridX = 0; gridX < gridSize; gridX++) {
        // Calculate distance (using Chebyshev distance for diagonal movement)
        const dx = Math.abs(x - gridX);
        const dy = Math.abs(y - gridY);
        const distance = Math.max(dx, dy);
        
        if (distance <= movementRange) {
          const tileIndex = gridY * gridSize + gridX;
          const tile = grid.children[tileIndex];
          
          // Only highlight if tile is empty
          if (!tile.querySelector('.card')) {
            tile.classList.add('eligible-placement');
          }
        }
      }
    }
  }
}

(function () {

  let playerId;
  let playerRef;

  firebase.auth().onAuthStateChanged((user) => {
    console.log(user)
    if (user) {
      //You're logged in!
      playerId = user.uid;
      playerRef = firebase.database().ref(`players/${playerId}`);

      const name = createName();
      playerNameInput.value = name;

      const {x, y} = getRandomSafeSpot();


      playerRef.set({
        id: playerId,
        name: "bob",
        playerNumber: "player1"
      })

      //Remove me from Firebase when I diconnect
      playerRef.onDisconnect().remove();

      //Begin the game now that we are signed in
      initGame();
    } else {
      //You're logged out.
    }
  })



  firebase.auth().signInAnonymously().catch((error) => {
    var errorCode = error.code;
    var errorMessage = error.message;
    // ...
    console.log(errorCode, errorMessage);
  });


})();