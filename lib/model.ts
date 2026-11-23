// Token launch radar — the value model and board builder.
//
// The model in one paragraph: a pre-token protocol is priced the way the
// market already prices its tokenised peers. For every category we take the
// median market-cap / TVL multiple of the protocols in that category whose
// token already trades in the same snapshot, and apply it to the protocol's
// own TVL. Two adjustments follow, both from the snapshot's own figures: a
// momentum factor from the seven-day TVL change (clamped, so one hot week
// cannot dominate), and a maturity factor that grows the longer a protocol
// has run without a token (a launch, when it comes, prices a longer record).
// No protocol name is ever special-cased: one function scores every row.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  peer_multiple: number;
  growth_mult: number;
  maturity_mult: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  scanned: number;
  model: {
    summary: string;
    global_multiple: number;
    growth_clamp: number;
    growth_weight: number;
    maturity_cap_days: number;
    maturity_max: number;
  };
  rows: RadarRow[];
}

/** The model's constants, stated once so the dashboard can print them. */
export const MODEL = {
  minPeers: 3,
  growthClamp: 0.3,
  growthWeight: 1.5,
  maturityCapDays: 720,
  maturityMax: 0.25,
  impliedCap: 20_000_000_000,
};

/** Categories that are a wrapped, staked, bridged or custodial product of
 *  somebody else's asset: not a launch candidate of their own. Mirrors the
 *  exclusions the house's watchlist rule names, applied here to the rows a
 *  board adds below the floor. */
const DERIVATIVE_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V|v)\d+(\.\d+)?$|\s\d+\.\d+$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** True when the snapshot records no token for the protocol. The wording
 *  matters: DefiLlama's record is not proof a token does not exist. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** True when a pre-token protocol reads as a derivative of a token that
 *  already trades (the house's watchlist exclusions, reused as a screen). */
export function isDerivativeProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name === x || p.name.startsWith(`${x} `));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median mcap/TVL multiple of the tokenised protocols of one category,
 *  and the global median across every tokenised protocol in the snapshot. */
export function peerMultiples(snapshot: Snapshot): { byCategory: Map<string, number>; global: number } {
  const ratios = (list: SnapshotProtocol[]) =>
    list
      .filter((p) => p.mcap_usd !== null && p.tvl_usd > 0)
      .map((p) => p.mcap_usd! / p.tvl_usd)
      .filter((r) => r > 0 && Number.isFinite(r));
  const global = median(ratios(snapshot.protocols));
  const byCategory = new Map<string, number>();
  const groups = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols) {
    if (p.category === null) continue;
    const list = groups.get(p.category) ?? [];
    list.push(p);
    groups.set(p.category, list);
  }
  for (const [category, list] of groups) {
    const r = ratios(list);
    if (r.length >= MODEL.minPeers) byCategory.set(category, median(r));
  }
  return { byCategory, global };
}

/** Whole days between the day DefiLlama began tracking a protocol and the
 *  snapshot's own date; null when either date is missing. */
