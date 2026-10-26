/**
 * Common opening traps. Lines are standard theory (checked for legality by the
 * test suite); explanations are Chessy's own coaching text.
 */
export interface Trap {
  id: string;
  name: string;
  opening: string;
  /** Side that springs the trap. */
  winner: 'w' | 'b';
  moves: string[];
  /** Index (into moves) of the mistake that falls into the trap. */
  mistakeAt: number;
  lesson: string;
}

export const TRAPS: Trap[] = [
  {
    id: 'fools-mate',
    name: "Fool's Mate",
    opening: 'Bird / Barnes Opening',
    winner: 'b',
    moves: ['f3', 'e5', 'g4', 'Qh4#'],
    mistakeAt: 2,
    lesson: 'Moving the f- and g-pawns early opens the e1–h4 diagonal to the king. Avoid weakening pawn moves in front of an uncastled king.',
  },
  {
    id: 'scholars-mate',
    name: "Scholar's Mate",
    opening: 'King\'s Pawn Game',
    winner: 'w',
    moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
    mistakeAt: 5,
    lesson: 'f7 is defended only by the king at the start. When a queen and bishop aim at f7, defend it (…g6 or …Qe7) before developing elsewhere.',
  },
  {
    id: 'legals-mate',
    name: "Légal's Mate",
    opening: 'Philidor Defence',
    winner: 'w',
    moves: ['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3', 'g6', 'Nxe5', 'Bxd1', 'Bxf7+', 'Ke7', 'Nd5#'],
    mistakeAt: 9,
    lesson: 'A pin is only real if breaking it costs something. Here taking the queen allows mate with the minor pieces — always check what your opponent threatens after an apparent blunder.',
  },
  {
    id: 'blackburne-shilling',
    name: 'Blackburne Shilling Gambit',
    opening: 'Italian Game',
    winner: 'b',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxe5', 'Qg5', 'Nxf7', 'Qxg2', 'Rf1', 'Qxe4+', 'Be2', 'Nf3#'],
    mistakeAt: 6,
    lesson: 'Grabbing the e5 pawn opens your kingside to the queen. When an opponent leaves a pawn hanging in the opening, look for the reason first.',
  },
  {
    id: 'elephant',
    name: 'Elephant Trap',
    opening: "Queen's Gambit Declined",
    winner: 'b',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'cxd5', 'exd5', 'Nxd5', 'Nxd5', 'Bxd8', 'Bb4+', 'Qd2', 'Bxd2+', 'Kxd2', 'Kxd8'],
    mistakeAt: 10,
    lesson: 'The knight on f6 looks pinned, but …Nxd5 unpins with tempo because …Bb4+ wins material back. Check whether a pin is absolute before relying on it.',
  },
  {
    id: 'lasker',
    name: 'Lasker Trap',
    opening: 'Albin Countergambit',
    winner: 'b',
    moves: ['d4', 'd5', 'c4', 'e5', 'dxe5', 'd4', 'e3', 'Bb4+', 'Bd2', 'dxe3', 'Bxb4', 'exf2+', 'Ke2', 'fxg1=N+'],
    mistakeAt: 10,
    lesson: 'Underpromotion to a knight with check keeps the initiative. Count forcing moves (checks, captures) before grabbing material.',
  },
  {
    id: 'noahs-ark',
    name: "Noah's Ark Trap",
    opening: 'Ruy Lopez',
    winner: 'b',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'd6', 'd4', 'b5', 'Bb3', 'Nxd4', 'Nxd4', 'exd4', 'Qxd4', 'c5', 'Qd5', 'Be6', 'Qc6+', 'Bd7', 'Qd5', 'c4'],
    mistakeAt: 14,
    lesson: 'The bishop on b3 runs out of squares after …c5–c4. Watch for pawn chains that can trap a bishop on the edge.',
  },
  {
    id: 'englund',
    name: 'Englund Gambit Trap',
    opening: 'Englund Gambit',
    winner: 'b',
    moves: ['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Qe7', 'Bf4', 'Qb4+', 'Bd2', 'Qxb2', 'Bc3', 'Bb4', 'Qd2', 'Bxc3', 'Qxc3', 'Qc1#'],
    mistakeAt: 10,
    lesson: 'After …Qxb2 the back rank is weak: Bc3 looks active but allows …Bb4 and mate on c1. Develop with Nc3/Nbd2 instead.',
  },
  {
    id: 'siberian',
    name: 'Siberian Trap',
    opening: 'Smith–Morra Gambit',
    winner: 'b',
    moves: ['e4', 'c5', 'd4', 'cxd4', 'c3', 'dxc3', 'Nxc3', 'Nc6', 'Nf3', 'e6', 'Bc4', 'Qc7', 'O-O', 'Nf6', 'Qe2', 'Ng4', 'h3', 'Nd4', 'Nxd4', 'Qh2#'],
    mistakeAt: 16,
    lesson: 'h3 to chase the knight walks into …Nd4!, deflecting the f3 knight that guards h2. Before "kicking" a piece, check what it is aiming at.',
  },
];

export const OPENING_PRINCIPLES = [
  { title: 'Control the centre', text: 'Pawns and pieces on or aimed at e4, d4, e5 and d5 give your pieces more space and restrict your opponent.' },
  { title: 'Develop quickly', text: 'Bring knights and bishops out before moving the same piece twice. Each tempo counts in the opening.' },
  { title: 'Castle early', text: 'Castling protects the king and connects the rooks. Aim to castle within the first 10 moves.' },
  { title: "Don't bring the queen out too early", text: 'An early queen can be chased by minor pieces, gaining tempi for your opponent.' },
  { title: 'Connect your rooks', text: 'Once minor pieces are developed and the king is castled, move the queen so the rooks see each other.' },
  { title: 'Don\'t grab pawns at any cost', text: 'Gambits trade material for time. Before taking a pawn, ask what it costs in development and king safety.' },
];
