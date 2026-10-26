/**
 * Curated coaching lessons used by the offline coach. These are general chess
 * principles written for Chessy — strategic guidance, not engine output.
 */
export interface LessonStep {
  text: string;
  /** Optional illustrative position. */
  fen?: string;
}

export interface LessonQuestion {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  keywords: RegExp;
  summary: string;
  steps: LessonStep[];
  beginnerNote?: string;
  quiz: LessonQuestion[];
}

export const LESSONS: Lesson[] = [
  {
    id: 'opening-principles',
    title: 'Opening principles',
    keywords: /opening principle|how (do|should) i open|start (a|the) game|develop/i,
    summary: 'Fight for the centre, develop pieces quickly, castle early, and don\'t waste moves.',
    steps: [
      { text: 'Control the centre (d4, e4, d5, e5) with pawns and pieces. Pieces in the centre reach more squares.' },
      { text: 'Develop knights and bishops before moving the same piece twice. A useful rule: knights before bishops, and rarely bring the queen out early — it gets chased and you lose time.' },
      { text: 'Castle early. It tucks the king away and connects the rooks.', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4' },
      { text: 'Before each move ask: does this develop a piece, fight for the centre, or improve king safety? If not, is it answering a real threat?' },
    ],
    beginnerNote: 'If you only remember one thing: get your knights and bishops off the back row and castle within the first 10 moves.',
    quiz: [
      {
        prompt: 'After 1.e4 e5, which move follows the opening principles best?',
        options: ['2.Qh5', '2.Nf3', '2.a4', '2.Ke2'],
        answer: 1,
        explanation: '2.Nf3 develops a piece towards the centre and attacks the e5 pawn. 2.Qh5 brings the queen out early where it can be chased.',
      },
      {
        prompt: 'Why is castling usually good in the opening?',
        options: ['It wins material', 'It protects the king and connects the rooks', 'It controls the centre', 'It is required by the rules'],
        answer: 1,
        explanation: 'Castling moves the king away from the centre (where files open up) and lets the rooks see each other.',
      },
    ],
  },
  {
    id: 'attack-castled-king',
    title: 'Attacking the castled king',
    keywords: /attack.*(castled|king)|king ?side attack|mating attack/i,
    summary: 'Bring more attackers than defenders, open lines with pawns or sacrifices, and use typical patterns.',
    steps: [
      { text: 'Count attackers and defenders near the king. An attack needs more of your pieces nearby than their defenders — usually at least three pieces.' },
      { text: 'Open lines: pawn storms (g4–g5, h4–h5) work best when kings are castled on opposite sides; with same-side castling, piece play and sacrifices are more typical.' },
      { text: 'Know the patterns: the Greek gift (Bxh7+), sacrifices on f7/f2, back-rank mates, and the knight + queen battery on g7/h7.', fen: 'r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R2QK2R w KQ - 0 8' },
      { text: 'Remove or distract defenders: trade the knight on f6, deflect the bishop guarding the dark squares, or lure the king forward.' },
      { text: 'Don\'t forget the centre: an attack on the wing is strongest when the centre is closed or under your control.' },
    ],
    beginnerNote: 'Look for checks and captures near the enemy king every move — especially on f7/f2 and h7/h2.',
    quiz: [
      {
        prompt: 'Both sides castled kingside. What usually makes a pawn storm risky?',
        options: ['It weakens your own king', 'Pawns cannot attack', 'It is illegal', 'It always loses a pawn'],
        answer: 0,
        explanation: 'With kings on the same side, pushing g/h pawns also opens lines towards your own king.',
      },
      {
        prompt: 'What is the "Greek gift"?',
        options: ['A queen trade', 'A bishop sacrifice on h7 (or h2)', 'Promoting to a knight', 'An opening gambit'],
        answer: 1,
        explanation: 'Bxh7+ followed by Ng5+ and Qh5 is a classic attacking pattern against a castled king.',
      },
    ],
  },
  {
    id: 'positional',
    title: 'Positional chess basics',
    keywords: /position(al)?|strateg|plan(ning)?|what (should|do) i do when there are no tactics/i,
    summary: 'When there are no tactics, improve your worst piece, target weaknesses, and play on the side where you are stronger.',
    steps: [
      { text: 'Find your worst-placed piece and improve it. A bad bishop blocked by its own pawns or a knight on the rim are typical candidates.' },
      { text: 'Pawn structure decides plans: isolated, doubled and backward pawns are long-term targets; passed pawns are long-term assets.' },
      { text: 'Open files belong to the rooks. Put a rook on an open file and aim for the seventh rank.' },
      { text: 'Outposts: a square your opponent\'s pawns can never attack is a perfect home for a knight.' },
      { text: 'Play where you are stronger: if your pawns point at the kingside, that is usually where you attack.' },
    ],
    beginnerNote: 'Positional play starts with a simple question: which of my pieces is doing the least? Make it better.',
    quiz: [
      {
        prompt: 'What is an outpost?',
        options: ['A square that enemy pawns can no longer attack', 'Any square on the 8th rank', 'A square next to your king', 'A pinned piece'],
        answer: 0,
        explanation: 'Because pawns cannot move backwards, an outpost can only be challenged by pieces — ideal for a knight.',
      },
    ],
  },
  {
    id: 'endgame-basics',
    title: 'Endgame fundamentals',
    keywords: /endgame|end game|king and pawn|opposition|rook ending/i,
    summary: 'Activate the king, push passed pawns, know the opposition, and keep rooks active.',
    steps: [
      { text: 'In the endgame the king becomes a fighting piece. Bring it towards the centre or the pawns.' },
      { text: 'Passed pawns must be pushed. Support them with the king or rook.' },
      { text: 'The opposition: when kings face each other with one square between them, the side NOT to move usually wins the battle for key squares.', fen: '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1' },
      { text: 'Rook endgames: put rooks behind passed pawns (yours or theirs), and keep your rook active — a passive rook loses.' },
      { text: 'Converting an advantage: trade pieces, not pawns, when you are ahead in material.' },
    ],
    beginnerNote: 'When few pieces are left, march your king to the centre — it is safe now and very strong.',
    quiz: [
      {
        prompt: 'You are a piece up in the endgame. What should you generally trade?',
        options: ['Pawns', 'Pieces', 'Nothing', 'Your king'],
        answer: 1,
        explanation: 'Trading pieces makes your extra piece relatively more powerful; trading pawns reduces your winning chances.',
      },
      {
        prompt: 'Where does a rook belong relative to a passed pawn?',
        options: ['In front of it', 'Behind it', 'Beside it', 'It does not matter'],
        answer: 1,
        explanation: 'Behind the pawn the rook gains activity as the pawn advances (Tarrasch\'s rule).',
      },
    ],
  },
  {
    id: 'tactics-basics',
    title: 'Tactical patterns',
    keywords: /tactic|fork|pin|skewer|discovered|double attack/i,
    summary: 'Forks, pins, skewers, discovered attacks and removing the defender win most games below master level.',
    steps: [
      { text: 'Fork: one piece attacks two targets. Knights are famous for it, but pawns and queens fork too.' },
      { text: 'Pin: a piece cannot move without exposing something more valuable behind it. A skewer is the reverse — the valuable piece is in front.' },
      { text: 'Discovered attack: move one piece out of the way to unleash another. If the moving piece also gives check, it is devastating.' },
      { text: 'Checks, captures, threats — scan for these every move, for both sides. Most blunders are missed checks or captures.' },
    ],
    beginnerNote: 'Before every move, look at every check and capture available — for you AND your opponent.',
    quiz: [
      {
        prompt: 'A rook attacks the enemy king, and behind the king on the same line stands the queen. What is this?',
        options: ['A fork', 'A pin', 'A skewer', 'Zugzwang'],
        answer: 2,
        explanation: 'The king must move, and the piece behind it is captured — a skewer.',
      },
    ],
  },
  {
    id: 'calculation',
    title: 'Candidate moves and calculation',
    keywords: /calculat|candidate|think(ing)? process|how to think|visuali/i,
    summary: 'List 2–4 candidate moves, start with forcing ones, and check your opponent\'s best reply before you move.',
    steps: [
      { text: 'Step 1: What changed after my opponent\'s last move? What does it threaten?' },
      { text: 'Step 2: List candidate moves — checks, captures and threats first, then improving moves.' },
      { text: 'Step 3: For each candidate, find the opponent\'s best reply, not the reply you hope for.' },
      { text: 'Step 4: Blunder check — before you touch a piece, ask "what does this move leave undefended?"' },
    ],
    quiz: [
      {
        prompt: 'Which candidate moves should you check first?',
        options: ['Quiet pawn moves', 'Checks, captures and threats', 'King moves', 'Rook lifts'],
        answer: 1,
        explanation: 'Forcing moves limit your opponent\'s replies, so they are both the most dangerous and the easiest to calculate.',
      },
    ],
  },
  {
    id: 'time-management',
    title: 'Time management',
    keywords: /time (trouble|management|pressure)|clock|flag/i,
    summary: 'Spend time on critical moments, play known moves quickly, and keep a reserve for the end.',
    steps: [
      { text: 'Play the opening moves you know quickly — save your clock for unfamiliar positions.' },
      { text: 'Critical moments (captures that change the structure, the transition to an endgame, an opponent\'s threat) deserve real thinking time.' },
      { text: 'In blitz, a rough budget is to keep at least a third of your time when you reach move 30.' },
      { text: 'In time trouble, simplify: trade pieces, keep the king safe, and prefer solid moves over complicated tactics.' },
    ],
    quiz: [
      {
        prompt: 'You have 20 seconds left in a complicated middlegame. What is usually best?',
        options: ['Start a long calculation', 'Look for solid, simplifying moves', 'Resign', 'Make random fast moves'],
        answer: 1,
        explanation: 'Low on time, reduce risk: safe moves and trades limit the chances of a decisive blunder.',
      },
    ],
  },
];

export function findLesson(text: string): Lesson | undefined {
  return LESSONS.find((l) => l.keywords.test(text));
}
