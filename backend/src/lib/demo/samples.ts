import { LEVELS, type LevelKey } from "../levels";
import type { Card, Evidence, Explanation, FileChange, FlowGraph, LevelText, Verification } from "../types";

/**
 * The three demo commits, written by hand. They back the home page demo,
 * the "sample team" seed, and offline demos when GitHub or the model fail.
 *
 * Every text is a tuple in level order:
 * [engineer, senior dev, intern, manager, client, CMO].
 */

export const DEMO_REPO = process.env.DEMO_REPO || process.env.NEXT_PUBLIC_DEMO_REPO || "code-crunchers/rosetta-demo";

export type Six = [string, string, string, string, string, string];

export type Spec = {
  summary: Six;
  analogy: Six;
  impact: Six;
  /** Node keys, group keys and edge label keys. */
  labels: Record<string, Six>;
  walkTitle: Six;
  /** One Six per walkthrough step. */
  walk: Six[];
};

export function levelsFrom(spec: Spec): Record<LevelKey, LevelText> {
  return Object.fromEntries(
    LEVELS.map(({ key }, i) => [
      key,
      {
        summary: spec.summary[i],
        analogy: spec.analogy[i],
        impact: spec.impact[i],
        labels: Object.fromEntries(Object.entries(spec.labels).map(([k, six]) => [k, six[i]])),
        walkthrough: { title: spec.walkTitle[i], steps: spec.walk.map((six) => six[i]) },
      },
    ]),
  ) as Record<LevelKey, LevelText>;
}

const file = (path: string, additions: number, deletions: number, sha: string): FileChange => ({
  path,
  additions,
  deletions,
  url: `https://github.com/${DEMO_REPO}/blob/${sha}/${path}`,
});

/* ------------------------------------------------------------------ */
/* 1. Round-robin load balancer                                        */
/* ------------------------------------------------------------------ */

const rrSha = "a3f9c2e8d41b7f06c5e2a9d3b8f17c4e6a0d5b92";

const rrBefore: FlowGraph = {
  groups: [{ id: "gb", key: "pool" }],
  nodes: [
    { id: "b1", key: "request", kind: "start" },
    { id: "b2", key: "server_a", kind: "step", group: "gb" },
    { id: "b3", key: "server_b_idle", kind: "step", group: "gb" },
    { id: "b4", key: "server_c_idle", kind: "step", group: "gb" },
    { id: "b5", key: "response", kind: "end" },
  ],
  edges: [
    ["b1", "b2", "every_request"],
    ["b2", "b5"],
  ],
};

const rrAfter: FlowGraph = {
  groups: [{ id: "ga", key: "pool" }],
  nodes: [
    { id: "a1", key: "request", kind: "start" },
    { id: "a2", key: "move_counter", kind: "step" },
    { id: "a3", key: "pick", kind: "decision" },
    { id: "a4", key: "server_a", kind: "step", group: "ga" },
    { id: "a5", key: "server_b", kind: "step", group: "ga" },
    { id: "a6", key: "server_c", kind: "step", group: "ga" },
    { id: "a7", key: "response", kind: "end" },
  ],
  edges: [
    ["a1", "a2"],
    ["a2", "a3"],
    ["a3", "a4", "turn_0"],
    ["a3", "a5", "turn_1"],
    ["a3", "a6", "turn_2"],
    ["a4", "a7"],
    ["a5", "a7"],
    ["a6", "a7"],
  ],
};

