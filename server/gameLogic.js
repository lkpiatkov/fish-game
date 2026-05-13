// All 9 sets in the game
const SETS = {
  lowSpades:   { name: 'Low Spades',   cards: ['2S','3S','4S','5S','6S','7S'] },
  highSpades:  { name: 'High Spades',  cards: ['9S','10S','JS','QS','KS','AS'] },
  lowHearts:   { name: 'Low Hearts',   cards: ['2H','3H','4H','5H','6H','7H'] },
  highHearts:  { name: 'High Hearts',  cards: ['9H','10H','JH','QH','KH','AH'] },
  lowClubs:    { name: 'Low Clubs',    cards: ['2C','3C','4C','5C','6C','7C'] },
  highClubs:   { name: 'High Clubs',   cards: ['9C','10C','JC','QC','KC','AC'] },
  lowDiamonds: { name: 'Low Diamonds', cards: ['2D','3D','4D','5D','6D','7D'] },
  highDiamonds:{ name: 'High Diamonds',cards: ['9D','10D','JD','QD','KD','AD'] },
  eightsJokers:{ name: 'Eights & Jokers', cards: ['8S','8H','8C','8D','JOKERG','JOKERQ'] },
};

// Figure out which set a card belongs to
function getSetForCard(card) {
  for (const [setKey, setData] of Object.entries(SETS)) {
    if (setData.cards.includes(card)) return setKey;
  }
  return null;
}

// Build and shuffle a full 54 card deck
function buildDeck() {
  const deck = [];
  for (const setData of Object.values(SETS)) {
    for (const card of setData.cards) {
      deck.push(card);
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Deal 9 cards to each of 6 players
function dealCards(players) {
  const deck = buildDeck();
  const hands = {};
  players.forEach((player, i) => {
    hands[player.id] = deck.slice(i * 9, (i + 1) * 9);
  });
  return hands;
}

// Check if a player has any card in a given set
function playerHasSetMember(hand, setKey) {
  return hand.some(card => getSetForCard(card) === setKey);
}

// Check if asking for a card is a valid move
// Returns { valid: true } or { valid: false, reason: '...' }
function validateAsk(askerHand, requestedCard) {
  // Can't ask for a card you already have
  if (askerHand.includes(requestedCard)) {
    return { valid: false, reason: 'burn_self' };
  }
  // Can only ask for a card in a set you have a member of
  const setKey = getSetForCard(requestedCard);
  if (!playerHasSetMember(askerHand, setKey)) {
    return { valid: false, reason: 'burn_wrong_set' };
  }
  return { valid: true };
}

// Check if a team has all 6 cards of a set across their hands
function checkDeclaration(setKey, cardAssignments, hands) {
  const setCards = SETS[setKey].cards;
  for (const card of setCards) {
    const assignedPlayerId = cardAssignments[card];
    if (!assignedPlayerId) return { valid: false, reason: `No assignment given for ${card}` };
    if (!hands[assignedPlayerId] || !hands[assignedPlayerId].includes(card)) {
      return { valid: false, reason: `${card} is not in that player's hand` };
    }
  }
  return { valid: true };
}

module.exports = {
  SETS,
  getSetForCard,
  buildDeck,
  dealCards,
  playerHasSetMember,
  validateAsk,
  checkDeclaration,
};