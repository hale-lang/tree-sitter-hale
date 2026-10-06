# heron — v0 status

Status as of the initial grammar.js + @ffi wrapper commit
(2026-05-23).

## 2026-10-06 — the unit dialect, roles and `@gated`, the api binding

Synced against hale `main` at 89d0e7920. The rules were written
reading 8de99d6c9, 15 commits behind it and identical in
`spec/grammar.ebnf` and `crates/hale-syntax` (the 15 add three
lifecycle fixtures and `spec/runtime.md` prose); everything under
"Validated" ran against 89d0e7920 itself. The last pass (2026-08-31, hale 0.18.0 at
40f0428e) left no entry here; c863c39's message is its record. The
ebnf grew 234 lines since, and all of it is modeled:

- **A scanner — `src/scanner.c`, the repo's first.** Two tokens; the
  f-string is under "Found by the first run" below. The first is the
  MAGNITUDE of a quantity literal. Where `500ms` splits takes
  lookahead the DSL has no word for: `3d` is the Decimal `3` but
  `3day` is a day count, `3e5` a Float but `2EUR` two euros, `0x1F`
  a radix integer. The scanner decides exactly as hale's `lex_number`
  does and hands everything else back to the internal lexer; the unit
  after it is an ordinary identifier, so a highlighter can colour the
  two halves apart. Every binding compiles it now (Rust, Node,
  Python, Swift, Go, `hale.toml`; the Makefile already globbed
  `src/*.c`). The contextual keywords stay deferred.
