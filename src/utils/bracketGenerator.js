const Match = require('../models/Match');
const logger = require('./logger');

/**
 * Generate tournament bracket based on participants and tournament type
 */
const generateBracket = async (tournament) => {
  try {
    const { participants, bracket, _id: tournamentId } = tournament;
    
    // Filter confirmed participants
    const confirmedParticipants = participants.filter(p => p.status === 'confirmed');
    
    if (confirmedParticipants.length < 2) {
      throw new Error('At least 2 confirmed participants required to generate bracket');
    }

    // Shuffle participants for random seeding (or use existing seeds)
    const seededParticipants = seedParticipants(confirmedParticipants);
    
    let matches = [];
    
    switch (bracket.type) {
      case 'single_elimination':
        matches = await generateSingleEliminationBracket(tournamentId, seededParticipants);
        break;
      case 'double_elimination':
        matches = await generateDoubleEliminationBracket(tournamentId, seededParticipants);
        break;
      case 'round_robin':
        matches = await generateRoundRobinBracket(tournamentId, seededParticipants);
        break;
      case 'swiss':
        matches = await generateSwissBracket(tournamentId, seededParticipants);
        break;
      default:
        throw new Error(`Unsupported bracket type: ${bracket.type}`);
    }

    // Organize matches into rounds
    const rounds = organizeBracketRounds(matches);
    
    // Update tournament bracket
    tournament.bracket.rounds = rounds;
    await tournament.save();

    logger.info(`Bracket generated for tournament ${tournamentId}: ${matches.length} matches created`);
    
    return {
      matches,
      rounds,
      totalRounds: rounds.length
    };
    
  } catch (error) {
    logger.error('Error generating bracket:', error);
    throw error;
  }
};

/**
 * Seed participants (assign bracket positions)
 */
const seedParticipants = (participants) => {
  // If participants already have seeds, sort by them
  if (participants.some(p => p.seed)) {
    return participants.sort((a, b) => (a.seed || 999) - (b.seed || 999));
  }
  
  // Otherwise, shuffle for random seeding
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  // Assign seeds
  return shuffled.map((participant, index) => ({
    ...participant,
    seed: index + 1
  }));
};

/**
 * Generate single elimination bracket
 */
const generateSingleEliminationBracket = async (tournamentId, participants) => {
  const matches = [];
  let currentRound = 1;
  let matchNumber = 1;
  
  // Calculate number of rounds needed
  const totalRounds = Math.ceil(Math.log2(participants.length));
  
  // First round - pair up all participants
  let currentParticipants = [...participants];
  
  // Add byes if needed to make it a power of 2
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(participants.length)));
  const byesNeeded = nextPowerOf2 - participants.length;
  
  for (let i = 0; i < byesNeeded; i++) {
    currentParticipants.push({ bye: true, seed: participants.length + i + 1 });
  }
  
  while (currentParticipants.length > 1) {
    const roundMatches = [];
    
    // Pair participants for this round
    for (let i = 0; i < currentParticipants.length; i += 2) {
      const participant1 = currentParticipants[i];
      const participant2 = currentParticipants[i + 1];
      
      // Skip if both are byes
      if (participant1.bye && participant2.bye) {
        continue;
      }
      
      // Handle bye - advance the non-bye participant
      if (participant1.bye || participant2.bye) {
        const advancingParticipant = participant1.bye ? participant2 : participant1;
        roundMatches.push(advancingParticipant);
        continue;
      }
      
      // Create match
      const match = await Match.create({
        tournament: tournamentId,
        matchNumber: matchNumber++,
        round: currentRound,
        bracketPosition: `R${currentRound}-M${Math.floor(i / 2) + 1}`,
        participants: [
          { user: participant1.user, seed: participant1.seed },
          { user: participant2.user, seed: participant2.seed }
        ],
        gameMode: '1v1', // Default, should be set based on tournament type
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + (currentRound - 1) * 24 * 60 * 60 * 1000) // Schedule 1 day apart
      });
      
      matches.push(match);
      roundMatches.push({ matchId: match._id, round: currentRound });
    }
    
    currentParticipants = roundMatches;
    currentRound++;
  }
  
  return matches;
};

/**
 * Generate double elimination bracket
 */
const generateDoubleEliminationBracket = async (tournamentId, participants) => {
  // Double elimination is more complex - implement basic version
  // This would need winner's bracket and loser's bracket
  
  // For now, fall back to single elimination
  logger.warn('Double elimination not fully implemented, using single elimination');
  return generateSingleEliminationBracket(tournamentId, participants);
};