const roundRobin: Explanation = {
  title: "Spread traffic across three servers",
  risk: "low",
  riskReason: "Only changes which server handles a request. No data or payments are touched.",
  files: ["src/balancer.js", "config/servers.json"],
  flow: { before: rrBefore, after: rrAfter },
  walkthrough: {
    steps: [
      { path: ["a1", "a2", "a3", "a4", "a7"] },
      { path: ["a1", "a2", "a3", "a5", "a7"] },
      { path: ["a1", "a2", "a3", "a6", "a7"] },
      { path: ["a1", "a2", "a3", "a4", "a7"] },
    ],
  },
  levels: levelsFrom({
    summary: [
      "Adds pickNextServer(): requests now cycle through servers[] with a modulo counter instead of always hitting servers[0].",
      "Replaces the hard-coded upstream with a round-robin picker over a 3-server pool.",
      "Requests used to go to one server. Now a small function picks the next server in a list each time, so all three share the load.",
      "Traffic is now shared by 3 servers instead of 1.",
      "Your website now runs on 3 machines sharing the work, so it stays fast when many people visit at once.",
      "The site can now take a much bigger crowd at once, so big campaign days won't slow it down.",
    ],
    analogy: [
      "A ring-buffer index over the upstream pool that wraps at servers.length.",
      "The same behaviour as an Nginx upstream block with default round-robin.",
      "Like dealing cards around a table: each player gets one in turn, then it starts again from the first.",
      "Like a supermarket opening every billing counter instead of just one.",
      "Like a restaurant adding two more cooks for the dinner rush.",
      "Like a store opening every billing counter for the Diwali sale instead of making shoppers queue at one.",
    ],
    impact: [
      "Load spreads evenly across 3 upstreams. The counter is module-level state, so it resets on restart and isn't shared across processes. There are no health checks yet, so a dead server still gets its turn.",
      "Even distribution, no sticky sessions, no health checks. Fine for stateless endpoints; watch anything that relies on in-memory session state.",
      "Read pickNextServer() in src/balancer.js. The % operator wraps the counter back to 0 after the last server. That one line is the whole idea.",
      "The site can handle sale-day spikes without slowing down. Users notice nothing, and no data or payments are affected.",
      "Your customers get the same site, but busy days like a sale are far less likely to slow it down or take it offline.",
      "Plan launches and sale-day pushes with more confidence: traffic spikes from a campaign are shared across 3 machines, and visitors see the same fast site.",
    ],
    labels: {
      pool: ["servers[] (config/servers.json)", "Upstream pool", "The 3 servers", "Server pool", "Your 3 machines", "Checkout counters"],
      request: ["HTTP request", "Incoming request", "A request comes in", "A visitor arrives", "A customer visits", "A shopper arrives"],
      move_counter: [
        "current = (current + 1) % 3",
        "Advance round-robin index",
        "Move the counter to the next server",
        "Note whose turn it is",
        "Check whose turn it is",
        "Next counter in line",
      ],
      pick: ["servers[current]", "Select upstream", "Which server's turn?", "Whose turn?", "Which machine?", "Which counter?"],
      server_a: ["servers[0]", "Upstream A", "Server A", "Server A", "Machine A", "Counter 1"],
      server_b: ["servers[1]", "Upstream B", "Server B", "Server B", "Machine B", "Counter 2"],
      server_c: ["servers[2]", "Upstream C", "Server C", "Server C", "Machine C", "Counter 3"],
      server_b_idle: ["servers[1] unused", "Upstream B idle", "Server B sits idle", "Server B unused", "Machine B idle", "Counter 2 closed"],
      server_c_idle: ["servers[2] unused", "Upstream C idle", "Server C sits idle", "Server C unused", "Machine C idle", "Counter 3 closed"],
      response: ["Response returned", "Response", "Answer sent back", "Page shown", "Page loads", "Shopper served"],
      every_request: ["always servers[0]", "always A", "every request", "everyone", "everyone", "everyone queues here"],
      turn_0: ["current = 0", "index 0", "turn 1", "1st, 4th, 7th…", "1st, 4th…", "shoppers 1, 4, 7"],
      turn_1: ["current = 1", "index 1", "turn 2", "2nd, 5th, 8th…", "2nd, 5th…", "shoppers 2, 5, 8"],
      turn_2: ["current = 2", "index 2", "turn 3", "3rd, 6th, 9th…", "3rd, 6th…", "shoppers 3, 6, 9"],
    },
    walkTitle: [
      "Trace 4 requests through pickNextServer()",
      "Four requests through the picker",
      "Follow 4 requests one by one",
      "Follow 4 visitors arriving one after another",
      "Follow 4 customers arriving one after another",
      "Follow 4 shoppers during a sale",
    ],
    walk: [
      [
        "Request 1: current goes from -1 to 0, so servers[0] (A) handles it.",
        "Request 1 is routed to upstream A (index 0).",
        "Request 1 arrives. The counter moves to 0, so Server A answers it.",
        "Visitor 1 arrives. It's Server A's turn, so A serves them.",
        "Customer 1 arrives and Machine A serves them.",
        "Shopper 1 goes to counter 1.",
      ],
      [
        "Request 2: current becomes 1, so servers[1] (B) handles it.",
        "Request 2 goes to upstream B (index 1).",
        "Request 2 moves the counter to 1, so Server B answers. Server A is free again.",
        "Visitor 2 goes to Server B, so Server A isn't overloaded.",
        "Customer 2 goes to Machine B, so nobody waits behind customer 1.",
        "Shopper 2 goes to counter 2 instead of queuing behind shopper 1.",
      ],
      [
        "Request 3: current becomes 2, so servers[2] (C) handles it.",
        "Request 3 goes to upstream C (index 2).",
        "Request 3 moves the counter to 2, so Server C answers.",
        "Visitor 3 goes to Server C. All three servers are now working.",
        "Customer 3 goes to Machine C. All three machines are sharing the work.",
        "Shopper 3 goes to counter 3. Every counter is busy, none is crowded.",
      ],
      [
        "Request 4: (2 + 1) % 3 = 0, so it wraps back to servers[0] (A).",
        "Request 4 wraps to upstream A: plain round-robin, no weighting or health checks.",
        "Request 4: the counter wraps from 2 back to 0, so Server A answers again. That loop is round-robin.",
        "Visitor 4 goes back to Server A, and the cycle repeats. Each server gets a third of the traffic.",
        "Customer 4 goes back to Machine A, and the rotation continues, so the load stays even.",
        "Shopper 4 goes back to counter 1, and the rotation repeats all day, so lines stay short.",
      ],
    ],
  }),
};

