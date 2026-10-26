/** Pure helpers for the UCI protocol spoken by Stockfish. */

export interface EngineScore {
  /** Centipawns from the side-to-move's perspective (absent for mate scores). */
  cp?: number;
  /** Moves to mate from the side-to-move's perspective; negative = being mated. */
  mate?: number;
}

export interface EngineLine extends EngineScore {
  multipv: number;
  depth: number;
  seldepth?: number;
  nodes?: number;
  /** Principal variation in UCI notation. */
  pv: string[];
}

export interface InfoLine extends EngineLine {
  bound?: 'lower' | 'upper';
}

/** Parses an `info ... score ... pv ...` line. Returns null for lines without a scored PV. */
export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info ')) return null;
  const tokens = line.trim().split(/\s+/);
  const out: Partial<InfoLine> & { pv?: string[] } = { multipv: 1 };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case 'depth':
        out.depth = Number(tokens[++i]);
        break;
      case 'seldepth':
        out.seldepth = Number(tokens[++i]);
        break;
      case 'multipv':
        out.multipv = Number(tokens[++i]);
        break;
      case 'nodes':
        out.nodes = Number(tokens[++i]);
        break;
      case 'score': {
        const kind = tokens[++i];
        const value = Number(tokens[++i]);
        if (kind === 'cp') out.cp = value;
        else if (kind === 'mate') out.mate = value;
        if (tokens[i + 1] === 'lowerbound' || tokens[i + 1] === 'upperbound') {
          out.bound = tokens[++i] === 'lowerbound' ? 'lower' : 'upper';
        }
        break;
      }
      case 'pv':
        out.pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
      case 'string':
        return null;
      default:
        break;
    }
  }
  if (out.depth === undefined || (out.cp === undefined && out.mate === undefined) || !out.pv?.length) {
    return null;
  }
  return out as InfoLine;
}

/** Parses `bestmove e2e4 ponder e7e5`. Returns null for anything else; "(none)" maps to null move. */
export function parseBestMove(line: string): { move: string | null; ponder?: string } | null {
  if (!line.startsWith('bestmove')) return null;
  const [, move, , ponder] = line.trim().split(/\s+/);
  return { move: !move || move === '(none)' ? null : move, ponder };
}

/** Converts a side-to-move score into White's perspective. */
export function toWhitePov(score: EngineScore, sideToMove: 'w' | 'b'): EngineScore {
  if (sideToMove === 'w') return { ...score };
  return {
    cp: score.cp === undefined ? undefined : -score.cp,
    mate: score.mate === undefined ? undefined : -score.mate,
  };
}

/** Human-readable score from White's perspective, e.g. "+1.24" or "#-3". */
export function formatScore(score: EngineScore): string {
  if (score.mate !== undefined) {
    if (score.mate === 0) return '#';
    return score.mate > 0 ? `#${score.mate}` : `#-${Math.abs(score.mate)}`;
  }
  const cp = score.cp ?? 0;
  const v = (cp / 100).toFixed(2);
  return cp > 0 ? `+${v}` : v === '-0.00' ? '0.00' : v;
}
