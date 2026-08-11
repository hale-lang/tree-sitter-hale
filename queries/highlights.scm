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
  "perspective"
  "interface"
  "module"
  "topic"
  "ring_layout"
  "type"
  "const"
  "fn"
  "import"
  "as"
  "main"
  "export"
  "target"
  "group"
  "domain"
  "effect"
  ; GH #409: a named, composable claimset.
  "constitution"
  "extends"
] @keyword

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
  "schedule"
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
  "serves"
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
] @keyword

; Capacity keywords
[
  "pool"
  "heap"
  "indexed_by"
  "as_parent_for"
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

; Perspective keywords
[
  "stable_when"
  "serialize_as"
] @keyword

; Transport / binding keywords
[
  "unix"
  "shm_ring"
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
  "reperspective"
  "release"
  "sum"
  "prod"
] @keyword

; Recovery primitives
[
  "restart"
  "restart_in_place"
  "quarantine"
  "reorganize"
  "bubble"
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
(fail_disposition "fail" @keyword.exception)

; Reserved-for-future keywords (trait, impl, async, await,
; macro) aren't queryable because the grammar doesn't
; reference them — they exist only as lexer-level reservations
; in the real compiler. If they show up in source they'll
; parse as identifiers; consumers can highlight separately
; if desired.

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

(deterministic_annotation
  "@" @attribute
  "deterministic" @attribute)

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

; Declaration introduces this type's name.
(type_decl name: (identifier) @type)
(locus_decl name: (identifier) @type)
(interface_decl name: (identifier) @type)
(perspective_decl name: (identifier) @type)
(topic_decl name: (identifier) @type)

; GH #409: a constitution names a claimset. Its own name, the
; bases it extends, and the name an entrypoint adopts all read
; as the same kind of thing.
(constitution_decl name: (identifier) @type)
(constitution_decl base: (identifier) @type)
(adopt_entry constitution: (identifier) @type)

; Generic params
(generic_param name: (identifier) @type)

; Projection-class wrappers
[
  "Rich"
  "Chunked"
  "Recognition"
] @type.builtin

; Named types in type-expression positions look like identifiers.
; We cover this via parameter / field type fields:
(parameter type: (named_type (qualified_name (identifier) @type)))
(struct_field type: (named_type (qualified_name (identifier) @type)))
(param_decl type: (named_type (qualified_name (identifier) @type)))

; ============================================================
; Functions + methods
; ============================================================

(function_decl name: (identifier) @function)
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

; ============================================================
; Literals
; ============================================================

(integer_literal) @number
(float_literal) @number.float
(decimal_literal) @number
(duration_literal) @number
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

; sum / prod are language-native reductions
(sum_expr "sum" @function.builtin)
(prod_expr "prod" @function.builtin)

; Self
(self_expr) @variable.builtin

; Go-style field tags (a backtick string in field-declaration position)
; read as attribute metadata, not a time-literal string.
(struct_field tag: (time_literal) @attribute)