/* ------------------------------------------------------------------ */
/* 2. Caching layer                                                    */
/* ------------------------------------------------------------------ */

const cacheSha = "7c1e4b90f2a65d38e1c7b04a9f6d2e85c3b17a40";

const cacheBefore: FlowGraph = {
  nodes: [
    { id: "b1", key: "lookup", kind: "start" },
    { id: "b2", key: "db", kind: "data" },
    { id: "b3", key: "show", kind: "end" },
  ],
  edges: [
    ["b1", "b2", "every_time"],
    ["b2", "b3"],
  ],
};

const cacheAfter: FlowGraph = {
  groups: [{ id: "gc", key: "cache_box" }],
  nodes: [
    { id: "a1", key: "lookup", kind: "start" },
    { id: "a2", key: "check", kind: "decision", group: "gc" },
    { id: "a3", key: "memory", kind: "data", group: "gc" },
    { id: "a4", key: "db", kind: "data" },
    { id: "a5", key: "save", kind: "step", group: "gc" },
    { id: "a6", key: "show", kind: "end" },
  ],
  edges: [
    ["a1", "a2"],
    ["a2", "a3", "fresh"],
    ["a2", "a4", "missing_or_old"],
    ["a4", "a5"],
    ["a5", "a6"],
    ["a3", "a6"],
  ],
};

