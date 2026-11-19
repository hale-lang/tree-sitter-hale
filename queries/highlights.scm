; Tree-sitter highlight queries for Hale.
;
; Consumed by:
;   - an editor source pane (block spotlighting + syntax coloring)
;   - Editor extensions (VSCode, Helix, Neovim, Zed, Emacs)
;
; Highlight group names follow tree-sitter community
; conventions (@keyword, @function, @type, etc.) so editor
; themes pick them up without per-theme configuration.

; ============================================================
; Comments
; ============================================================

(line_comment) @comment
(block_comment) @comment
(doc_comment) @comment.documentation

; ============================================================
; Declaration keywords
; ============================================================

[
  "locus"
  "interface"
  "topic"
  "ring_layout"
  "type"
  "enum"
  "const"
  "fn"
  "import"
  "as"
  "main"
  "target"
  "group"
  "domain"
  "effect"
  ; Phase 4: `fleet locus` and its placement's `host("…")`.
  "fleet"
  "host"
  ; GH #1417: a surface and its rows; GH #1530: a row's route.
  "api"
  "rpc"
  "requires"
  "at"
  "status"
  "wire"
  ; GH #1530 step 2: a seam, and its `or end;` tail.
  "seam"
  "end"
  ; GH #409: a named, composable claimset.
  "constitution"
  "extends"
  ; GH #1109: authorization vocabulary (`role` itself is listed with
  ; the transport keywords — it is also `unix(…, role: listen)`).
  "includes"
  ; GH #1076: the unit dialect — a unit declaration, and a scalar
  ; type's clause names.
  "unit"
  "range"
  "round"
  "origin"
] @keyword

