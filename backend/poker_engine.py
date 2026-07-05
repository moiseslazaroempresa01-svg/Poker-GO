"""
Poker Decision Engine - Local (offline) engine for Texas Hold'em decisions.
Combines preflop ranges (Sklansky/Chen adapted) with lightweight Monte Carlo
equity estimation for post-flop situations.
"""
import random
from typing import List, Optional, Dict, Tuple

RANKS = "23456789TJQKA"
SUITS = "hdcs"
RANK_VALUE = {r: i for i, r in enumerate(RANKS, start=2)}  # 2..14


def parse_card(card: str) -> Tuple[int, str]:
    """Parse 'Ah', 'Ts', '9d' -> (rank_value, suit)"""
    card = card.strip()
    if len(card) != 2:
        raise ValueError(f"Invalid card: {card}")
    r, s = card[0].upper(), card[1].lower()
    if r not in RANKS or s not in SUITS:
        raise ValueError(f"Invalid card: {card}")
    return RANK_VALUE[r], s


def full_deck() -> List[str]:
    return [r + s for r in RANKS for s in SUITS]


# -------------------- HAND EVALUATION --------------------
def rank_5(cards: List[Tuple[int, str]]) -> Tuple:
    """Rank exactly 5 cards. Higher tuple = better hand."""
    ranks = sorted([c[0] for c in cards], reverse=True)
    suits = [c[1] for c in cards]

    counts: Dict[int, int] = {}
    for r in ranks:
        counts[r] = counts.get(r, 0) + 1
    # Sort by (count desc, rank desc)
    grouped = sorted(counts.items(), key=lambda x: (-x[1], -x[0]))
    count_pattern = tuple(g[1] for g in grouped)
    ordered_ranks = tuple(g[0] for g in grouped)

    is_flush = len(set(suits)) == 1
    unique_ranks = sorted(set(ranks), reverse=True)
    is_straight = False
    top_straight = 0
    if len(unique_ranks) == 5:
        if unique_ranks[0] - unique_ranks[4] == 4:
            is_straight = True
            top_straight = unique_ranks[0]
        elif unique_ranks == [14, 5, 4, 3, 2]:  # wheel
            is_straight = True
            top_straight = 5

    if is_straight and is_flush:
        return (8, top_straight)
    if count_pattern == (4, 1):
        return (7, ordered_ranks[0], ordered_ranks[1])
    if count_pattern == (3, 2):
        return (6, ordered_ranks[0], ordered_ranks[1])
    if is_flush:
        return (5,) + tuple(ranks)
    if is_straight:
        return (4, top_straight)
    if count_pattern == (3, 1, 1):
        return (3, ordered_ranks[0]) + tuple(ordered_ranks[1:])
    if count_pattern == (2, 2, 1):
        return (2, ordered_ranks[0], ordered_ranks[1], ordered_ranks[2])
    if count_pattern == (2, 1, 1, 1):
        return (1, ordered_ranks[0]) + tuple(ordered_ranks[1:])
    return (0,) + tuple(ranks)


def best_of_7(cards7: List[Tuple[int, str]]) -> Tuple:
    from itertools import combinations
    best = None
    for combo in combinations(cards7, 5):
        rk = rank_5(list(combo))
        if best is None or rk > best:
            best = rk
    return best