const caching: Explanation = {
  title: "Remember recent product lookups",
  risk: "low",
  riskReason: "Adds a read-only cache. Product data itself is never changed.",
  files: ["src/cache.js", "src/products.js"],
  flow: { before: cacheBefore, after: cacheAfter },
  walkthrough: {
    steps: [
      { path: ["a1", "a2", "a4", "a5", "a6"] },
      { path: ["a1", "a2", "a3", "a6"] },
      { path: ["a1", "a2", "a4", "a5", "a6"] },
    ],
  },
  levels: levelsFrom({
    summary: [
      "Wraps getProduct() in an in-memory Map cache with a 60s TTL; repeat reads skip the database query.",
      "Adds a 60-second read-through cache in front of product lookups.",
      "Before, every product view asked the database. Now the app remembers products it fetched in the last minute and answers from memory.",
      "Product pages now load from memory when they were viewed in the last minute.",
      "Your most-viewed products now appear almost instantly.",
      "Popular products now open almost instantly, which helps the pages your campaigns send people to.",
    ],
    analogy: [
      "A read-through cache: cache.get() first, fall back to db.query() and cache.set() on a miss.",
      "Memoization with expiry, like a CDN for one hot query.",
      "Like keeping today's class notes on your desk instead of walking to the library each time.",
      "Like a shopkeeper keeping bestsellers on the front shelf instead of fetching them from the godown.",
      "Like a chaiwala keeping a pot ready for regulars instead of brewing each cup from scratch.",
      "Like a showroom keeping its bestsellers on the front display instead of fetching them from the back.",
    ],
    impact: [
      "Repeat product reads drop from a database round-trip to a Map lookup. Entries can be up to 60s stale, the cache is per-process, and nothing invalidates it when a product is updated.",
      "A big win on popular products. Known gaps: no invalidation on write, an unbounded Map, and a separate cache per instance.",
      "See src/cache.js: a Map stores each product with the time it was saved. If the entry is older than 60 seconds, the app asks the database again.",
      "Popular products open much faster and the database does less work. A price change can take up to a minute to show.",
      "Shoppers wait less on popular items, which usually means fewer people leave. Price updates can take up to a minute to appear.",
      "Faster product pages usually mean fewer shoppers drop off. One catch for promotions: a price change can take up to a minute to appear.",
    ],
    labels: {
      cache_box: ["src/cache.js (Map)", "Read-through cache", "The new memory layer", "New: short-term memory", "New: quick memory", "New: front display"],
      lookup: ["getProduct(id)", "Product read", "Ask for product 42", "Shopper opens a product", "Shopper views an item", "Shopper opens a product"],
      check: [
        "cache.get(id) && age < 60s?",
        "Cache hit and fresh?",
        "In memory, under 60 s old?",
        "Seen in the last minute?",
        "Viewed recently?",
        "Already on display?",
      ],
      memory: ["return cached row", "Serve from cache", "Answer from memory", "Instant answer", "Shown instantly", "Shown straight away"],
      db: ["db.query(…)", "Database query", "Read the database", "Fetch from storage", "Look it up", "Fetch from the back"],
      save: ["cache.set(id, row, now)", "Populate cache", "Save it with the time", "Remember it for a minute", "Keep it handy", "Put it on display"],
      show: ["Response", "Response", "Product page shown", "Page shown", "Page loads", "Shopper sees it"],
      every_time: ["every call", "every read", "every time", "every visit", "every visit", "every visit"],
      fresh: ["hit", "fresh hit", "yes", "yes", "yes", "yes"],
      missing_or_old: ["miss or expired", "miss / stale", "no, or too old", "no", "no", "no"],
    },
    walkTitle: [
      "Trace three reads of product 42",
      "Three reads of one product",
      "Follow product 42 being opened three times",
      "One product, opened three times",
      "One product, viewed three times",
      "One product during a campaign",
    ],
    walk: [
      [
        "t = 0 s: cache.get(42) misses, db.query runs, and the row is stored with savedAt = now.",
        "First read misses, hits the database, then populates the cache.",
        "First view: product 42 isn't in memory, so the app reads the database and saves a copy with the time.",
        "The first shopper opens the product. Nothing is remembered yet, so it's fetched from storage and kept for a minute.",
        "The first customer opens the item. It's looked up as usual, then kept handy.",
        "The first shopper from your campaign opens the product. It's fetched once, then put on the front display.",
      ],
      [
        "t = 10 s: hit, age 10 s < 60 s, so the Map returns it without touching the database.",
        "A read 10 s later is a fresh hit: no database round-trip.",
        "10 seconds later someone opens it again. It's in memory and fresh, so it shows instantly.",
        "A second shopper 10 seconds later gets it instantly, and the database isn't touched.",
        "The next customer gets it instantly.",
        "Every shopper in the next minute sees it instantly. This is where campaign traffic gets faster.",
      ],
      [
        "t = 70 s: entry age 70 s ≥ 60 s, treated as a miss; db.query runs and refreshes the entry.",
        "After 60 s the entry is stale, so the next read refreshes it from the database.",
        "70 seconds later the copy is too old, so the app reads the database again and saves a new copy.",
        "After a minute the copy expires and is fetched fresh. That's why a price change can take up to a minute to show.",
        "After a minute it's looked up fresh again, so changes like a new price appear within a minute.",
        "After a minute it's refreshed, so a promo price you change shows up within about a minute.",
      ],
    ],
  }),
};

/* ------------------------------------------------------------------ */
/* 3. Retry with backoff                                               */
/* ------------------------------------------------------------------ */

const retrySha = "e52d08a7b3c94f16d0e8a2b5c7f39d41a6e0b8c3";

const retryBefore: FlowGraph = {
  nodes: [
    { id: "b1", key: "pay", kind: "start" },
    { id: "b2", key: "call_bank", kind: "step" },
    { id: "b3", key: "worked", kind: "decision" },
    { id: "b4", key: "done", kind: "end" },
    { id: "b5", key: "failed", kind: "end" },
  ],
  edges: [
    ["b1", "b2"],
    ["b2", "b3"],
    ["b3", "b4", "yes"],
    ["b3", "b5", "no"],
  ],
};

const retryAfter: FlowGraph = {
  groups: [{ id: "gr", key: "retry_box" }],
  nodes: [
    { id: "a1", key: "pay", kind: "start" },
    { id: "a2", key: "call_bank", kind: "step" },
    { id: "a3", key: "worked", kind: "decision" },
    { id: "a4", key: "done", kind: "end" },
    { id: "a5", key: "temporary", kind: "decision", group: "gr" },
    { id: "a6", key: "wait", kind: "step", group: "gr" },
    { id: "a7", key: "failed", kind: "end" },
  ],
  edges: [
    ["a1", "a2"],
    ["a2", "a3"],
    ["a3", "a4", "yes"],
    ["a3", "a5", "no"],
    ["a5", "a6", "yes"],
    ["a6", "a2", "try_again"],
    ["a5", "a7", "no"],
  ],
};

