// Candidate built-in training positions. Each is verified by
// scripts/verify-puzzles.mjs with Stockfish before being written to
// src/data/puzzles.json. `user` lists the solver's moves in SAN; the opponent's
// replies are filled in from the engine's best defence during verification.
// `setup` positions come from public-domain 19th/early-20th century games.

export const tactics = [
  { id: 'back-rank-1', title: 'Back-rank weakness', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', user: ['Rd8#'], themes: ['mate-in-1', 'back-rank'], rating: 500 },
  { id: 'scholar-1', title: 'The weak f7 square', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', user: ['Qxf7#'], themes: ['mate-in-1', 'f7-weakness'], rating: 450 },
  { id: 'smothered-1', title: 'Smothered', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', user: ['Nf7#'], themes: ['mate-in-1', 'smothered-mate'], rating: 650 },
  { id: 'arabian-1', title: 'Rook and knight team-up', fen: '7k/8/5N2/8/8/8/8/6RK w - - 0 1', user: ['Rg8#'], themes: ['mate-in-1', 'arabian-mate'], rating: 700 },
  { id: 'ladder-1', title: 'Two-rook ladder', fen: 'k7/7R/8/8/8/8/8/6RK w - - 0 1', user: ['Rg8#'], themes: ['mate-in-1', 'ladder-mate'], rating: 450 },
  { id: 'queen-kiss-1', title: 'Supported queen', fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', user: ['Qg7#'], themes: ['mate-in-1'], rating: 400 },
  { id: 'fork-1', title: 'Royal fork', fen: 'r3k3/8/8/1N6/8/8/6PP/6K1 w - - 0 1', user: ['Nc7+', 'Nxa8'], themes: ['fork', 'knight'], rating: 750 },
  { id: 'skewer-1', title: 'Through the king', fen: '3q4/8/8/3k4/8/8/8/R5K1 w - - 0 1', user: ['Rd1+', 'Rxd8'], themes: ['skewer'], rating: 800 },
  {
    id: 'opera-1',
    title: 'Morphy at the Opera (1858)',
    setup: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7',
    user: ['Qb8+', 'Rd8#'],
    themes: ['mate-in-2', 'sacrifice', 'back-rank'],
    rating: 1200,
  },
  {
    id: 'immortal-1',
    title: 'The Immortal Game (1851)',
    setup: '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8',
    user: ['Qf6+', 'Be7#'],
    themes: ['mate-in-2', 'sacrifice', 'deflection'],
    rating: 1400,
  },
  {
    id: 'reti-1',
    title: 'Réti vs Tartakower (1910)',
    setup: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Qd3 e5 6. dxe5 Qa5+ 7. Bd2 Qxe5 8. O-O-O Nxe4',
    user: ['Qd8+', 'Bg5+', ['Bd8#', 'Rd8#']],
    themes: ['mate-in-3', 'sacrifice', 'double-check'],
    rating: 1600,
  },
  {
    id: 'legal-1',
    title: "Légal's mate",
    setup: '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1',
    user: ['Bxf7+', 'Nd5#'],
    themes: ['mate-in-2', 'opening-trap'],
    rating: 1000,
  },
  {
    id: 'evergreen-1',
    title: 'The Evergreen Game (1852)',
    setup: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7',
    user: ['Qxd7+', 'Bf5+', 'Bd7+', 'Bxe7#'],
    themes: ['mate-in-4', 'sacrifice', 'double-check'],
    rating: 1900,
  },
  { id: 'fool-1', title: "Punish the weakened diagonal", setup: '1. f3 e5 2. g4', user: ['Qh4#'], themes: ['mate-in-1', 'king-safety'], rating: 400 },
  { id: 'hanging-queen-1', title: 'Free material', fen: 'rnb1kbnr/pppp1ppp/8/4p1q1/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', user: ['Nxg5'], themes: ['hanging-piece'], rating: 400 },
  { id: 'mate-2-queen', title: 'Queen and rook', fen: '6k1/5ppp/8/8/8/8/1Q3PPP/4R1K1 w - - 0 1', user: ['Re8#'], themes: ['mate-in-1', 'back-rank'], rating: 500 },
  { id: 'battery-1', title: 'Doubled on the file', fen: '3r2k1/5ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1', user: ['Qxd8#'], themes: ['mate-in-1', 'back-rank', 'battery'], rating: 550 },
];

// Endgame drills: play the position out against the engine.
export const drills = [
  { id: 'kqk', title: 'Queen mate', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', goal: 'checkmate', maxMoves: 20, expect: 'win', themes: ['endgame', 'basic-mate'], rating: 700, tip: 'Use the queen to box the king in (a knight\'s move away), then bring your king up. Watch for stalemate!' },
  { id: 'krk', title: 'Rook mate', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', goal: 'checkmate', maxMoves: 32, expect: 'win', themes: ['endgame', 'basic-mate'], rating: 900, tip: 'Cut the king off with the rook, use opposition with your king, and shrink the box one rank at a time.' },
  { id: 'kpk-6th', title: 'King leads the pawn', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', goal: 'promote', maxMoves: 20, expect: 'win', themes: ['endgame', 'pawn-endgame', 'opposition'], rating: 1000, tip: 'With your king on the sixth rank in front of the pawn, the win is guaranteed. Keep the opposition and escort the pawn.' },
  { id: 'kpk-opposition', title: 'Take the opposition', fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', goal: 'promote', maxMoves: 30, expect: 'win', themes: ['endgame', 'pawn-endgame', 'opposition'], rating: 1200, tip: 'Lead with the king, not the pawn. Gain the opposition so the defending king has to step aside.' },
  { id: 'lucena', title: 'Lucena: build a bridge', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', goal: 'promote', maxMoves: 30, expect: 'win', themes: ['endgame', 'rook-endgame'], rating: 1700, tip: 'Cut the enemy king off, bring your rook to the fourth rank, then use it as a shield against checks.' },
  { id: 'philidor', title: 'Philidor defence', fen: '4k3/8/8/4PK2/8/8/r7/7R b - - 0 1', goal: 'hold-draw', maxMoves: 30, expect: 'draw', themes: ['endgame', 'rook-endgame', 'defence'], rating: 1600, tip: 'Keep your rook on the third rank (sixth for you as Black) until the pawn advances, then check from behind.' },
];