/**
 * Generate round robin bracket (everyone plays everyone)
 */
const generateRoundRobinBracket = async (tournamentId, participants) => {
  const matches = [];
  let matchNumber = 1;
  let round = 1;
  
  // Generate all possible pairings
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const match = await Match.create({
        tournament: tournamentId,
        matchNumber: matchNumber++,
        round: round,
        bracketPosition: `RR-M${matchNumber - 1}`,
        participants: [
          { user: participants[i].user, seed: participants[i].seed },
          { user: participants[j].user, seed: participants[j].seed }
        ],
        gameMode: '1v1',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + (matchNumber - 2) * 60 * 60 * 1000) // Schedule 1 hour apart
      });
      
      matches.push(match);
      
      // Distribute matches across rounds for better scheduling
      if (matchNumber % Math.ceil(participants.length / 2) === 1) {
        round++;
      }
    }
  }
  
  return matches;
};

/**
 * Generate Swiss system bracket
 */
const generateSwissBracket = async (tournamentId, participants) => {
  // Swiss system pairs players with similar scores
  // For first round, pair randomly
  
  const matches = [];
  let matchNumber = 1;
  const round = 1;
  
  // Shuffle participants for first round
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  
  // Create first round matches
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      const match = await Match.create({
        tournament: tournamentId,
        matchNumber: matchNumber++,
        round: round,
        bracketPosition: `S${round}-M${Math.floor(i / 2) + 1}`,
        participants: [
          { user: shuffled[i].user, seed: shuffled[i].seed },
          { user: shuffled[i + 1].user, seed: shuffled[i + 1].seed }
        ],
        gameMode: '1v1',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + Math.floor(i / 2) * 60 * 60 * 1000)
      });
      
      matches.push(match);
    }
  }
  
  return matches;
};

/**
 * Organize matches into rounds structure
 */
const organizeBracketRounds = (matches) => {
  const roundsMap = new Map();
  
  matches.forEach(match => {
    const roundNumber = match.round;
    
    if (!roundsMap.has(roundNumber)) {
      roundsMap.set(roundNumber, {
        roundNumber,
        matches: []
      });
    }
    
    roundsMap.get(roundNumber).matches.push(match._id);
  });
  
  // Convert map to array and sort by round number
  return Array.from(roundsMap.values()).sort((a, b) => a.roundNumber - b.roundNumber);
};

/**
 * Generate next round matches based on completed matches
 */
const generateNextRound = async (tournament) => {
  try {
    const currentRound = await getCurrentRound(tournament._id);
    const completedMatches = await Match.find({
      tournament: tournament._id,
      round: currentRound,
      status: 'completed'
    }).populate('winner');
    
    // Check if all matches in current round are completed
    const totalCurrentRoundMatches = await Match.countDocuments({
      tournament: tournament._id,
      round: currentRound
    });
    
    if (completedMatches.length !== totalCurrentRoundMatches) {
      throw new Error('Not all matches in current round are completed');
    }
    
    // Get winners for next round
    const winners = completedMatches
      .filter(match => match.winner)
      .map(match => ({
        user: match.winner._id,
        seed: Math.min(...match.participants.map(p => p.seed))
      }));
    
    if (winners.length < 2) {
      // Tournament is complete
      return { completed: true, winner: winners[0] };
    }
    
    // Generate next round matches
    const nextRoundMatches = [];
    let matchNumber = await Match.countDocuments({ tournament: tournament._id }) + 1;
    
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) {
        const match = await Match.create({
          tournament: tournament._id,
          matchNumber: matchNumber++,
          round: currentRound + 1,
          bracketPosition: `R${currentRound + 1}-M${Math.floor(i / 2) + 1}`,
          participants: [
            { user: winners[i].user, seed: winners[i].seed },
            { user: winners[i + 1].user, seed: winners[i + 1].seed }
          ],
          gameMode: '1v1',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Next day
        });
        
        nextRoundMatches.push(match);
      }
    }
    
    return { completed: false, matches: nextRoundMatches };
    
  } catch (error) {
    logger.error('Error generating next round:', error);
    throw error;
  }
};

/**
 * Get current active round for tournament
 */
const getCurrentRound = async (tournamentId) => {
  const latestMatch = await Match.findOne({ tournament: tournamentId })
    .sort({ round: -1 })
    .select('round');
  
  return latestMatch ? latestMatch.round : 1;
};

module.exports = {
  generateBracket,
  generateNextRound,
  getCurrentRound,
  seedParticipants
};