const retry: Explanation = {
  title: "Retry payments that fail for a moment",
  risk: "medium",
  riskReason: "Touches payment logic. Retries are capped at 3 and only happen on network errors.",
  files: ["src/lib/retry.js", "src/payments/charge.js"],
  flow: { before: retryBefore, after: retryAfter },
  walkthrough: {
    steps: [
      { path: ["a1", "a2", "a3", "a5", "a6", "a2", "a3", "a4"] },
      { path: ["a1", "a2", "a3", "a5", "a7"] },
      { path: ["a1", "a2", "a3", "a5", "a6", "a2", "a3", "a5", "a7"] },
    ],
  },
  levels: levelsFrom({
    summary: [
      "Wraps gateway.charge() in withRetry(): up to 3 attempts with exponential backoff (200, 400, 800ms) on network and 5xx errors only.",
      "Adds capped exponential-backoff retries around payment charges.",
      "When a payment request fails because of a network glitch, the code now waits a little and tries again, up to 3 times.",
      "Payments that fail because of a brief network problem now retry automatically, up to 3 times.",
      "Fewer of your customers' payments will fail because of a temporary glitch.",
      "Fewer customers lose their order at checkout when the payment line hiccups for a moment.",
    ],
    analogy: [
      "Standard retry with backoff; card declines (4xx) short-circuit and are never retried.",
      "The same pattern as the AWS SDK retry policy, limited to retryable errors.",
      "Like redialling a friend when the call drops, waiting a bit longer before each try.",
      "Like a cashier re-swiping a card when the machine loses signal, instead of turning the customer away.",
      "Like a delivery partner ringing the bell again after a minute instead of leaving with the parcel.",
      "Like a cashier re-swiping a card when the machine loses signal, instead of sending the customer away.",
    ],
    impact: [
      "Fewer failed charges from transient gateway errors. Double-charge safety depends on the idempotency key: this commit passes order.id as Idempotency-Key, which the gateway must honour.",
      "Recovers from flaky gateway calls. Review the idempotency key handling carefully; it is the only thing preventing duplicate charges.",
      "Read src/lib/retry.js. The wait doubles on each attempt so a struggling bank isn't flooded. Real declines, like a wrong card number, are not retried.",
      "Fewer lost sales from temporary errors. Medium risk because it touches payments, so it is worth a careful review before release.",
      "More completed orders on busy or unstable days. The change is built so the same order is not charged twice.",
      "More campaign traffic turns into completed orders, and customers are never charged twice for the same order.",
    ],
    labels: {
      retry_box: ["withRetry() (src/lib/retry.js)", "Retry policy", "The new retry loop", "New: automatic retry", "New: try again", "New: second chance"],
      pay: ["chargeCard(order)", "Charge request", "Start a payment", "Customer pays", "Your customer pays", "Customer checks out"],
      call_bank: ["gateway.charge(order.id)", "Gateway call", "Ask the bank", "Bank is contacted", "Bank checks it", "Bank checks the card"],
      worked: ["2xx?", "Succeeded?", "Did it work?", "Approved?", "Approved?", "Approved?"],
      done: ["resolve(charge)", "Return charge", "Payment done", "Paid", "Sale completes", "Order complete"],
      temporary: [
        "isRetryable(err) && attempt < 3",
        "Retryable and attempts left?",
        "Network glitch, and tries left?",
        "Temporary problem?",
        "Just a hiccup?",
        "Brief hiccup?",
      ],
      wait: ["sleep(200 · 2ⁿ ms)", "Exponential backoff", "Wait 200, 400, 800 ms", "Wait a moment", "Wait a moment", "Pause a second"],
      failed: ["throw err", "Surface error", "Show the error", "Clear error shown", "Sale lost", "Order lost"],
      yes: ["yes", "yes", "yes", "yes", "yes", "yes"],
      no: ["no", "no", "no", "no", "no", "no"],
      try_again: ["attempt++", "retry", "try again", "try again", "try again", "try again"],
    },
    walkTitle: [
      "Trace three gateway responses",
      "Three gateway outcomes",
      "Follow three payments",
      "Three customers paying",
      "Three customers paying",
      "Three shoppers at checkout",
    ],
    walk: [
      [
        "Attempt 1 times out (network error, retryable). sleep(200), attempt 2 returns 200: resolved.",
        "Transient timeout, one backoff, success on the second attempt.",
        "Payment 1: the bank times out once. The code waits 200 ms, tries again, and it works.",
        "Customer 1's payment hits a brief network blip. It quietly retries and goes through. Before this change, that was a lost sale.",
        "Customer 1's payment hiccups, is retried a moment later, and completes.",
        "Shopper 1 hits a blip at checkout. The new retry saves the order without them noticing.",
      ],
      [
        "Gateway returns 402 card_declined: isRetryable is false, so it throws immediately.",
        "A 4xx decline short-circuits: no retry.",
        "Payment 2: the card is declined. That's not a glitch, so there's no retry and the error shows right away.",
        "Customer 2's card is declined. That's a real problem, so it isn't retried; they see a clear message at once.",
        "Customer 2's card is declined, so they're told straight away instead of waiting.",
        "Shopper 2's card is declined, so they're told at once and can use another card.",
      ],
      [
        "Bank down: attempts 1–3 all 503, waits 200 then 400 ms, then the last error is thrown.",
        "Persistent 5xx: three attempts, then the error surfaces.",
        "Payment 3: the bank is down. The code tries 3 times, waiting longer each time, then shows the error.",
        "Customer 3 pays while the bank is down. After 3 quick tries they see an error, so nobody waits forever.",
        "Customer 3 pays during a bank outage. After 3 tries they're told, and are never charged twice.",
        "Shopper 3 pays during a bank outage. After 3 tries they're told clearly, and never charged twice.",
      ],
    ],
  }),
};

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Evidence for the samples: the lines behind each step                */
/* ------------------------------------------------------------------ */