export function ageDays(p: SnapshotProtocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const start = Date.parse(`${p.listed_at}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export interface Scored {
  implied: number;
  peerMultiple: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
}

/** The one scoring function every row passes through. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  peers: { byCategory: Map<string, number>; global: number },
): Scored {
  const peerMultiple =
    p.category !== null && peers.byCategory.has(p.category) ? peers.byCategory.get(p.category)! : peers.global;
  const change = p.change_7d === null ? 0 : Math.max(-MODEL.growthClamp, Math.min(MODEL.growthClamp, p.change_7d));
  const growthMult = 1 + MODEL.growthWeight * change;
  const age = ageDays(p, asOf);
  const maturityMult = age === null ? 1 : 1 + MODEL.maturityMax * Math.min(age / MODEL.maturityCapDays, 1);
  const raw = p.tvl_usd * peerMultiple * growthMult * maturityMult;
  const implied = Math.max(1, Math.min(MODEL.impliedCap, Math.round(raw)));
  return { implied, peerMultiple, growthMult, maturityMult, age };
}

/** The gas a round trip costs, in words, from the row's first chain. */
function gasNote(chains: string[]): string {
  const first = chains[0] ?? 'its main chain';
  if (/ethereum/i.test(first)) return 'budget $5–25 of ETH for gas per transaction on Ethereum mainnet';
  if (/solana/i.test(first)) return 'budget under $0.10 of SOL for fees per transaction on Solana';
  if (/bitcoin/i.test(first)) return 'budget $1–10 of BTC in network fees per transaction';
  return `budget $0.10–2 of gas per transaction on ${first}`;
}

/** A position size that scales with the protocol's own TVL, in words. */
function sizeNote(tvl: number): string {
  if (tvl >= 500_000_000) return 'Start with $500–2,000 of capital; at this TVL the position can grow to $10,000 without moving the pool.';
  if (tvl >= 100_000_000) return 'Start with $250–1,000 of capital; size up only after two clean weeks of withdrawals.';
  if (tvl >= 25_000_000) return 'Start with $100–500 of capital; small TVL means thin exits, so keep the position easy to unwind.';
  return 'Start with $50–250 of capital; this is an early, thin market and the position is an option, not an investment.';
}

/** The core action a farmer repeats, by category family. */
function coreAction(category: string | null): { verb: string; detail: string } {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('swap'))
    return { verb: 'Provide liquidity and trade', detail: 'add liquidity to the deepest pair and route a few real swaps a week through it' };
  if (c.includes('lending') || c.includes('cdp'))
    return { verb: 'Lend and borrow', detail: 'supply a blue-chip asset, borrow at most 40% against it and repay on a weekly cycle' };
  if (c.includes('derivative') || c.includes('perp') || c.includes('option'))
    return { verb: 'Trade small, trade often', detail: 'open small hedged positions two or three times a week and keep every position under 5% of your margin' };
  if (c.includes('yield') || c.includes('aggregator') || c.includes('curator') || c.includes('allocator'))
    return { verb: 'Deposit into the flagship vault', detail: 'hold the deposit through full reward epochs instead of rotating for headline APY' };
  if (c.includes('rwa'))
    return { verb: 'Onboard and hold the asset', detail: 'complete the KYC the asset requires once, buy a first position and hold it across reporting periods' };
  if (c.includes('launchpad'))
    return { verb: 'Join launches early', detail: 'register for each new launch in its first day and complete the participation steps in full' };
  return { verb: 'Use the core product', detail: 'make the product part of a weekly routine, with real funds and real transactions, not test amounts' };
}

/** Five concrete farm steps for one protocol, each with a cost and a clock. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const action = coreAction(p.category);
  const gas = gasNote(p.chains);
  const chainList = p.chains.length > 0 ? p.chains.join(', ') : 'its chain';  const ageLine =
    age === null
      ? 'Its tracking start is unrecorded, so treat the record as young: verify the contracts and the team before sizing up.'
      : age >= 365
        ? `It has run ${Math.floor(age / 30)} months with no token recorded: a long record, so consistency now beats intensity.`
        : `It has run about ${Math.max(1, Math.round(age / 30))} months with no token recorded: early enough that steady activity still stands out.`;
  return [
    `Open ${p.name} (it runs on ${chainList}) and connect a fresh wallet you use only for farming; setup takes about 10 minutes and ${gas}.`,
    `${action.verb}: ${action.detail}. ${sizeNote(p.tvl_usd)}`,
    `Repeat the core action on a weekly rhythm for at least 8 weeks; 10 minutes a week, and ${gas} each visit. One-off bursts read as farming, steady use reads as a user.`,
    `Take part beyond the money: vote in governance or feedback calls when they open, and keep records of your positions; most weeks this costs nothing and under 15 minutes.`,
    `${ageLine} Recheck this board monthly: if a token, points program or snapshot is announced, stop adding and follow the claim instructions within the first week.`,
  ];
}

/** Build the ranked board and the dashboard's data from one snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const peers = peerMultiples(snapshot);
  const watch = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(
    (p) => recordsNoToken(p) && (watch.has(p.slug) || !isDerivativeProduct(p)),
  );
  const scored = candidates.map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, peers) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : 1));
  const rows: RadarRow[] = scored.map(({ p, s }, i) => ({
    slug: p.slug,
    name: p.name,
    rank: i + 1,
    implied_value_usd: s.implied,
    farm_steps: farmSteps(p, s.age),
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    age_days: s.age,
    watchlist: watch.has(p.slug),
    peer_multiple: Math.round(s.peerMultiple * 1000) / 1000,
    growth_mult: Math.round(s.growthMult * 1000) / 1000,
    maturity_mult: Math.round(s.maturityMult * 1000) / 1000,
  }));
  const board: BoardRow[] = rows.map(({ slug, name, rank, implied_value_usd, farm_steps }) => ({
    slug,
    name,
    rank,
    implied_value_usd,
    farm_steps,
  }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    scanned: snapshot.protocols.length,
    model: {
      summary:
        'Implied value = TVL x the median market-cap/TVL multiple of tokenised peers in the same category, ' +
        'adjusted by seven-day TVL momentum (clamped at +/-30%, weight 1.5) and by a maturity factor of up to ' +
        '+25% for two tokenless years. Every figure comes from the sealed snapshot; no name is special-cased.',
      global_multiple: Math.round(peers.global * 1000) / 1000,
      growth_clamp: MODEL.growthClamp,
      growth_weight: MODEL.growthWeight,
      maturity_cap_days: MODEL.maturityCapDays,
      maturity_max: MODEL.maturityMax,
    },
    rows,
  };
  return { board, radar };
}

/** Parse and shape-check a snapshot file's text. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

/** Why a board is not one the gate will take, or null when it is valid. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (!slugs.has(r.slug)) return `row ${i + 1} names invented slug ${r.slug}`;
    if (seen.has(r.slug)) return `slug ${r.slug} appears twice`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `row ${i + 1} carries rank ${r.rank}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd)
      return `row ${i + 1} outranks row ${i} on implied value`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12)
      return `${r.slug} has ${r.farm_steps.length} farm steps, outside 3..12`;
    for (const step of r.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `${r.slug} has a farm step of ${len} characters, outside 20..600`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd)
    return 'every row shares one implied value: not a ranking';
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `watchlist slug ${slug} is missing`;
  return null;
}

/** The dashboard's data as a script the page loads: window.RADAR. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