; GH #1076: the kind of a scalar type (`type Money = quantity Int in
; cent;`) — a modifier on its base, like `tier` / `serves` on a locus.
(scalar_kind) @keyword.modifier

; GH #1076: a narrowing's policy — `d.in(s) or floor`, `Session(n) or
; clamp`, and a type's `{ round: half_even; }`.
(policy) @keyword

; GH #382 claims surface
[
  "claims"
  ; GH #409: `adopt Core;` inside a main's claims block.
  "adopt"
  "forbid"
  "reaches"
  "via"
  "during"
  "avoiding"
  "edges"
  "bound"
  "require"
  "cover"
  "count"
  "seed"
  "effects"
  "subscribes"
  "publishes"
  "publishers"
  "subscribers"
  "subscribed_by"
  "some"
  "paths"
  "from"
  "may_be_empty"
  "only"
  "calls"
  ; GH #1327: key coverage, silent loss, separate domains.
  "keys"
  "delivered_to"
  "exactly_one"
  "no_silent_loss"
  "separate_domains"
  ; `bound <effect> <= N on paths from <origin>` — `on` is a lexer
  ; keyword and the grammar already parses it; it was simply never
  ; queried, so it read as plain text beside the words around it.
  "on"
] @keyword

; GH #436: the universal claim forms. `sealed` is scoped to
; `require_form` rather than listed flat — the same word is the
; `@sealed` decorator, which reads as an attribute, not a keyword.
(require_form
  "sealed" @keyword)
(require_form
  "attributed" @keyword)
(require_form
  "all" @keyword)

; Locus annotation keywords
[
  "tier"
  "projection"
  "rich"
  "chunked"
  "recognition"
  "fixed_cell"
  "shared_slab"
  "spillover"
  "summary_only"
  "cooperative"
  "pinned"
  "cap"
  "core"
  "cores"
  "node"
  "l3"
  "replicas"
  "reserve"
] @keyword.modifier

; Locus member keywords
[
  "params"
  "contract"
  "bus"
  "capacity"
  "bindings"
  "placement"
  "topology"
] @keyword

; Lifecycle + mode keywords
[
  "birth"
  "accept"
  "release"
  "run"
  "drain"
  "dissolve"
  "on_failure"
  "bulk"
  "harmonic"
  "resolution"
  "mode"
  "birth_check"
] @keyword.function

; Contract keywords
[
  "expose"
  "consume"
  "inferred"
] @keyword

; Bus keywords
[
  "subscribe"
  "publish"
  "of"
  "payload"
  "subject"
  ; Phase 3 routing keys: `where key == <rhs>` on a subscribe.
  "key"
  ; ...and the topic side of the same feature: `keyed_by FIELD;` names
  ; the routing field, `on_unmatched:` says what happens to a keyed
  ; publish nothing matched.
  "keyed_by"
  "on_unmatched"
  "on_full"
] @keyword

; `replica` — this instance's 0-based replica index. A value, not
; a keyword: it reads as the builtin constant it is, and it holds
; that meaning only as a key-filter RHS.
(key_filter (replica_key) @constant.builtin)

; Capacity keywords
[
  "pool"
  "heap"
  "indexed_by"
  "as_parent_for"
  ; `heap jobs of Job ordered_by min priority;` (a @form(heap) slot).
  "ordered_by"
  "min"
  "max"
  ; F.52: an optional field's clear flag, `x?: T clearable;`.
  "clearable"
] @keyword

; Closure keywords
[
  "closure"
  "epoch"
  "persists_through"
  "resets_on"
  "resets_per_epoch"
  "captures"
  "inline"
  "tick"
  "duration"
  "explicit"
  "approx"
  "within"
] @keyword

; Transport / binding keywords
[
  "unix"
  "shm_ring"
  ; F.36: the optional codec(L { }) clause on a binding entry.
  "codec"
  "where"
  "role"
  "listen"
  "connect"
  "slot_count"
  "on_overflow"
  "block"
  "drop"
  "async_io"
  "intra_process"
  "intra_machine"
  "cross_machine"
  "zero_copy"
] @keyword

; Statement / expression keywords
[
  "let"
  "mut"
  "if"
  "else"
  "match"
  "for"
  "in"
  "while"
  "return"
  "break"
  "continue"
  "true"
  "false"
  "nil"
  "self"
  "yield"
  "terminate"
] @keyword

; Recovery primitives. The op word (`restart`, `restart_in_place`,
; `quarantine`, `reorganize`, `bubble`) is a keyword only before its `(`
; at statement head, so the scanner hands it over as one node.
(recovery_op) @keyword.exception

[
  "violate"
  "with"
  "until"
] @keyword.exception

; Fallible / error keywords. `raise` and `discard` are wrapped
; in named rules (raise_disposition / discard_disposition) so
; we query the rule rather than the bare string token.
[
  "fallible"
  "fail"
  "or"
] @keyword.exception

(raise_disposition)   @keyword.exception
(discard_disposition) @keyword.exception
(wait_disposition)    @keyword.exception
(fail_disposition "fail" @keyword.exception)

; `trait`, `impl`, `async`, `await`, `macro` and `export` are ordinary
; identifiers (F.47), as are `module` (F.57) and `perspective`,
; `serves`, `reperspective`, `serialize_as` and `stable_when` (F.55):
; none of them is highlighted as a keyword.

; ============================================================
; Annotation decorators (@form, @ffi, @locality)
; ============================================================

(form_annotation
  "@" @attribute
  "form" @attribute)

(ffi_annotation
  "@" @attribute
  "ffi" @attribute)

; Bare `@`-flags on a locus. `@sealed` (GH #436) confines the
; locus's params; `@bounded` (GH #18) opts it into the memory-bound
; proof; `@supervised` (GH #265) asserts failure-policy coverage.
(sealed_annotation
  "@" @attribute
  "sealed" @attribute)

(bounded_annotation
  "@" @attribute
  "bounded" @attribute)

(supervised_annotation
  "@" @attribute
  "supervised" @attribute)

; Bare `@`-flags on a fn — the memory-bound carve-out and the
; effect assertions that take no arglist.
(unbounded_annotation
  "@" @attribute
  "unbounded" @attribute)

(hot_annotation
  "@" @attribute
  "hot" @attribute)

(no_panic_annotation
  "@" @attribute
  "no_panic" @attribute)

; GH #265: `@secret` on a parameter taints it.
(secret_annotation
  "@" @attribute
  "secret" @attribute)

; GH #265: the `@no_*` effect-assert family — documented sugar over
; `@effects(none: {...})`, enumerated by the compiler's
; `effect_assert_for()`. The grammar folds all six into one token, so
; one query covers @no_syscall / @no_block / @no_ffi / @no_publish /
; @no_spawn / @no_recursion.
(no_effect_annotation) @attribute

(deterministic_annotation
  "@" @attribute
  "deterministic" @attribute)

; `@export` on a fn or a locus (a wasm export): an annotation, not a
; keyword (F.47).
(export_annotation
  "@" @attribute
  "export" @attribute)

(budget_annotation
  "@" @attribute
  "budget" @attribute)

(effects_annotation
  "@" @attribute
  "effects" @attribute)

(phase_effects_annotation
  "@" @attribute
  "phase_effects" @attribute)

; GH #1490: `@bounded_by(<name>)` names what bounds the growth.
(bounded_by_annotation
  "@" @attribute
  "bounded_by" @attribute)

; GH #1417: `@rpc` / `@rpc(requires: [R])` on a locus fn.
(rpc_annotation
  "@" @attribute
  "rpc" @attribute)

; GH #1951: `@raise fn` — an `or raise` conversion.
(raise_annotation
  "@" @attribute
  "raise" @attribute)

; GH #1530: `@repo(T)` on a locus and `@idempotent` /
; `@not_idempotent` on its writes.
(repo_annotation
  "@" @attribute
  "repo" @attribute
  type: (identifier) @type)

(idempotent_annotation) @attribute

; Type annotations: `@positional` (a record as a JSON array),
; `@wire_case(snake)` (an enum's wire spelling) and `@display("…")`
; (how values render as text, F.54).
(positional_annotation
  "@" @attribute
  "positional" @attribute)

(wire_case_annotation
  "@" @attribute
  "wire_case" @attribute
  case: (identifier) @constant.builtin)

(display_annotation
  "@" @attribute
  "display" @attribute)

; `@not_found Missing`: an enum variant's error class.
(error_class_annotation
  "@" @attribute
  class: (identifier) @attribute)

; A role a surface row, an `@rpc` or a hub binding requires, and a role
; a role includes: the named value it is where `role R;` declares it.
(requires_clause role: (role_ref (identifier) @constant))

; F.32-2 v0.2 (2026-05-25): @locality(L1|L2|L3|any). Tier
; names get constant.builtin so they read as named values
; rather than identifiers.
(locality_annotation
  "@" @attribute
  "locality" @attribute
  tier: (locality_tier) @constant.builtin)

; ============================================================
; Types
; ============================================================

(primitive_type) @type.builtin

; `bounded[T; N]` is a type constructor, not the `bounded(N)`
; topic clause and not the `@bounded` decorator — all three share
; the word, so this is scoped to the type node.
(bounded_type "bounded" @type.builtin)

; Declaration introduces this type's name.
(type_decl name: (identifier) @type)
(locus_decl name: (identifier) @type)
(interface_decl name: (identifier) @type)
(topic_decl name: (identifier) @type)
(fleet_decl name: (identifier) @type)
(api_decl name: (identifier) @type)

; GH #409: a constitution names a claimset. Its own name, the
; bases it extends, and the name an entrypoint adopts all read
; as the same kind of thing.
(constitution_decl name: (identifier) @type)
(constitution_decl base: (identifier) @type)
(adopt_entry constitution: (identifier) @type)

; GH #1076: a unit is coloured as a kind of type. Its declared name and
; every reference to it — a quantity literal's suffix, an equation's
; target, a denomination, an origin, `.in(…)` — are @type.unit, which
; Helix and Neovim resolve to @type when a theme has no rule for it.
; The tree-sitter-css convention for a number's unit, and distinct
; from the magnitude's @number.
(unit_decl name: (identifier) @type.unit)
(unit_name) @type.unit

; `x.split(u)` is an ordinary method call in the tree (a `conversion`
; node would reserve the word), so its unit is matched here: the one
; bare identifier argument of a method named `split`, positionally, as
; the book's and the site's highlighters do.
((call_expr
  callee: (field_expr member: (identifier) @_method)
  .
  (identifier) @type.unit .)
 (#eq? @_method "split"))

; GH #1109: a role is deployment vocabulary, a named value.
(role_decl name: (identifier) @constant)
(role_decl include: (role_ref (identifier) @constant))
(group_member role: (identifier) @constant)

; Generic params
(generic_param name: (identifier) @type)

; Projection-class wrappers, `rich<Sample>` — the words are contextual,
; type constructors only when a `<` follows.
(projection_type
  [
    "rich"
    "chunked"
    "recognition"
  ] @type.builtin)

; GH #1530: a set type's members.
(type_decl member: (qualified_name (identifier) @type))

; Named types in type-expression positions look like identifiers.
; We cover this via parameter / field type fields:
(parameter type: (named_type (qualified_name (identifier) @type)))
(struct_field type: (named_type (qualified_name (identifier) @type)))
(param_decl type: (named_type (qualified_name (identifier) @type)))

; ============================================================
; Functions + methods
; ============================================================

(function_decl name: (identifier) @function)
(seam_decl name: (identifier) @function.method)
; A surface row's handler, `rpc Shop::place;`, and a signature row's name.
(rpc_handler (identifier) @function.method .)
(rpc_row name: (identifier) @function.method)
(interface_method_sig name: (identifier) @function.method)
(ffi_function_decl name: (identifier) @function)

; Call sites
(call_expr callee: (identifier) @function.call)
(call_expr callee: (field_expr member: (identifier) @function.method.call))
(call_expr callee: (path_expr member: (identifier) @function.call))

; ============================================================
; Identifiers (lvalues, variables, field accesses)
; ============================================================

; Parameter names
(parameter name: (identifier) @variable.parameter)
(param_decl name: (identifier) @variable.member)

; Struct field names
(struct_field name: (identifier) @variable.member)

; Let-binding names
(let_stmt name: (identifier) @variable)

; Field access — member position
(field_expr member: (identifier) @variable.member)

; Struct literal field positions
(struct_init field: (identifier) @variable.member)

; `api::serve(…, as: "t", bound: 8)` — a named argument.
(named_argument name: (identifier) @variable.parameter)

; An import list's names, `import "p" as a { Row, show as display };`.
(import_item name: (identifier) @variable)
(import_item alias: (identifier) @variable)
(import_decl alias: (identifier) @module)

; ============================================================
; Literals
; ============================================================

(integer_literal) @number
; GH #1995 S6: `b'/'` is an Int, written as a character
; (`constant.character`, which Helix names and Neovim reads as a constant).
(byte_literal) @constant.character
(float_literal) @number.float
(decimal_literal) @number
; A quantity literal's magnitude is an integer_literal node (@number
; above); its unit is a unit_name (@type.unit, under Types).
(time_literal) @string.special
(boolean_literal) @constant.builtin
(nil_literal) @constant.builtin

(string_literal) @string
(bytes_literal) @string.special
(fstring_literal) @string.special

; ============================================================
; Operators
; ============================================================

[
  "+"
  "-"
  "*"
  "/"
  "%"
  "<<"
  ">>"
  "&"
  "|"
  "^"
  "~"
  "!"
  "&&"
  "||"
  "=="
  "!="
  "<"
  ">"
  "<="
  ">="
  "~~"
  "="
  "+="
  "-="
  "*="
  "/="
  "%="
  "&="
  "|="
  "^="
  "->"
  ; The `w =>` header of a zero-copy ring write block.
  "=>"
] @operator

; Bus send — distinctive enough to call out.
"<-" @operator.special

; ============================================================
; Punctuation
; ============================================================

[
  ";"
  ","
  "::"
  "."
  ":"
] @punctuation.delimiter

[
  "("
  ")"
  "{"
  "}"
  "["
  "]"
] @punctuation.bracket

; ============================================================
; Subject literals (bus addresses) — distinguish from other strings
; ============================================================

(bus_subscribe subject: (string_literal) @string.special.symbol)
(bus_publish subject: (string_literal) @string.special.symbol)

; ============================================================
; Special expressions
; ============================================================

; sum / prod are the language-native reductions, but they parse as
; ordinary calls — a rule led by the `sum` keyword stole the word
; from every local named `sum`. Match the callee by name instead.
((call_expr
  callee: (identifier) @function.builtin)
 (#any-of? @function.builtin "sum" "prod"))

; Self
(self_expr) @variable.builtin

; Go-style field tags (a backtick string in field-declaration position)
; read as attribute metadata, not a time-literal string — on a field
; and, since GH #1951, on an enum variant (``Sell `json:"sell"` ``).
(struct_field tag: (time_literal) @attribute)
(enum_variant tag: (time_literal) @attribute)

; F.52: the `?` of an optional field, `last?: Decimal<8>;`.
(optional_marker) @punctuation.special

; F.54: a `@display` template is a format string.
(display_annotation template: (string_literal) @string.special)