/** "+added", "-removed", " unchanged", one string per line. */
const ev = (sha: string, path: string, line: number, lines: string[]): Evidence => ({
  file: path,
  url: `https://github.com/${DEMO_REPO}/blob/${sha}/${path}#L${line}`,
  line,
  lines: lines.map((l) => ({ kind: l[0] as "+" | "-" | " ", text: l.slice(1) })),
});

const sampleCheck = (): Verification => ({
  score: 100,
  confidence: "high",
  checkedBy: "sample",
  issues: [],
  retried: false,
  needsReview: false,
  checkedAt: "2026-01-01T00:00:00.000Z",
});

roundRobin.verification = sampleCheck();
roundRobin.evidence = {
  move_counter: ev(rrSha, "src/balancer.js", 6, [
    " let current = -1;",
    "+export function pickNextServer() {",
    "+  current = (current + 1) % servers.length;",
    "+  return servers[current];",
    "+}",
  ]),
  pick: ev(rrSha, "src/balancer.js", 13, [
    " app.use(async (req, res) => {",
    "-  const upstream = servers[0];",
    "+  const upstream = pickNextServer();",
    "   return proxy(req, res, upstream);",
  ]),
  server_a: ev(rrSha, "config/servers.json", 2, [" {", '   "servers": [', '     "http://10.0.0.11:8080",', '+    "http://10.0.0.12:8080",', '+    "http://10.0.0.13:8080"']),
  server_b: ev(rrSha, "config/servers.json", 4, ['     "http://10.0.0.11:8080",', '+    "http://10.0.0.12:8080",', '+    "http://10.0.0.13:8080"']),
  server_c: ev(rrSha, "config/servers.json", 5, ['+    "http://10.0.0.12:8080",', '+    "http://10.0.0.13:8080"', "   ]"]),
  server_b_idle: ev(rrSha, "src/balancer.js", 14, ["-  const upstream = servers[0];"]),
};

caching.verification = sampleCheck();
caching.evidence = {
  check: ev(cacheSha, "src/products.js", 8, [
    " export async function getProduct(id) {",
    "+  const hit = cache.get(id);",
    "+  if (hit && Date.now() - hit.savedAt < TTL_MS) return hit.row;",
  ]),
  memory: ev(cacheSha, "src/products.js", 9, ["+  if (hit && Date.now() - hit.savedAt < TTL_MS) return hit.row;"]),
  db: ev(cacheSha, "src/products.js", 10, ['   const row = await db.query("SELECT * FROM products WHERE id = $1", [id]);']),
  save: ev(cacheSha, "src/products.js", 11, ["+  cache.set(id, { row, savedAt: Date.now() });", "   return row;", " }"]),
  cache_box: ev(cacheSha, "src/cache.js", 1, ["+// Short-lived, per-process memory for hot product reads.", "+export const TTL_MS = 60_000;", "+export const cache = new Map();"]),
};

