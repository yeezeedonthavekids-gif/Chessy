/** Morphy vs Duke of Brunswick & Count Isouard, Paris 1858 ("Opera Game"). Public domain. */
export const OPERA_GAME = `[Event "Paris Opera"]
[Site "Paris FRA"]
[Date "1858.11.02"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[ECO "C41"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

export const CLOCK_GAME = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.03.01"]
[White "alice"]
[Black "bob"]
[Result "0-1"]
[TimeControl "180+2"]
[UTCDate "2024.03.01"]
[UTCTime "12:30:00"]

1. f3 {[%clk 0:03:01]} 1... e5 {[%clk 0:03:00.5]} 2. g4 {[%clk 0:02:58]} 2... Qh4# {[%clk 0:02:55]} 0-1`;

export const UNFINISHED_GAME = `[Event "Daily"]
[White "alice"]
[Black "bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *`;

export const MULTI = `${OPERA_GAME}

${CLOCK_GAME}

[Event "Broken"]
[White "x"]
[Black "y"]
[Result "1-0"]

1. e4 e5 2. Ke3 Qh4 3. Zz9 1-0
`;