- **Quantity literals (#1076)** — `quantity_literal`, fields
  `magnitude` (an `integer_literal`) and `unit` (a `unit_name`),
  replacing `duration_literal`. Changes existing trees: every
  `500ms` / `5s` was a leaf `(duration_literal)`. `m` and `d` are no
  longer time suffixes and the compound `1h30m` reads, as in hale, as
  one literal of the unit `h30m` (the checker refuses it). `3d` stays
  `decimal_literal`; `float_literal` gains the exponent-only `3e5`
  and `decimal_literal` an exponent (`1e5d`), both as hale lexes them.
- **`unit` declarations (#1076)** — `unit_decl` (`name`, `factor`),
  the factor a `unit_factor` (`numerator`, `denominator`, `unit`).
  `1_000 ns` and `1_000ns` give one tree; so do the two spellings of a
  denomination and of an origin.
- **Scalar types (#1076)** — a fourth `type_decl` form, fields `kind`
  (`scalar_kind`: quantity / point / distinct), `base`, `denomination`
  (`denomination`: `multiple`, `unit`) and `clauses` (`scalar_clauses`
  of `range_clause`, `round_clause`, `origin_clause`). It splits from
  the alias form on the token after the base (`;`, `in` or `{`); the
  alias, struct and enum trees are unchanged.
- **`x.in(D)` (#1076)** — `conversion` (`value`, `unit`). `in` is a
  hard keyword, so the form steals nothing. `x.split(u)` is NOT a
  `conversion` and stays a `call_expr`: hale parses it as an ordinary
  method call, it is indistinguishable from `line.split(",")`, and a
  rule led by `split` would reserve the word after `.` — the
  `sum` / `prod` trap again.
- **Policies (#1076)** — `policy`, for `floor` `ceil` `trunc`
  `half_even` `half_up` `clamp` `wrap`, as an `or` disposition
  (`d.in(s) or floor`) and as a `round:` value. Any other `round:`
  name stays an identifier, as hale parses it and the checker refuses
  it; `or raise` keeps `raise_disposition`; `or <value>` /
  `or handler(err)` stay expressions.
- **Roles and gates (#1109)** — `role_decl` (`name`, `include`) and
  `gated_annotation` (`role`): a fn decorator, before an `expose`
  (only — hale refuses it on a `consume`) and before a `publish`.
  `interface_method_sig` now takes `fn_decorators`, so a
  perspective's `@gated fn route(…) -> T;` parses as it does in
  hale; the checker refuses it.
- **The api binding (#1106, #1135, #1137)** — `api_binding` (`path`,
  `api_kwarg`s with `key` / `value`, `api_http` with `host` / `port` /
  `principals`, `api_serve` with `param`s) beside `binding_entry` in
  `bindings { }`.
- **Qualified names (#527 B6, #724, #1034)** — a binding's topic, a
  codec, an adapter transport, `serves P`, `perspective(P)` and
  `reperspective … as Impl` take a `qualified_name`. Changes existing
  trees: each was a bare `(identifier)` and is now
  `(qualified_name (identifier))`, even with one segment. Several
  `dna/` files bind `dna::Topic: nats::NatsAdapter { }`, which was an
  ERROR before this pass.
- **`module` bodies exclude `target`** (#901): `_module_member`. hale
  refuses one at any depth. `type` / `const` stay accepted in a locus
  body, since hale's parser reads them so the checker can refuse them
  as a located error.
- **`release (c: Kid) { … }`** — the lifecycle hook since 2026-05-30,
  never modeled; 13 corpus files use it now. Found by the audit below,
  not the ebnf diff.

Found by the first run of the corpus (13 files failed, five
constructs) and of the doc blocks (two real gaps):

- **f-strings** — `fstring_literal` is now the scanner's second token,
  mirroring `lex_fstring`: an interpolation runs to its depth-matched
  `}`, and a bare `"` inside it doesn't end the literal, so
  `f"tuple = {(1, "two", 3.5)}"` is one token. The body stays opaque.
- **Strings span lines** — `string_literal` and `bytes_literal`, as
  `lex_string` / `lex_bytes` read them.
- **`fallible(E)` on an interface method** (#732) —
  `interface_method_sig` takes `fallible_marker`.
- **`@secret` on a parameter** (#265) — `secret_annotation`, the one
  attribute `parse_param` reads; @attribute in `highlights.scm`.
- **A block is an expression** — in `_expression`, as in hale's
  `parse_primary`: a field default `= { …; Slot { } }`, a `let` value, a
  match arm, an `or` substitute. A statement led by `{` stays a block
  statement (`prec(1)` in `_statement`), as `parse_stmt` reads it.
  `match_arm` and `or_disposition_expr` lost their separate `block`
  alternative; their trees are unchanged.
- **The scrutinee-less match** — `match { n < 10 -> a, else -> b }`,
  arms `cond_match_arm` (`condition`, `body`; `else` has no condition).
  `match_stmt` and `match_expr` share one body.
- The three conflicts `generate` called unnecessary
  (`_type_expr`/`_expression`, `qualified_name`/`path_expr`,
  `named_type`/`_expression`) are gone; it reports no conflict now.

The cost, and why: hale's dialect words are contextual. tree-sitter
gets that for free wherever only an identifier is valid; a keyword only
steals where an identifier is valid in the same state. Three such
spots are new, and each loses one spelling hale accepts: `type P =
point;` (an alias of a type named `point` / `quantity` /
`distinct`); a call of a fn named like a policy directly after `or`
(`or floor(x)`; `or (floor)` and `std::math::floor(x)` are fine); and
an imported topic through an alias named `api` at a binding head
(`api::T: …`). A grep audit of the 949 corpus files and every doc
block found none of the three.

Queries: the new words in `highlights.scm` as the existing ones are;
`(policy)` @keyword; `(scalar_kind)` @keyword.modifier; a quantity
literal's magnitude @number via `integer_literal` and its unit
`(unit_name)` @type, the tree-sitter-css convention for a number's
unit, as are a unit's declared name and every reference to it; role
names @constant; `@gated` @attribute; `release` moved to the lifecycle
group. `tags.scm`: `unit_decl` as @definition.type, `role_decl` as
@definition.constant. `locals.scm` unchanged: `unit_name` is not an
`identifier`, so units — their own namespace in hale — never resolve
as locals, which is the point.

Validated: `tree-sitter generate` (CLI 0.26.9, ABI 14) with no
conflict reported; 63/63 corpus tests (42 + 21 new: 9 in
`units.txt`, 5 in `roles_api.txt`, 1 in `recent_additions.txt`, 6 in
`literals_and_blocks.txt`); 952/952 hale `.hl` files outside
`target/` parse with no ERROR or MISSING node, `known-gaps.txt`
empty. Doc blocks: of the 260 complete untagged ```hale blocks in
`docs/src` and `spec`, 197 parse and 63 fail. The first run failed 64;
two of those were grammar gaps, both fixed above
(`docs/src/basics/fallible.md` block 3, interface `fallible`, now
parses; `spec/semantics.md` block 2, the scrutinee-less match, still
fails as a top-level `let`). The 63 that fail are text hale refuses
too, all in `spec/`, for a hale-side `hale,fragment` tag or fix:
statements at top level (37 blocks) or locus members at top level
(12, the four predicted among them), `#` comments (`forms.md`), `…` / `...` elisions, `loop`,
`or ()`, a `nats(...)` transport, `;` between adapter inits, and an
API signature listing (`types.md` block 4). All three query files
load and run over `tests/hale/unit_quantities_test.hl` and
`crates/hale-stdlib/hl/time.hl`. `tree-sitter highlight` was not
run: CLI 0.26 reads a language's config from `tree-sitter.json`,
which this repo doesn't have (package.json's `"tree-sitter"` section
is the older form).

## 2026-08-12 — placement pairings, routing keys, block-shaped terminals

Synced against hale `main` at 37914e5 (20 commits on from the last
pass). Two of the four additions are the day's language changes; the
other two were standing debt the corpus never exercised, found by
walking the ebnf and the parser rather than waiting for a red build.

- **`where key == <rhs>`** — the Phase 3 routing-key filter on a
  `subscribe` line, which the grammar had never modeled at all.
  Includes today's new RHS, **`replica`** (2026-08-12): the
  subscribing instance's 0-based replica index, so K
  `pinned(replicas = K)` instances shard an Int-keyed topic with one
  subscribe line. Aliased to a `replica_key` node and highlighted as
  the builtin constant it is; `_` reuses `wildcard_pattern`.
- **Pool affinity** (2026-08-12) — `cooperative(pool = X, cores =
  0..4)`. `cooperative` now takes the same affinity forms `pinned`
  does, via a `coop_attr` rule; `replicas` stays pinned-only. This
  changes the tree for the plain `cooperative(pool = io)` form too,
  which now nests under `coop_attr`.
- **`.each { … }`** — the chain terminal, the one place a block is
  an argument. Block-shaped, so like `while`/`if` it stands as a
  statement with the trailing `;` optional. Documented surface since
  2026-08-04 and used throughout the collections docs, but no `.hl`
  in the hale repo uses it yet, so no red build ever pointed at it.
- **`Recs.write(max) { w => … ; len }`** — the zero-copy ring
  producer, `shm_write_stmt` in the ebnf, never modeled.

Neither `each` nor `write` is keyed on its literal word. A rule led
by either token would reserve it, and `x.each` as an ordinary field
read would stop parsing — exactly the trap `sum`/`prod` fell into
last pass. `each_stmt` is "a field access followed by a block" and
`shm_write_stmt` is "a call followed by `{ IDENT => … }`", which
accept a little more than hale does. Over-acceptance is the safe
direction: it costs a highlighter nothing, and hale owns rejection.

Validated: 41/41 corpus tests (3 new); 225/225 hale `.hl` files
parse; all three query files load.

Worth noting upstream: `key` and `replica` are contextual keywords
the hale parser recognizes but `crates/hale-syntax/src/keywords.rs`
doesn't list, so the docs-site highlighter won't colour them.

## 2026-08-11 — the sync debt is closed (issue #1)

All 11 XFAIL'd corpus files parse. `known-gaps.txt` is empty, and
the corpus workflow now parses **every** `.hl` in the hale repo
(225 files) rather than just fixtures + stdlib — the wider net is
what surfaced the last three gaps below, none of which live in the
two directories the old job walked.

What was actually broken, in rough order of blast radius:

- **`sum` / `prod` stole the word.** They had rules led by the
  literal token, so tree-sitter preferred the keyword wherever an
  expression could start: `sum = sum + n;` and `f(sum)` were hard
  parse errors, and a local named `sum` is ordinary in the corpus.
  Four of the eleven files failed on only this. Both are contextual
  in hale and grammatically identical to a call, so the rules are
  gone — `sum(x)` parses as `call_expr`, and highlights.scm colours
  the callee by name.
- **`match` in value position** (Gap C) — `return match c { … }`,
  including block arm bodies, guards, and match-exprs nested in
  arithmetic. A `match_expr` rule mirroring `if_expr`/`if_stmt`,
  with the pair declared as a conflict.
- **Tuple destructuring** `let (q, r) = divmod(23, 4);` and
  **numeric tuple fields** `pair.0` (`_member_name` takes an
  integer literal, as hale's parser does).
- **Enum trailing comma** — `enum { Tick(Int), Halt, }`. Payload
  variants themselves already worked; the comma before `}` didn't.
- **`bounded[T; N]`** as a type — in `spec/grammar.ebnf` since
  2026-07-02, never modeled. Both stdlib failures were this.
- **`or { … }`** — a block substitute on a fallible call site
  (`or { seen = err.kind; -1 }`). hale parses the substitute with
  the general expression parser, where a block is an expression;
  modeled here only in that position, since block-as-expression
  everywhere collides with struct literals.
- **Indexed effect families in a class set** —
  `@effects(is: { knowledge(delta) })`. The set took bare
  identifiers; it now takes `effect_class_ref`, the same shape a
  claim's `effects(<class>)` uses.
- **`codec(L { … })`** on a binding entry — `codec_spec` in the
  ebnf since F.36 Slice 2 (2026-05-28), never modeled.

Validated: 38/38 corpus tests (3 new); 225/225 hale `.hl` files
parse with no ERROR/MISSING node; all three query files load.

## 2026-08-11 — constitutions (#409) + the secrets surface (#436)

Synced against hale `main` past the #392 library-tier commit this
grammar was last cut at. The corpus check was red on three files
(`examples/constitutions.hl`, `examples/secrets-sealed-handler.hl`,
`stdlib/hl/secret.hl`); all three parse now. Added:

- **Constitutions (#409):** `constitution NAME [extends A, B] { … }`
  as a top-level decl, and `adopt NAME;` as a `claims { }` entry.
  A constitution body is the claim grammar minus `adopt` — the
  compiler rejects `adopt` inside one, since claimsets compose with
  `extends` and adoption belongs to the entrypoint that closes the
  world. The grammar models that split directly (`constitution_decl`
  repeats `claim_entry`; only `claims_block` also takes
  `adopt_entry`), so the shape is a parse error here too.
- **Secrets (#436):** the `@sealed locus` decorator, plus the two
  universal claim forms `require sealed(all G)` and
  `require attributed(all C)`. `require attributed(all publish)` is
  spelled with a hard keyword where an effect-class name goes, so
  that arm aliases `publish` back to an `identifier` node — one
  shape for consumers, matching how the hale parser special-cases it.
- **`@bounded locus` (GH #18)** — in `spec/grammar.ebnf` and accepted
  by the compiler since the memory-bound proof landed, but never
  modeled here; `@bounded locus Foo {}` was a hard parse error. Found
  while checking decorator coverage against the hale parser, not by
  the corpus (no fixture uses it).
- `highlights.scm`: `constitution` / `extends` / `adopt` as keywords;
  `sealed` / `attributed` / `all` scoped to `require_form` so the
  `@sealed` decorator still reads as an attribute; constitution names,
  bases, and adopt targets as `@type`. Also covered the bare `@`-flag
  decorators that had no highlight at all (`@supervised`,
  `@unbounded`, `@hot`, `@no_panic`, `@deterministic`).
- `tags.scm`: `constitution_decl` as `@definition.type`.

Validated: 35/35 corpus tests (2 new); 121/121 hale corpus files
behave as the XFAIL list says — the 11 known gaps still fail, nothing
else does, and no listed file has started passing.

Also repointed the Helix integration + `package.json` at
`hale-lang/tree-sitter-hale`; both still pinned
`hale-lang/pond` `subpath = "heron"`, which is where the grammar
lived before extraction. Hale's own docs name this repo now.

## 2026-07-15 — v0.10 language-surface sync

Brought the grammar current with the June–July additions it had
drifted behind (grammar.js was pinned to a ~May revision). Added:

- **Topology (v0.10 Phase 1):** the `topology { node N { l3 name
  { cores A..B; } } reserve cores ...; }` block, and the
  `pinned(...)` affinity attributes `core = / cores = <range|set>
  / node = / l3 =` plus `replicas = K`; also the `where async_io`
  placement constraint on a `placement` entry.
- **Perspectives hot-swap (v0.10 Phase 2/3):** the `serves P`
  conformance clause (`locus X : serves R, tier 2`), the
  `reperspective self.slot as Impl;` statement, the
  `perspective(P)` handle type, and the perspective-contract
  members that were missing (bodyless `fn` signatures + `bus`
  block).
- **WASM (#152/#153):** the `@export locus` decorator.
- **Per-child `terminate;`** statement (2026-05-30).
- **`resets_per_epoch(...)`** closure clause (F.34).
- `highlights.scm` keyword sync for all of the above.

Validated: 32/32 corpus tests (3 new); all 8 in-tree example
fixtures using these constructs parse ERROR-free; **zero
regressions** (the 8 fixtures still failing — tuples, enum
payloads, some control-flow / fn-arena / mode-default shapes —
fail byte-identically on the pre-change grammar; they are
pre-existing v0 gaps, not v0.10 surface). Reserved-but-
unimplemented keywords (`async`/`await`/`impl`/`macro`/`trait`)
are intentionally not modeled — Hale rejects them as parse
errors, so they have no grammar production to attach to.

## What works

- **`tree-sitter generate`** succeeds cleanly. Parser table
  generated; ships ~133KB grammar.json + ~177KB
  node-types.json + ~974KB parser.c in `src/`.
- **Corpus tests:** 13/13 in `test/corpus/*.txt` pass.
- **Real-world parsing:** 30/30 editor-corpus `.hl` files
  (top-level + `lib/lotus_viz/`) parse cleanly with no
  `ERROR` or `MISSING` nodes.
- **Highlights:** `queries/highlights.scm` loads without
  errors against the generated grammar; covers keywords,
  types, functions, identifiers, literals, operators,
  punctuation, bus subjects, builtins.
- **Hale `@ffi` wrapper:** `heron.hl` exposes Parser /
  Tree / Node + the operations consumers need (kind,
  start_byte, end_byte, start_row/col, child / named_child,
  field, text, walking helpers). `glue.c` is a thin C
  shim that hides tree-sitter's TSNode-by-value shape
  behind pointer returns.
- **Tree-sitter query support:** `heron::Query` locus
  compiles a .scm document at birth, applies against any
  Node via `apply(root) -> String` returning a
  newline-separated `start:end:capture_name` table.
  Powers SourcePane's syntax highlighting + block
  spotlighting consumers — same primitive serves both.
- **lotus_viz adapter:** `lotus_viz_adapter.hl` provides
  `TreeSitterHaleParser` — implements lotus_viz's
  `LocusTreeProvider` by walking heron's AST and extracting
  Petals for locus / type / interface declarations
  (including projection-class detection for locus petals).
- **Example program:** `examples/parse_demo.hl` reads an
  `.hl` file and prints its top-level decls — the
  canonical "hello world" against heron's surface.

## Build dependency

The Hale-side wrapper requires **libtree-sitter** at link
time (declared in `hale.toml` `[ffi]`). Install before
building anything that imports `vendor/pond/heron`:

```
apt:    sudo apt install libtree-sitter-dev
brew:   brew install tree-sitter
source: https://github.com/tree-sitter/tree-sitter
```

The generated `src/parser.c` IS checked in, so the runtime
library is the only system dep — consumers don't need the
tree-sitter CLI.

**Verified end-to-end (2026-05-23):**

```
gcc -Wall -c glue.c -o /tmp/heron_glue.o    # clean, no warnings
gcc -Wall -c src/parser.c -o /tmp/heron_parser.o   # clean
gcc -o smoke smoke.c glue.c src/parser.c -ltree-sitter   # links clean
./smoke
# parses `locus Hello { ... }`; root kind = source_file;
# named children = 1 (the locus_decl). Cleanup runs clean.
```

Query API also verified: queries/highlights.scm compiles
into a TSQuery; apply against a parsed `locus Hello { ... }`
returns coherent capture runs (locus→keyword, Hello→type,
String→type.builtin, birth→keyword.function, println→function.call,
self→both variable.builtin AND keyword — consumer picks most
specific).

## Stdlib coverage — full

**19/19 stdlib files parse cleanly** (was 7/19 at initial
grammar commit). Two grammar additions closed the gap:

1. **`range_expr`** at precedence level 1, left-assoc. Handles
   `expr..expr` and `expr..=expr` (used in slicing throughout
   the stdlib, e.g. `s[from..total]`).
2. **`unit_type`** as `()` — added to `_type_expr` choice list.
   Lets `-> () fallible(IoError)` parse correctly (the
   stdlib uses this shape when an explicit unit-success
   return is paired with a fallible marker).

Half-open ranges (`..end` / `start..`) are not in stdlib
usage today; add when a workload surfaces. Same for
`from..` without end.

## Deferred to scanner.c

Per README § "Deferred to scanner.c", these contextual
keywords are handled by treating them as regular keywords at
v0. Working without context-sensitive lexing means a few
parses fail on ambiguous positions; the consumers fall back
gracefully.

- `mode` (locus-member position only)
- `captures`, `inline` (closure body only)
- `fail`, `or`, `raise`, `discard`, `with` (contextual
  fallible positions)
- `fallible` (after fn return type only)
- `approx`, `within` (closure body only)
- `pool`, `heap` (capacity block only)
- `topic`, `main`, `bindings`, `birth_check` (top-level
  contextual)

## Conflicts declared

The grammar declares these GLR conflicts. Each is
documented inline in `grammar.js`; surfacing here for
discoverability:

| Conflict | Reason |
|---|---|
| `_expression` × `_type_expr` | `qualified_name` appears in both |
| `lvalue` × `self_expr` | `self[i]` could be lvalue or expr+index |
| `lvalue` × `_expression` | `foo.bar` could be lvalue or field_expr |
| `binding_pattern` × `qualified_name` | bare ident in pattern position |
| `if_stmt` × `if_expr` | statement-position vs value-position |
| `qualified_name` × `path_expr` | `Foo::Bar` ambiguity at `{` vs `(` |
| `qualified_name` × `_expression` | qualified-name vs ident expression |
| `named_type` × `_expression` | `<` as generic-args vs comparison |

## Supertypes deferred

Tree-sitter requires supertype symbols to have a single
visible child per alternative. `_type_expr` includes a
parenthesized form `('(' _type_expr ')')` which doesn't
satisfy. Without supertypes, queries still work — we lose
only the "supertype node" walking affordance. Revisit when
grammar stabilizes.

## Known issue — Tree return leaks per parse (M90)

`Parser.parse(source) -> Tree` returns a Tree locus from a
method body. Per spec/semantics.md § "Method-returning-locus
heap allocation (m90)", such returns are program-lifetime
allocated — neither the eager-dissolve nor the deferred-flush
path fires on the returned locus. So each `parse()` call
leaks the previous Tree's TSTree + its owned source copy.

**Impact at editor scale:** ~one Tree per file change. Typical
.hl files are 5-50KB → ~10-100KB leak per parse. A
heavily-used SourcePane could leak ~MB/hr.

**Workarounds available today:**
1. **Manual cleanup at consumer level** — keep the Tree
   handle and explicitly dissolve before re-parsing.
   Awkward; consumers have to manage locus state.
2. **Reuse a single parser-owned Tree slot** — refactor
   Parser to hold `current_tree_handle: Int`, replace on each
   parse, free on dissolve. Cleaner; Tree locus stays for
   external-management use cases. Worth doing once the
   in-flower parsing exercises the leak.

**Real fix lands upstream:** spec/semantics.md notes "A
return-slot ABI (caller passes a struct out-pointer + adopts
the locus into its own deferred-dissolves frame) would
tighten this without leaking — deferred to v1.x." When that
lands, the current heron API works as-is without changes.

## Coverage roadmap — what's still ahead

The grammar handles the full Hale language as exercised by
a real editor corpus + stdlib today. Future polish work:

1. **Scanner.c for contextual keywords** — when treating
   `mode` / `captures` / `inline` / `or` / etc. as plain
   keywords breaks a real parse. None has surfaced yet on
   the editor + stdlib corpus; add reactively.
2. **Half-open ranges** (`..end` / `start..`) — not in
   stdlib today; add when first usage appears.
3. **Better field-shape coverage in `highlights.scm`** —
   currently captures common patterns; iterate as editor
   integrations surface gaps in real workflows.
4. **Tag generation** (`queries/tags.scm`) for ctags-style
   navigation in editors that consume it.
5. **`locals.scm`** for editors that support tree-sitter's
   local-variable scoping (powers goto-def without a
   full LSP).

## How to verify locally

```
cd pond/heron
npm install
npx tree-sitter generate
npx tree-sitter test                 # corpus tests
npx tree-sitter parse path/to/file.hl   # individual file
```

All real-world editor `.hl` files should parse
without `ERROR` or `MISSING`. About 7/19 stdlib files do
today; the rest fail on range or other patterns documented
above.