retry.verification = sampleCheck();
retry.evidence = {
  call_bank: ev(retrySha, "src/payments/charge.js", 12, [
    "-  return gateway.charge(order.total, card);",
    "+  return withRetry(() =>",
    "+    gateway.charge(order.total, card, { idempotencyKey: order.id }),",
    "+  );",
  ]),
  temporary: ev(retrySha, "src/lib/retry.js", 9, [
    "     } catch (err) {",
    "+      const temporary = err.code === \"ECONNRESET\" || err.status >= 500;",
    "+      if (!temporary || attempt === 3) throw err;",
  ]),
  wait: ev(retrySha, "src/lib/retry.js", 11, ["+      await sleep(200 * 2 ** (attempt - 1)); // 200, 400, 800 ms", "     }"]),
  retry_box: ev(retrySha, "src/lib/retry.js", 3, ["+export async function withRetry(fn) {", "+  for (let attempt = 1; attempt <= 3; attempt++) {", "+    try {", "+      return await fn();"]),
  failed: ev(retrySha, "src/lib/retry.js", 10, ["+      if (!temporary || attempt === 3) throw err;"]),
};

export type Sample = {
  key: "round-robin" | "caching" | "retry";
  name: string;
  reading: string;
  sha: string;
  url: string;
  findings: string[];
  /** Offline Ask Why answers per node key: technical readers and everyone else. */
  notes: Record<string, { tech: string; plain: string }>;
  card: Omit<Card, "committedAt" | "status" | "approvedBy">;
};

const AUTHOR = { name: "Arjun Mehta", login: "arjun-mehta" };

export const SAMPLES: Sample[] = [
  {
    key: "round-robin",
    name: "Round-robin",
    reading: "round-robin balancer",
    sha: rrSha,
    url: `https://github.com/${DEMO_REPO}/commit/${rrSha}`,
    findings: ["Found 2 changed files", "New function: `pickNextServer()`", "`servers` list now rotates"],
    notes: {
      move_counter: {
        tech: "pickNextServer() increments a module-level counter modulo servers.length, so selection cycles 0, 1, 2, 0 and so on.",
        plain: "Each new visitor is sent to the next server in line, then it starts again from the first. That is what spreads the work.",
      },
      pick: {
        tech: "servers[current] is returned; with 3 entries in config/servers.json the index is always 0, 1 or 2.",
        plain: "The server whose turn it is takes the visitor. Nobody chooses by hand; it just takes turns.",
      },
      pool: {
        tech: "config/servers.json now lists 3 upstreams. Adding a 4th is a config change; the picker adapts because it reads servers.length.",
        plain: "There are now three servers doing the work instead of one, and more can be added later without new code.",
      },
    },
    card: {
      id: "demo-round-robin",
      repo: DEMO_REPO,
      ref: { kind: "commit", sha: rrSha },
      url: `https://github.com/${DEMO_REPO}/commit/${rrSha}`,
      author: AUTHOR,
      files: [file("src/balancer.js", 18, 4, rrSha), file("config/servers.json", 5, 1, rrSha)],
      explanation: roundRobin,
    },
  },
  {
    key: "caching",
    name: "Caching",
    reading: "product caching",
    sha: cacheSha,
    url: `https://github.com/${DEMO_REPO}/commit/${cacheSha}`,
    findings: ["Found 2 changed files", "New file: `src/cache.js`", "`getProduct()` now checks memory first"],
    notes: {
      check: {
        tech: "cache.get(id) returns the entry only if Date.now() - savedAt < 60_000; anything older is treated as a miss.",
        plain: "The app first checks whether it has seen this product in the last minute.",
      },
      memory: {
        tech: "A hit returns the cached row from a Map without touching the database. Entries are per-process and unbounded.",
        plain: "If it has, the product shows up straight away without waiting on storage.",
      },
      save: {
        tech: "cache.set(id, row) stores { row, savedAt: Date.now() }; nothing evicts entries, they only expire on read.",
        plain: "After fetching a product, the app keeps a copy for one minute.",
      },
    },
    card: {
      id: "demo-caching",
      repo: DEMO_REPO,
      ref: { kind: "commit", sha: cacheSha },
      url: `https://github.com/${DEMO_REPO}/commit/${cacheSha}`,
      author: { name: "Priya Nair", login: "priya-nair" },
      files: [file("src/cache.js", 41, 0, cacheSha), file("src/products.js", 22, 3, cacheSha)],
      explanation: caching,
    },
  },
  {
    key: "retry",
    name: "Retry fix",
    reading: "payment retries",
    sha: retrySha,
    url: `https://github.com/${DEMO_REPO}/commit/${retrySha}`,
    findings: ["Found 2 changed files", "New function: `withRetry()`", "Touches payment code in `src/payments/charge.js`"],
    notes: {
      temporary: {
        tech: "isRetryable(err) is true only for network errors and 5xx responses. 4xx declines are rethrown immediately.",
        plain: "Only temporary problems are retried. A real decline, like not enough money, is not.",
      },
      wait: {
        tech: "The delay is 200 × 2ⁿ ms (200, 400, 800), capped at 3 attempts in total.",
        plain: "It waits a moment before trying again, a little longer each time, and tries at most 3 times.",
      },
      call_bank: {
        tech: "gateway.charge() receives order.id as the Idempotency-Key header, so retries can't create a second charge.",
        plain: "Each order carries the same reference on every try, so the bank never charges it twice.",
      },
    },
    card: {
      id: "demo-retry",
      repo: DEMO_REPO,
      ref: { kind: "commit", sha: retrySha },
      url: `https://github.com/${DEMO_REPO}/commit/${retrySha}`,
      author: { name: "Rahul Verma", login: "rahul-verma" },
      files: [file("src/lib/retry.js", 34, 0, retrySha), file("src/payments/charge.js", 27, 6, retrySha)],
      explanation: retry,
    },
  },
];