# -------------------- MONTE CARLO EQUITY --------------------
def estimate_equity(
    hero_cards: List[str],
    community: List[str],
    n_opponents: int = 1,
    iterations: int = 800,
) -> Dict[str, float]:
    """Return win / tie / lose percentages via random sampling."""
    hero = [parse_card(c) for c in hero_cards]
    board = [parse_card(c) for c in community]
    known = set(hero_cards + community)
    remaining_full = [c for c in full_deck() if c not in known]

    wins = ties = losses = 0
    n_opponents = max(1, min(n_opponents, 8))

    for _ in range(iterations):
        deck = remaining_full[:]
        random.shuffle(deck)
        idx = 0

        villains = []
        for _v in range(n_opponents):
            v = [parse_card(deck[idx]), parse_card(deck[idx + 1])]
            idx += 2
            villains.append(v)

        sim_board = board[:]
        while len(sim_board) < 5:
            sim_board.append(parse_card(deck[idx]))
            idx += 1

        hero_rank = best_of_7(hero + sim_board)
        villain_best = max(best_of_7(v + sim_board) for v in villains)

        if hero_rank > villain_best:
            wins += 1
        elif hero_rank == villain_best:
            ties += 1
        else:
            losses += 1

    total = wins + ties + losses
    return {
        "win": round(wins / total * 100, 1),
        "tie": round(ties / total * 100, 1),
        "lose": round(losses / total * 100, 1),
    }


# -------------------- PREFLOP RANGES (Chen-like scoring) --------------------
def chen_score(hero_cards: List[str]) -> float:
    """Bill Chen formula for preflop hand strength (~ -1 to 20)."""
    (r1, s1), (r2, s2) = parse_card(hero_cards[0]), parse_card(hero_cards[1])
    hi, lo = max(r1, r2), min(r1, r2)
    # Base points for highest card
    base_map = {14: 10.0, 13: 8.0, 12: 7.0, 11: 6.0}
    base = base_map.get(hi, hi / 2.0)
    # Pair
    if r1 == r2:
        score = max(base * 2.0, 5.0)
    else:
        score = base
        gap = hi - lo - 1
        if gap == 0:
            score += 0
        elif gap == 1:
            score -= 1
        elif gap == 2:
            score -= 2
        elif gap == 3:
            score -= 4
        else:
            score -= 5
        # Connector bonus for small cards
        if gap <= 1 and hi < 12 and r1 != r2:
            score += 1
    if s1 == s2:
        score += 2
    return round(score, 1)


POSITIONS = ["UTG", "MP", "CO", "BTN", "SB", "BB"]
STYLE_ADJUST = {"tight": -1.5, "balanced": 0.0, "loose": 1.5}


def preflop_decision(
    hero_cards: List[str],
    position: str,
    to_call: float,
    pot: float,
    hero_stack: float,
    n_opponents: int,
    style: str = "balanced",
) -> Dict:
    """Recommend action preflop based on Chen score + position + pot odds."""
    score = chen_score(hero_cards)
    adj = STYLE_ADJUST.get(style, 0.0)
    # Thresholds by position for opening/calling
    pos_thresh = {
        "UTG": 9.0,
        "MP": 8.0,
        "CO": 7.0,
        "BTN": 6.0,
        "SB": 7.0,
        "BB": 6.5,
    }
    open_thresh = pos_thresh.get(position.upper(), 7.5) + adj
    call_thresh = open_thresh - 2.0
    raise_thresh = open_thresh + 2.0

    # Pot odds
    pot_odds = (to_call / (pot + to_call)) * 100 if (pot + to_call) > 0 else 0

    if score >= raise_thresh:
        # Strong: raise 3x BB, or 3x last raise
        bet_size = max(to_call * 3, pot * 0.75, 3.0) if to_call > 0 else max(pot * 0.75, 3.0)
        bet_size = min(bet_size, hero_stack)
        action = "RAISE" if bet_size < hero_stack * 0.5 else "ALL-IN"
        confidence = min(95, 70 + (score - raise_thresh) * 4)
        reasoning = (
            f"Mão forte (Chen {score}) na posição {position}. "
            f"Aumentar constrói o pote e protege contra draws. "
            f"Style: {style}."
        )
    elif score >= open_thresh and to_call == 0:
        bet_size = max(pot * 0.75, 3.0)
        bet_size = min(bet_size, hero_stack)
        action = "RAISE"
        confidence = min(85, 60 + (score - open_thresh) * 5)
        reasoning = (
            f"Mão jogável (Chen {score}) e sem aposta anterior — abrir para "
            f"tomar iniciativa em {position}."
        )
    elif score >= call_thresh and pot_odds < 25:
        action = "CALL"
        bet_size = to_call
        confidence = min(75, 50 + (score - call_thresh) * 6)
        reasoning = (
            f"Mão marginal (Chen {score}). Odds do pote favoráveis "
            f"({pot_odds:.1f}%). Pagar para ver o flop."
        )
    else:
        action = "FOLD"
        bet_size = 0
        confidence = min(90, 60 + (call_thresh - score) * 5)
        reasoning = (
            f"Mão fraca para {position} (Chen {score}). "
            f"Foldar economiza fichas para spots melhores."
        )

    return {
        "action": action,
        "bet_size": round(bet_size, 2),
        "confidence": round(confidence, 1),
        "reasoning": reasoning,
        "chen_score": score,
        "pot_odds": round(pot_odds, 1),
        "equity": None,
    }


