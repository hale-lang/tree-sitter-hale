# tree-sitter-hale

Tree-sitter grammar for [Hale](https://github.com/hale-lang/hale).

> Extracted from `pond/heron` (2026-07-19) into its own repo so
> ecosystem consumers — nvim-treesitter, Helix `languages.toml`,
> Zed extensions, GitHub linguist — can pin it by URL the way
> tree-sitter grammars are conventionally pinned. Full history
> preserved; "heron" remains the project codename. CI parses the
> Hale compiler's fixture corpus on every push, so grammar drift
> against the language surface is a red build, not a surprise.

The structural-parsing substrate Hale's dev tools build on:
one grammar, multiple consumers. The grammar lives here as the
canonical truth; generated parser tables + the small C scanner
ship in `src/`; query files in `queries/` drive editor
highlighting + IDE-shaped tools that don't need a full LSP.

## Consumers

- **A locus-tree visualizer** — uses heron to extract the locus
  tree from `.hl` source for the lotus flower visualization.
  The Hale-side `@ffi` wrapper exposes a
  `LocusTreeProvider` interface backed by a
  walk over heron's AST.
- **An editor source pane** — uses heron for syntax highlighting
  (per `queries/highlights.scm`) and for block spotlighting
  (find the AST node enclosing a cursor position; tint its
  background).
- **Editor extensions** (VSCode / Helix / Neovim / Zed /
  Emacs) — consume the generated `parser.c` + the same
  `queries/highlights.scm`. Users get Hale syntax
  highlighting in whatever editor they're using as their
  external editor.
  See [`integrations/`](./integrations/) for per-editor
  setup — Helix shipped today; others welcome as PRs.
- **Future LSP** — when an Hale LSP server lands, heron is
  the parser it builds on. Hover, completion, goto-def,
  references, rename, formatting — all read from heron's
  AST.

This is why heron is in pond rather than buried inside any
one tool: it's the shared substrate.

## Status

Written against Hale's surface as v0.38.0 ships it (the `v0.38.0`
tag, 75746408f, 2026-11-22): `U64` and the fixed-width integers (F.60,
F.64), `@vectorize` (F.63), `.Variant` patterns (F.58), api surfaces
and hubs, fleets, seams, set types, the record and enum codec
annotations, or-patterns, `if let` / `let … else`, byte literals,
open-ended slices, raw and block strings — and without the removed
forms: locus modes (F.61), perspectives (F.55), `module { }` (F.57),
`@gated` and the `bindings { api: … }` entry. Verified 2026-11-22
(tree-sitter 0.26.9 and 0.22.6): every `.hl` file in the hale repo
outside `target/` parses, all 1427 of them, with no ERROR or MISSING
node, and 99/99 corpus tests pass — see [`STATUS.md`](./STATUS.md),
2026-11-22.
[`known-gaps.txt`](./known-gaps.txt), the XFAIL list, is empty.
Hale @ffi wrapper
+ glue.c verified end-to-end against libtree-sitter. Query
API live (Parser / Tree / Node / Query). Three query files
ship: highlights.scm, tags.scm, locals.scm.

`src/scanner.c` lexes the tokens the DSL can't: a quantity
literal's magnitude, whose end needs lookahead (`3d` is a Decimal,
`3day` a quantity of days; `3e5` a Float, `2EUR` a quantity); an
f-string, whose `{…}` interpolations nest and may hold a quoted
string (`f"t = {(1, "two")}"`), so its end needs a depth count; a
raw string (`r#"…"#`) and a block string (a `"""` fence ending its
line), whose ends are counts of `#` and of `"`; and a recovery
primitive's word (`restart`, `bubble`, …), a keyword only when a
`(` follows it at statement head (2026-11-18). scanner.c for the
trickiest contextual keywords
(`mode`, `captures`, `inline`, `fail`, `raise`, `with`,
`fallible`) is still deferred until specific parse failures
motivate it — the grammar treats them as keywords with
context-based parsing, which works across the whole corpus
today. `sum` / `prod` used to be on that list and were the
counter-example: a rule led by the keyword stole the word from
every local named `sum`, so they now parse as ordinary calls.

See [`STATUS.md`](./STATUS.md) for the verification details
and [`integrations/`](./integrations/) for per-editor setup
(Helix shipped).

## Build

heron uses the standard tree-sitter build flow:

```
npm install                  # installs tree-sitter CLI
npx tree-sitter generate     # regenerates src/parser.c from grammar.js
npx tree-sitter test         # runs test/corpus/*.txt
npx tree-sitter parse FILE   # parses a .hl file, prints tree
```