export const sampleByCardId = (id: string) => SAMPLES.find((s) => s.card.id === id);

export function sampleByLink(owner: string, repo: string, ref: string) {
  const fullRepo = `${owner}/${repo}`.toLowerCase();
  return SAMPLES.find((s) => s.card.repo.toLowerCase() === fullRepo && s.sha.startsWith(ref.toLowerCase()));
}

/* ------------------------------------------------------------------ */
/* The sample team ("Add sample team" on an empty workspace)           */
/* ------------------------------------------------------------------ */

export const DEMO_TEAM = [
  { key: "arjun", name: "Arjun Mehta", role: "engineer", title: "Backend engineer", githubLogin: "arjun-mehta" },
  { key: "priya", name: "Priya Nair", role: "senior", title: "Senior developer", githubLogin: "priya-nair" },
  { key: "rahul", name: "Rahul Verma", role: "intern", title: "Engineering intern", githubLogin: "rahul-verma" },
] as const;

/** Engineers' comments, attached to the sample cards. */
export const DEMO_COMMENTS: { by: (typeof DEMO_TEAM)[number]["key"]; sample: Sample["key"]; text: string; levels: Six }[] = [
  {
    by: "arjun",
    sample: "round-robin",
    text: "Health checks aren't in yet. If one upstream dies it still gets every 3rd request; follow-up PR next sprint.",
    levels: [
      "Health checks aren't in yet. If one upstream dies it still gets every 3rd request; follow-up PR next sprint.",
      "No health checks yet: a dead upstream still receives a third of traffic. Follow-up next sprint.",
      "Arjun notes the code doesn't check whether a server is down yet, so a broken server would still get its turn. He's fixing that next sprint.",
      "One known gap: if a server goes down, a third of visitors would still be sent to it. Arjun plans to fix this next sprint.",
      "One gap remains: if one machine fails, some visitors could see errors. A fix is planned for the next sprint.",
      "If one machine fails during a big campaign, some shoppers could see errors. Arjun's fix is planned for next sprint, so avoid scheduling a mega sale before then.",
    ],
  },
  {
    by: "priya",
    sample: "caching",
    text: "Cache is per-instance and has no invalidation on write. Fine for product reads, but don't reuse it for prices in checkout.",
    levels: [
      "Cache is per-instance and has no invalidation on write. Fine for product reads, but don't reuse it for prices in checkout.",
      "Per-instance cache without write invalidation: OK for catalogue reads, not for checkout pricing.",
      "Priya warns the saved copies can be up to a minute old, so they're fine for showing products but shouldn't be used to charge prices at checkout.",
      "Safe for product pages. Prices at checkout still come straight from the database, so customers are always charged the right amount.",
      "Product pages are faster; checkout prices are always exact.",
      "Product pages load faster, and checkout always charges the live price, so flash-sale prices are safe at payment.",
    ],
  },
  {
    by: "rahul",
    sample: "retry",
    text: "Added withRetry with exponential backoff. Not 100% sure the gateway honours Idempotency-Key in sandbox, testing tomorrow.",
    levels: [
      "Added withRetry with exponential backoff. Not 100% sure the gateway honours Idempotency-Key in sandbox, testing tomorrow.",
      "Backoff retries added; idempotency in the gateway sandbox still unverified (testing tomorrow).",
      "Rahul added the retry loop, but still needs to confirm the bank's test system ignores duplicate tries. He's testing that tomorrow.",
      "Rahul still has to confirm customers can't be charged twice on a retry. He's testing it tomorrow; hold the release until then.",
      "One safety check is pending: confirming no double charges. It's being tested tomorrow.",
      "Before promoting faster checkout, wait one day: Rahul is confirming tomorrow that no shopper can be charged twice.",
    ],
  },
];