def postflop_decision(
    hero_cards: List[str],
    community: List[str],
    to_call: float,
    pot: float,
    hero_stack: float,
    n_opponents: int,
    style: str = "balanced",
) -> Dict:
    """Post-flop decision using Monte Carlo equity + pot odds."""
    equity = estimate_equity(hero_cards, community, n_opponents, iterations=600)
    win_pct = equity["win"] + equity["tie"] / 2  # equity share

    pot_odds = (to_call / (pot + to_call)) * 100 if (pot + to_call) > 0 else 0
    adj = STYLE_ADJUST.get(style, 0.0) * 3  # scale for post-flop

    # Adjusted equity threshold
    effective_equity = win_pct + adj

    if effective_equity >= 70:
        bet_size = min(pot * 0.85, hero_stack)
        action = "RAISE" if bet_size < hero_stack * 0.6 else "ALL-IN"
        confidence = min(95, 60 + (win_pct - 60) * 2)
        reasoning = (
            f"Equity muito alta ({win_pct:.1f}%). Aumentar para valor e "
            f"pressionar oponentes com mãos piores."
        )
    elif effective_equity >= 55:
        if to_call == 0:
            bet_size = min(pot * 0.6, hero_stack)
            action = "RAISE"
            confidence = 70
            reasoning = (
                f"Equity favorável ({win_pct:.1f}%). Apostar por valor e "
                f"proteção contra draws."
            )
        else:
            action = "CALL"
            bet_size = to_call
            confidence = min(80, 55 + (win_pct - 50) * 2)
            reasoning = (
                f"Equity boa ({win_pct:.1f}%) para o valor da aposta. Pagar."
            )
    elif effective_equity >= pot_odds + 5:
        action = "CALL"
        bet_size = to_call
        confidence = 60
        reasoning = (
            f"Equity ({win_pct:.1f}%) supera odds do pote ({pot_odds:.1f}%). "
            f"Pagar é rentável a longo prazo."
        )
    else:
        action = "FOLD"
        bet_size = 0
        confidence = min(88, 55 + (pot_odds - win_pct))
        reasoning = (
            f"Equity insuficiente ({win_pct:.1f}%) vs odds do pote "
            f"({pot_odds:.1f}%). Foldar preserva stack."
        )

    return {
        "action": action,
        "bet_size": round(bet_size, 2),
        "confidence": round(confidence, 1),
        "reasoning": reasoning,
        "equity": equity,
        "pot_odds": round(pot_odds, 1),
        "chen_score": None,
    }


def decide(
    hero_cards: List[str],
    community: List[str],
    position: str,
    to_call: float,
    pot: float,
    hero_stack: float,
    n_opponents: int,
    style: str = "balanced",
) -> Dict:
    if not hero_cards or len(hero_cards) != 2:
        raise ValueError("hero_cards must contain exactly 2 cards")
    if community and len(community) >= 3:
        return postflop_decision(
            hero_cards, community, to_call, pot, hero_stack, n_opponents, style
        )
    return preflop_decision(
        hero_cards, position, to_call, pot, hero_stack, n_opponents, style
    )