The generated `src/parser.c` IS checked into the repo so
consumers don't need the tree-sitter CLI installed — they
just compile `parser.c` and the hand-written `scanner.c`
against `libtree-sitter` (system install). Every binding
here (and `hale.toml`'s `csrc`) lists both.

## Hale-side wrapper

Lives at the top of this directory:

- `heron.hl` — the `@ffi` bindings + a thin `Parser` / `Tree`
  / `Node` / `Query` Hale surface
- `glue.c` — the C shim hiding tree-sitter's TSNode-by-value
  behind pointer returns

The wrapper is **domain-agnostic**. Consumer-specific
adapters (e.g. lotus_viz's `TreeSitterHaleParser` that
extracts Petals from the AST) live in the consuming
package, not here — heron stays general.

Build picks up the link surface from `hale.toml`:

```toml
[ffi]
link = ["tree-sitter"]
csrc = ["glue.c", "src/parser.c"]
```

Consumer code reads:

```hale
import "vendor/pond/heron" as heron;

let parser = heron::Parser { };
let tree = parser.parse(content);
let root = tree.root();
println(heron::node_kind(root));    // "source_file"
println(heron::node_child_count(root)); // N

// For syntax highlighting via .scm queries:
let scm = std::io::fs::read_file(
    "vendor/pond/heron/queries/highlights.scm") or "";
let q = heron::Query { source: scm };
let runs = q.apply(root);  // "start:end:capture_name\n..."
```

## Suggested import alias

`heron`. The grammar surface (`Parser`, `Tree`, `Node`,
`Query`) lives directly here; consumer adapters live in the
consuming package.

## Grammar shape

Matches [`spec/grammar.ebnf`](../../hale/spec/grammar.ebnf)
section numbering as closely as tree-sitter's DSL admits:

1. Top level — `program`, `import_decl`, `top_decl` (incl.
   `role_decl` and `unit_decl` / `unit_factor`)
1b. Surfaces and fleets — `api_decl` (`rpc_row`, `route_clause`,
   `requires_clause`) and `fleet_decl` (`fleet_placement`)
2. Locus declaration — `locus_decl`, `locus_member` (`seam_decl`
   among them), and in `bindings { }` the `hub_entry`
3. Params — `params_block`, `param_decl`
4. Contract — `contract_block`, `contract_member`
5. Bus — `bus_block`, `bus_subscribe`, `bus_publish`
6. Capacity — `capacity_block`, `capacity_slot`
7. Lifecycle — `lifecycle_decl`
8. Modes — removed (F.61); `mode` and the mode words are identifiers
9. Failure handler — `failure_decl`
10. Closures — `closure_decl`
11. Types — `type_decl`, incl. the unit dialect's scalar form
    (`scalar_kind`, `denomination`, `scalar_clauses`), the set form
    and `type_annotations` (`@positional`, `@wire_case`, `@display`)
12. Type expressions — `type_expr`
13. Function decls — `function_decl`, `fallible_marker`, the
    decorators (`rpc_annotation`, `bounded_by_annotation`,
    `vectorize_annotation` among them)
14. Statements — `let_stmt`, `assign_stmt`, `send_stmt`,
    `if_stmt`, `match_stmt`, `for_stmt`, `while_stmt`,
    `return_stmt`, `break_stmt`, `continue_stmt`,
    `yield_stmt`, `recovery_stmt`, `violate_stmt`,
    `fail_stmt`, `expr_stmt`; `let_pattern` / `let_condition` for
    `let … else` and `if let`, or-patterns in `match_arm`
15. Expressions — precedence-ordered per
    [`spec/precedence.md`](../../hale/spec/precedence.md),
    incl. `quantity_literal`, `conversion` (`x.in(u)`) and the
    `or` disposition's `policy`, `open_range` in an index and
    `named_argument` in a call

## Deferred to scanner.c

These need context-sensitive lexing — tree-sitter's external
scanner pattern. Working without them at v0 means a few
parses fail on programs using these constructs at the
ambiguous position; the consumers (lotus_viz, source_pane)
fall back to "good enough" behavior on parse error.

- `mode` as a contextual keyword (only at locus-member
  position; ordinary ident elsewhere)
- `captures` (only inside `closure { ... }` body)
- `inline` (only as `epoch inline` clause)
- `fail` (only at statement-leading position inside a
  fallible fn body)
- `or` (only as postfix on a fallible-typed expression)
- `raise` (only as RHS of `or`)
- `discard` (only as RHS of `or`)
- `with` (only in `violate NAME with EXPR;`)
- `fallible` (only after a fn return type, before body)
- `approx` / `within` (only inside `closure { ... }` body)
- `pool` / `heap` (only at slot-decl head inside
  `capacity { ... }`)
- `topic` / `main` / `bindings` / `birth_check` (top-level
  contextual ident positions)

Most of these can be approximated by treating the keyword as
an ordinary ident and relying on grammar context to
disambiguate. Hard cases (e.g. `fn fail(x: Int)` vs
`fail X;` in a fallible body) ship to scanner.c when they
hit real code.

## Versioning

Pinned to a specific Hale compiler revision via the
`tree_sitter` field in `package.json`. When `spec/grammar.ebnf`
changes upstream, heron's grammar gets a corresponding bump
+ regenerate + republish.

## Why "heron"

Birds nest in trees; heron is a wading bird that watches
patiently from the edge of a pond. The grammar watches the
shape of Hale source from a small distance — close enough
to parse, far enough not to interpret semantics. That's
exactly what tree-sitter does.
