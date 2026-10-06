/**
 * @file Tree-sitter grammar for Hale
 * @author hale-lang
 * @license Apache-2.0
 *
 * Source of truth: hale/spec/grammar.ebnf
 * Precedence reference: hale/spec/precedence.md
 *
 * Section numbering below mirrors grammar.ebnf for easy
 * cross-reference.
 */

const PREC = {
  // From precedence.md, level 14 (highest) → 0 (lowest).
  // Tree-sitter precedence is numeric; we mirror the spec
  // levels so a reader can match the two.
  CALL: 14,             // (), [], ., ::
  UNARY: 13,            // unary -, !, ~
  MUL: 12,              // *, /, %
  ADD: 11,              // +, -
  SHIFT: 10,            // <<, >>
  BIT_AND: 9,           // &
  BIT_XOR: 8,           // ^
  BIT_OR: 7,            // |
  CMP: 6,               // <, >, <=, >=
  EQ: 5,                // ==, !=
  APPROX: 4,            // ~~ (closure only)
  AND: 3,               // &&
  OR: 2,                // ||
  OR_DISP: 1,           // `or` (fallible disposition)
  ASSIGN: 0,            // =, +=, -=, ...
  SEND: -1,             // <- (statement only)
};

module.exports = grammar({
  name: 'hale',

  word: $ => $.identifier,

  extras: $ => [
    /\s+/,
    $.line_comment,
    $.block_comment,
    $.doc_comment,
  ],

  externals: $ => [
    // src/scanner.c. The magnitude of a quantity literal (`500ms`,
    // `3bp`, GH #1076): where it ends takes lookahead the DSL can't
    // express — `3d` is the Decimal `3` but `3day` is three days,
    // `3e5` is a Float but `2EUR` two euros — so the scanner reads it
    // the way hale's lexer does and the unit is an ordinary identifier
    // after it. The other contextual keywords are still deferred; see
    // README § "Deferred to scanner.c".
    $._quantity_magnitude,
    // An f-string, `f"…{expr}…"`, as one token. hale's `lex_fstring`
    // reads an interpolation to its depth-matched `}`, and a `"` inside
    // the braces does not end the literal (`f"t = {(1, "two")}"`); a
    // regular expression can't count the depth, so the scanner does.
    // The body stays opaque text, as it was.
    $.fstring_literal,
  ],

  conflicts: $ => [
    // Conflicts surface as the grammar grows. Document the
    // reason for each entry inline.
    [$.lvalue, $.self_expr],               // `self[i]` could be lvalue or expr
    [$.lvalue, $._expression],             // `foo.bar` could be lvalue or field_expr
    [$.binding_pattern, $.qualified_name], // bare ident in pattern position
    [$.if_stmt, $.if_expr],                // statement-position if vs value-position if
    [$.match_stmt, $.match_expr],          // same, for match (Gap C)
    [$._locus_decorator, $.fn_decorators], // `@export` prefixes both locus and fn decls
    [$.qualified_name, $._expression],     // `foo` as qualified-name (for literal/type) vs identifier expression
  ],

  // Supertypes are deferred — tree-sitter requires a "single
  // visible child" property per supertype that not all of our
  // hidden-alternative rules satisfy (notably _type_expr has
  // a parenthesized form). Without supertypes, queries still
  // work; we lose only the "supertype node" affordance at
  // node-walk time. Revisit when grammar stabilizes.

  rules: {

    // ===========================================================
    // § 1. Top level
    // ===========================================================

    source_file: $ => seq(
      repeat($.import_decl),
      repeat($._top_decl),
    ),

    // v1.x-IMPORT: bare `import "path";` (no alias) is a
    // parse error. The grammar reflects that — `as IDENT`
    // is required.
    import_decl: $ => seq(
      'import',
      field('path', $.string_literal),
      'as',
      field('alias', $.identifier),
      ';',
    ),

    _top_decl: $ => choice(
      $._module_member,
      // GH #901: the one top-level declaration a module body may not
      // hold — a program-level build directive. hale's parser refuses
      // it at any depth, so it sits outside `_module_member`.
      $.target_decl,
    ),

    _module_member: $ => choice(
      $.locus_decl,
      $.perspective_decl,
      $.type_decl,
      $.const_decl,
      $.function_decl,
      $.ffi_function_decl,
      $.interface_decl,
      $.topic_decl,
      $.ring_layout_decl,
      $.module_decl,
      $.effect_decl,
      $.group_decl,
      $.domain_decl,
      // #392 thread 2: a TOP-LEVEL claims block — the library
      // tier. A seed swears about itself and its own boundary;
      // the block travels with the import. The typechecker
      // rejects the form in a seed that declares `main locus`.
      $.claims_block,
      // GH #409: a named, composable claimset, declared outside
      // any main and adopted by entrypoints.
      $.constitution_decl,
      // GH #1109: authorization vocabulary for `@gated`.
      $.role_decl,
      // GH #1076: a node (and edge) of the unit graph.
      $.unit_decl,
    ),

    // GH #1109: `role NAME [includes A, B];` — a name the deployment
    // maps to principals. `includes` is grant-only and union-only (a
    // cycle is the checker's error). `role` / `includes` are CONTEXTUAL
    // in the hale parser; `role` is also the `unix(..., role: listen)`
    // kwarg, a different position.
    role_decl: $ => seq(
      'role',
      field('name', $.identifier),
      optional(seq(
        'includes',
        field('include', $.identifier),
        repeat(seq(',', field('include', $.identifier))),
      )),
      ';',
    ),

    // GH #1076: `unit NAME;` declares a node of the unit graph;
    // `unit NAME = FACTOR [TARGET];` also states that one NAME is
    // FACTOR TARGETs. `unit` is CONTEXTUAL (top-level position only).
    unit_decl: $ => seq(
      'unit',
      field('name', $.identifier),
      optional(seq('=', field('factor', $.unit_factor))),
      ';',
    ),

    // A positive integer or a ratio of two, then the unit it multiplies
    // (none: the number one, `unit bp = 1 / 10000;`). The magnitude and
    // its unit may be written apart (`1_000 ns`) or together (`1_000ns`,
    // one literal token in hale); both spellings give the same tree.
    // hale reads no `/` after a joined magnitude, so neither does this.
    unit_factor: $ => choice(
      seq(
        field('numerator', $.integer_literal),
        optional(seq('/', field('denominator', $.integer_literal))),
        optional(field('unit', $._unit_name)),
      ),
      seq(
        field('numerator', $._magnitude),
        field('unit', $._unit_name),
      ),
      seq(
        field('numerator', $.integer_literal),
        '/',
        field('denominator', $._magnitude),
        field('unit', $._unit_name),
      ),
    ),

    // A unit's name where one is REFERENCED (a quantity literal, a
    // denomination, an equation's target, an origin, `.in(…)`). Units
    // live in their own namespace — a local named `s` neither shadows
    // the unit `s` nor is shadowed by it — so the reference is its own
    // node rather than an `identifier` locals.scm would resolve.
    _unit_name: $ => alias($.identifier, $.unit_name),

    // The scanner's magnitude, surfaced as the integer it is.
    _magnitude: $ => alias($._quantity_magnitude, $.integer_literal),

    // FUv0.8.2 #7: `target <name> { cap.path, ... }` — names a
    // substrate + its capability profile. Contextual, like `topic`.
    // (Was a known gap; closed in the #382 sync.)
    target_decl: $ => seq(
      'target',
      field('name', $.identifier),
      '{',
      optional(seq(
        $.capability_path,
        repeat(seq(',', $.capability_path)),
        optional(','),
      )),
      '}',
    ),

    capability_path: $ => seq(
      $.identifier,
      repeat(seq('.', $.identifier)),
    ),

    // GH #382: `group NAME = { member, ... } [may_be_empty];` —
    // declared claim vocabulary. `group` / `may_be_empty` are
    // CONTEXTUAL in the hale parser (no token() wrapper, same
    // rationale as `effect`).
    group_decl: $ => seq(
      'group',
      field('name', $.identifier),
      '=',
      '{',
      optional(seq(
        $.group_member,
        repeat(seq(',', $.group_member)),
        optional(','),
      )),
      '}',
      optional('may_be_empty'),
      ';',
    ),

    group_member: $ => seq(
      $.identifier,
      repeat(seq('::', $.identifier)),
      optional(seq('::', '*')),
    ),

    // GH #382 phase 3: `domain wing = { delta, gamma };` — a closed
    // index domain for effect families.
    domain_decl: $ => seq(
      'domain',
      field('name', $.identifier),
      '=',
      '{',
      $.identifier,
      repeat(seq(',', $.identifier)),
      optional(','),
      '}',
      ';',
    ),

    // GH #409: `constitution NAME [extends A, B] { … }` — a named
    // claimset declared outside any main, composed by UNION and
    // adopted by an entrypoint (`adopt NAME;` inside its `claims`
    // block). The body is the same claim grammar as `claims { }`
    // MINUS `adopt`: claimsets compose with `extends`, and adoption
    // belongs to the entrypoint that closes the world. `constitution`
    // / `extends` are CONTEXTUAL in the hale parser, so no `token`
    // wrapper here either.
    constitution_decl: $ => seq(
      'constitution',
      field('name', $.identifier),
      optional(seq(
        'extends',
        field('base', $.identifier),
        repeat(seq(',', field('base', $.identifier))),
      )),
      '{',
      repeat($.claim_entry),
      '}',
    ),

    // #345: `effect NAME;` declares a user effect class that
    // `@effects(is: {…})` then names. `effect` is CONTEXTUAL in the
    // hale parser — it stays usable as an ordinary identifier — so
    // this rule must not promote it to a keyword token. The `token`
    // wrapper is deliberately absent for that reason.
    effect_decl: $ => seq(
      'effect',
      field('name', $.identifier),
      // GH #382 phase 3: `effect knowledge(wing);` — an indexed
      // family over a source-declared domain.
      optional(seq('(', field('domain', $.identifier), ')')),
      // #354: an optional DEFINITION. `effect io = { syscall, block };`
      // makes `io`'s mask the union of its members rather than a bit of
      // its own, so forbidding `io` forbids both, and anything reaching
      // a syscall carries `io`. Members may be built-ins or other
      // declared classes; the compiler owns which combinations resolve.
      optional(seq('=', field('definition', $.effect_class_set))),
      ';',
    ),

    module_decl: $ => seq(
      'module',
      field('name', $.identifier),
      '{',
      repeat($._module_member),
      '}',
    ),

    interface_decl: $ => seq(
      'interface',
      field('name', $.identifier),
      '{',
      repeat($.interface_method_sig),
      '}',
    ),

    // Decorators are taken (and left to the checker) so a perspective's
    // contract signature can carry the `@gated` hale's parser reads onto
    // it — GH #1109 refuses that by its rule, a perspective's fns being
    // signatures the serving loci answer, not a gate. Sharing
    // `fn_decorators` with `function_decl` keeps the bodyless and the
    // bodied forms one LR prefix in a perspective body.
    interface_method_sig: $ => seq(
      optional($.fn_decorators),
      'fn',
      field('name', $.identifier),
      '(',
      optional($._param_list),
      ')',
      optional(seq('->', field('return_type', $._type_expr))),
      // GH #732: the contextual `fallible(E)` marker a fn declaration
      // takes — `fn put(k: String) -> Int fallible(E);`.
      optional($.fallible_marker),
      ';',
    ),

    topic_decl: $ => seq(
      'topic',
      field('name', $.identifier),
      optional(seq(':', field('parent', $.identifier))),
      '{',
      repeat($.topic_field),
      '}',
    ),

    topic_field: $ => choice(
      seq('payload', ':', field('payload_type', $._type_expr), ';'),
      seq('subject', ':', field('subject', $.string_literal), ';'),
      // #255 backpressure: a topic may declare a queue bound and the
      // policy applied when it is full.
      seq($.bounded_clause, ';'),
      seq('on_full', ':', field('on_full', $.identifier), ';'),
      // Routing key: `keyed_by FIELD;` names the payload field the bus
      // routes on, so a subscriber can filter with `where key == …`.
      // Deliberately colon-free — it reads as a phrase, not a setting.
      seq('keyed_by', field('key', $.identifier), ';'),
      // What happens to a keyed publish no subscriber matched:
      // `swallow` | `fail` | `fallback`. Left as an identifier for the
      // same reason `on_full` is — the compiler owns the legal set.
      seq('on_unmatched', ':', field('on_unmatched', $.identifier), ';'),
    ),

    // `bounded(N)` on a topic; `bounded(N, <policy>)` on a subscribe.
    // Policy names are idents rather than a keyword list — the
    // compiler owns which are legal.
    bounded_clause: $ => seq(
      'bounded',
      '(',
      field('capacity', $.integer_literal),
      optional(seq(',', field('policy', $.identifier))),
      ')',
    ),

    // shm-ring-interop Proposal B: `ring_layout Name { ... }` declares
    // the byte layout of an externally-defined SHM broadcast ring so a
    // `shm_ring(..., layout: Name)` binding can read/write it. Members
    // are keyword-led + `;`-terminated; attribute values are bare
    // identifiers or integer literals (`ring_word` admits the few
    // keyword-spelled words like `release`).
    ring_layout_decl: $ => seq(
      'ring_layout',
      field('name', $.identifier),
      '{',
      repeat($._ring_layout_member),
      '}',
    ),

    _ring_layout_member: $ => choice(
      $.ring_magic,
      $.ring_data_at,
      $.ring_overflow,
      $.ring_scalar_field,
      $.ring_cursor_block,
      $.ring_framing_block,
    ),

    ring_magic: $ => seq('magic', $.integer_literal, ';'),
    ring_data_at: $ => seq('data_at', $.integer_literal, ';'),
    ring_overflow: $ => seq('overflow', $.ring_word, ';'),

    // `version 1 at 8 : u32;` — name, optional expected value, offset,
    // width repr.
    ring_scalar_field: $ => seq(
      field('name', $.identifier),
      optional($.integer_literal),
      'at',
      field('offset', $.integer_literal),
      ':',
      field('repr', $.ring_word),
      ';',
    ),

    ring_cursor_block: $ => seq(
      'cursor',
      optional(field('name', $.identifier)),
      '{',
      repeat($.ring_attr),
      '}',
    ),

    ring_framing_block: $ => seq(
      'framing',
      field('kind', $.ring_word),
      '{',
      repeat($.ring_attr),
      '}',
    ),

    ring_attr: $ => seq(
      field('key', $.identifier),
      choice($.ring_word, $.integer_literal),
      ';',
    ),

    // A layout token: an identifier, or one of the few keyword-spelled
    // words that can appear in a layout value position.
    ring_word: $ => choice(
      $.identifier,
      'release',
      'drop',
      'fail',
      'block',
    ),

    // ===========================================================
    // § 2. Locus declaration
    // ===========================================================

    locus_decl: $ => seq(
      // F.32-2 v0.2 (2026-05-25): `@form(...)` and
      // `@locality(...)` may both decorate the same locus,
      // in either order; each may appear at most once. Real
      // arity is enforced by the host typechecker; the
      // grammar accepts the looser shape.
      repeat($._locus_decorator),
      optional('main'),
      'locus',
      field('name', $.identifier),
      optional($.generic_params),
      optional($.locus_annotations),
      '{',
      repeat($._locus_member),
      '}',
    ),

    _locus_decorator: $ => choice(
      $.form_annotation,
      $.locality_annotation,
      $.export_annotation,
      // Effect contracts that sit on a LOCUS rather than a fn:
      // `@effects(depends: …)` (#330) is locus-level by design —
      // dependence enters through subscriptions, which are declared
      // per-locus — and `@phase_effects` / `@supervised` have always
      // been locus-level.
      $.effects_annotation,
      $.phase_effects_annotation,
      $.supervised_annotation,
      $.sealed_annotation,
      $.bounded_annotation,
    ),

    // GH #436: `@sealed locus` confines the locus's state — its
    // `params` are readable only from inside its own methods. Others
    // may still CALL it; they may not read it. Only `params` are
    // confined (not capacity slots, not methods), and param
    // initialization is deliberately unrestricted — the parent
    // already holds what it passes.
    sealed_annotation: $ => seq('@', 'sealed'),

    // GH #18 item 1: `@bounded locus` opts the locus into the
    // memory-bound proof — its bodies are checked for unbounded
    // allocations on every `hale check`. A bare flag, like
    // `@unbounded` on a fn (the carve-out in the other direction).
    bounded_annotation: $ => seq('@', 'bounded'),

    phase_effects_annotation: $ => seq(
      '@',
      'phase_effects',
      '(',
      $._effects_clause,
      repeat(seq(',', $._effects_clause)),
      ')',
    ),

    supervised_annotation: $ => seq('@', 'supervised'),

    // `@export locus` (WASM #152/#153): the persistent singleton
    // "app" of a wasm program — instantiated once, never
    // dissolved, its `fn` methods exported to the JS host.
    export_annotation: $ => seq('@', 'export'),

    // @form(name, key=value, ...)
    form_annotation: $ => seq(
      '@',
      'form',
      '(',
      field('form_name', $.identifier),
      repeat(seq(',', $.form_arg)),
      ')',
    ),

    form_arg: $ => seq(
      field('key', $.identifier),
      '=',
      field('value', $._expression),
    ),

    // F.32-2 v0.2 (2026-05-25): @locality(L1|L2|L3|any)
    // pins a per-locus cache-tier budget that the host's
    // working-set estimator evaluates against. See
    // spec/types.md § "Working-set estimator (F.32-2)" for
    // the budget precedence rules.
    locality_annotation: $ => seq(
      '@',
      'locality',
      '(',
      field('tier', $.locality_tier),
      ')',
    ),

    locality_tier: $ => choice(
      'L1',
      'L2',
      'L3',
      'any',
    ),

    locus_annotations: $ => seq(
      ':',
      $._locus_header_item,
      repeat(seq(',', $._locus_header_item)),
    ),

    // Perspectives Phase 2a (2026-06): the post-`:` list may
    // carry `serves P` conformance clauses intermixed with the
    // annotations — `locus RouterV1 : serves Router, tier 2 { }`.
    // `serves` is a contextual ident recognized only here. Hidden
    // grouping rule so annotations stay direct children of
    // `locus_annotations`; `serves` gets its own named node.
    _locus_header_item: $ => choice(
      $.locus_annotation,
      $.serves_clause,
    ),

    // GH #724: the contract may be an IMPORTED perspective, named
    // through its import alias — `serves lib::Routing`.
    serves_clause: $ => seq('serves', field('perspective', $.qualified_name)),

    locus_annotation: $ => choice(
      seq('tier', $.integer_literal),
      seq('projection', $.projection_class),
      seq('schedule', $.schedule_class),
    ),

    projection_class: $ => choice(
      'rich',
      'chunked',
      seq('recognition', $.recognition_params),
    ),

    recognition_params: $ => seq(
      '(',
      'cap',
      '=',
      $.integer_literal,
      ',',
      $.recognition_sub_mode,
      ')',
    ),

    recognition_sub_mode: $ => choice(
      'fixed_cell',
      'shared_slab',
      'spillover',
      'summary_only',
    ),

    schedule_class: $ => choice(
      'cooperative',
      seq('pinned', optional(seq('(', 'core', '=', $.integer_literal, ')'))),
    ),

    _locus_member: $ => choice(
      $.params_block,
      $.contract_block,
      $.bus_block,
      $.capacity_block,
      $.lifecycle_decl,
      $.mode_decl,
      $.failure_decl,
      $.closure_decl,
      $.function_decl,
      // GH #747 / #756: `const` and `type` are top-level declarations,
      // NOT locus members — but hale's parser still reads one in a
      // locus body so the checker can refuse it as a located error at
      // the keyword rather than a cascading parse failure. Kept here
      // for the same reason: the tree stays whole around the mistake.
      $.const_decl,
      $.type_decl,
      $.bindings_block,
      $.placement_block,
      $.topology_block,
      $.claims_block,
      $.birth_check_decl,
    ),

    // GH #382: the `claims { }` main-locus member — named
    // bundle-level sentences. The typechecker enforces main-only;
    // all introducers are contextual.
    claims_block: $ => seq(
      'claims',
      '{',
      repeat(choice($.claim_entry, $.adopt_entry)),
      '}',
    ),

    claim_entry: $ => seq(
      field('name', $.identifier),
      ':',
      field('form', $._claim_form),
      ';',
    ),

    // GH #409: `adopt Core;` — pull in a named constitution. Legal
    // only in a MAIN-LOCUS claims block (adoption fixes the world the
    // clauses are evaluated against, and a library seed closes none);
    // the typechecker enforces that, and rejects it outright inside a
    // `constitution` body.
    adopt_entry: $ => seq(
      'adopt',
      field('constitution', $.identifier),
      ';',
    ),

    _claim_form: $ => choice(
      $.forbid_form,
      $.only_edges_form,
      $.bound_form,
      $.require_form,
      $.cover_form,
      $.count_form,
    ),

    forbid_form: $ => seq(
      'forbid',
      'reaches',
      '(',
      $.claim_set,
      ',',
      $.claim_set,
      ')',
      repeat(choice(
        seq('via', '{', choice('calls', 'bus'),
            repeat(seq(',', choice('calls', 'bus'))),
            optional(','), '}'),
        seq('during', $.identifier),
        seq('avoiding', $.identifier),
      )),
    ),

    only_edges_form: $ => seq(
      'only',
      'edges',
      field('source', $.identifier),
      '->',
      field('target', $.identifier),
      '{',
      repeat(seq(choice('publish', 'subscribe'), $.topic_ref, ';')),
      '}',
    ),

    bound_form: $ => seq(
      'bound',
      $.effect_class_ref,
      '<=',
      $.integer_literal,
      'on',
      'paths',
      'from',
      field('source', $.identifier),
    ),

    // The endpoint forms are EXISTENTIAL over a group (`some`); the
    // GH #436 forms are UNIVERSAL over the closed world (`all`) —
    // `require sealed(all G)` (every member of the group is declared
    // `@sealed`) and `require attributed(all syscall)` (every user fn
    // directly performing an operation of the named BUILT-IN class
    // carries a user-declared class).
    require_form: $ => choice(
      seq(
        'require',
        choice('subscribes', 'publishes'),
        '(',
        'some',
        field('group', $.identifier),
        ',',
        'topic',
        $.topic_ref,
        ')',
      ),
      seq(
        'require',
        'sealed',
        '(',
        'all',
        field('group', $.identifier),
        ')',
      ),
      seq(
        'require',
        'attributed',
        '(',
        'all',
        // `publish` is a built-in effect class AND a hard keyword, so
        // it can't come through `identifier` — alias the keyword back
        // to an identifier node so consumers see one shape.
        field('class', choice($.identifier, alias('publish', $.identifier))),
        ')',
      ),
    ),

    cover_form: $ => seq(
      'cover',
      'topic',
      'in',
      'seed',
      '(',
      field('alias', $.identifier),
      ')',
      ':',
      'subscribed_by',
      '(',
      'some',
      field('group', $.identifier),
      ')',
    ),

    count_form: $ => seq(
      'count',
      choice('publishers', 'subscribers'),
      '(',
      'topic',
      $.topic_ref,
      ')',
      choice('==', '<=', '>='),
      $.integer_literal,
    ),

    claim_set: $ => choice(
      $.identifier,
      seq('effects', '(', $.effect_class_ref, ')'),
    ),

    topic_ref: $ => seq(
      $.identifier,
      repeat(seq('::', $.identifier)),
    ),

    effect_class_ref: $ => seq(
      $.identifier,
      optional(seq('(', choice($.identifier, '*'), ')')),
    ),

    // F.31 (2026-05-23): `placement { field: <spec>; ... }`
    // declares where each main-locus param field's locus
    // runs. Only valid on a `main locus`; the typechecker
    // enforces "field exists in params" and "no duplicate
    // field keys." The grammar accepts placement entries on
    // any locus; the typechecker rejects on non-main.
    placement_block: $ => seq(
      'placement',
      '{',
      repeat($.placement_entry),
      '}',
    ),

    // F.35 (2026-05-28): an optional `where <constraint>, ...`
    // suffix declaring operational constraints on the route
    // (v0.1: `async_io`).
    placement_entry: $ => seq(
      field('field', $.identifier),
      ':',
      field('spec', $.placement_spec),
      optional(seq(
        'where',
        $.placement_constraint,
        repeat(seq(',', $.placement_constraint)),
      )),
      ';',
    ),

    placement_constraint: $ => choice(
      'async_io',
    ),

    // Placement specs reuse the same surface as the legacy
    // `schedule_class` annotation, with the addition of an
    // optional named pool on cooperative: `cooperative(pool
    // = io)` opts a field's locus onto a named cooperative
    // pool worker thread instead of the default main pool.
    //
    // Topology Phase 1a–1c (2026-07-04/05): `pinned(...)` takes a
    // comma-separated attribute list — at most one affinity
    // (`core =` / `cores =` / `node =` / `l3 =`) plus an optional
    // `replicas = K`. Arity ("at most one affinity") is enforced
    // by the host parser, not the grammar.
    placement_spec: $ => choice(
      seq(
        'cooperative',
        optional(seq(
          '(',
          $.coop_attr,
          repeat(seq(',', $.coop_attr)),
          optional(','),
          ')',
        )),
      ),
      seq(
        'pinned',
        optional(seq(
          '(',
          $.pin_attr,
          repeat(seq(',', $.pin_attr)),
          optional(','),
          ')',
        )),
      ),
    ),

    pin_attr: $ => choice(
      $.pin_affinity,
      seq('replicas', '=', field('replicas', $.integer_literal)),
    ),

    // Pool affinity (2026-08-12): `cooperative` takes the same
    // affinity forms `pinned` does — they bind the POOL's worker
    // thread rather than a locus. `replicas` stays pinned-only.
    // "At most one affinity, at most one pool, entries naming one
    // pool must agree" is the typechecker's, not the grammar's.
    coop_attr: $ => choice(
      seq('pool', '=', field('pool', $.identifier)),
      $.pin_affinity,
    ),

    pin_affinity: $ => choice(
      seq('core', '=', field('core', $.integer_literal)),
      seq('cores', '=', field('cores', $.core_set)),
      seq('node', '=', field('node', $.integer_literal)),
      seq('l3', '=', field('l3', $.identifier)),
    ),

    // A range (`A..B` exclusive / `A..=B` inclusive) or an
    // explicit set (`{a, b, c}`) of INT literals — the cpuset
    // affinity mask. Placement is closed-world, so the set is
    // static.
    core_set: $ => choice(
      seq(
        $.integer_literal,
        choice('..', '..='),
        $.integer_literal,
      ),
      seq(
        '{',
        $.integer_literal,
        repeat(seq(',', $.integer_literal)),
        optional(','),
        '}',
      ),
    ),

    // Topology Phase 1b (2026-07-05): the `topology { }` block —
    // a declare-only description of the host's core partition
    // (NUMA nodes → L3 domains → core sets), referenced by
    // `pinned(node = N)` / `pinned(l3 = name)`. Main-locus only;
    // the host typechecker enforces id/name uniqueness and
    // non-overlap.
    topology_block: $ => seq(
      'topology',
      '{',
      repeat(choice($.reserve_decl, $.node_decl)),
      '}',
    ),

    reserve_decl: $ => seq(
      'reserve',
      'cores',
      field('cores', $.core_set),
      ';',
    ),

    node_decl: $ => seq(
      'node',
      field('id', $.integer_literal),
      '{',
      repeat($.l3_decl),
      '}',
    ),

    l3_decl: $ => seq(
      'l3',
      field('name', $.identifier),
      '{',
      'cores',
      field('cores', $.core_set),
      ';',
      '}',
    ),

    // F.27 v2 birth_check.
    birth_check_decl: $ => seq(
      'birth_check',
      '{',
      $._expression,
      '}',
      '->',
      'violate',
      field('closure_name', $.identifier),
      optional(seq('(', $._expression, ')')),
      ';',
    ),

    bindings_block: $ => seq(
      'bindings',
      '{',
      repeat(choice($.binding_entry, $.api_binding)),
      '}',
    ),

    // GH #527 B6: the topic may be an IMPORTED one, named through its
    // import alias — `catalog::Ticks: unix(...)`. A topic shared
    // between binaries lives in a seed both import, so the qualified
    // spelling is the common one.
    binding_entry: $ => seq(
      field('topic', $.qualified_name),
      ':',
      $._transport_spec,
      optional($.codec_spec),
      optional($.binding_where),
      ';',
    ),

    // GH #1106: the api binding — `api: unix(path, bound: N, on_full:
    // refuse, …) [, http(host, port, principals: P)] [, serve: [p, …]];`.
    // Binds the program's API (every subscribed topic a command, every
    // published topic a stream, every expose a read) rather than one
    // topic. `api` is CONTEXTUAL in hale, told from a topic by the `:`
    // after it; at most one per block, which is the checker's to say.
    // The path is an expression (a literal, or `self.<param>`).
    api_binding: $ => seq(
      'api',
      ':',
      'unix',
      '(',
      field('path', $._expression),
      repeat(seq(',', $.api_kwarg)),
      optional(','),
      ')',
      repeat(seq(',', choice($.api_http, $.api_serve))),
      ';',
    ),

    // Every kwarg is optional to the parser; the checker requires
    // `bound` / `on_full` and pairs `watch_bound` with `on_watch_full`.
    // Policy values stay identifiers, as `on_full` on a topic does —
    // the compiler owns the legal set (`refuse`, `drop_old` /
    // `drop_new`, `refuse` / `drop`).
    api_kwarg: $ => choice(
      seq(
        field('key', choice('bound', 'watch_bound')),
        ':',
        field('value', $.integer_literal),
      ),
      seq(
        field('key', choice('on_full', 'on_watch_full', 'on_unauthorized')),
        ':',
        field('value', $.identifier),
      ),
      // GH #1109: the membership source — a locus literal or one of
      // main's params, evaluated as a param default.
      seq(field('key', 'roles'), ':', field('value', $._expression)),
    ),

    // GH #1135: the binding's HTTP transport, one POST per request.
    api_http: $ => seq(
      'http',
      '(',
      field('host', $._expression),
      ',',
      field('port', $._expression),
      optional(seq(',', 'principals', ':', field('principals', $._expression))),
      optional(','),
      ')',
    ),

    // GH #1137: params of main whose locus another seed declared,
    // put on the surface beside the seed's own.
    api_serve: $ => seq(
      'serve',
      ':',
      '[',
      optional(seq(
        field('param', $.identifier),
        repeat(seq(',', field('param', $.identifier))),
        optional(','),
      )),
      ']',
    ),

    // F.36 Slice 2 (2026-05-28): `codec(JsonCodec { })` — pluggable
    // encode/decode for a cross-binary route that doesn't speak the
    // internal wire format. The named locus must structurally
    // provide `encode` / `decode`; the grammar just takes the
    // struct-literal shape. GH #1034: the codec (and an adapter
    // transport) may be an imported locus, `codec(lib::JsonCodec { })`.
    codec_spec: $ => seq(
      'codec',
      '(',
      field('codec', $.qualified_name),
      '{',
      optional(seq(
        $.struct_init,
        repeat(seq(',', $.struct_init)),
        optional(','),
      )),
      '}',
      ')',
    ),

    _transport_spec: $ => choice(
      $.unix_transport,
      $.shm_ring_transport,
      $.adapter_transport,
    ),

    unix_transport: $ => seq(
      'unix',
      '(',
      $.string_literal,
      repeat(seq(',', $.unix_kwarg)),
      ')',
    ),

    unix_kwarg: $ => seq('role', ':', choice('listen', 'connect')),

    shm_ring_transport: $ => seq(
      'shm_ring',
      '(',
      $.string_literal,
      repeat(seq(',', $.shm_ring_kwarg)),
      ')',
    ),

    shm_ring_kwarg: $ => choice(
      seq('slot_count', ':', $.integer_literal),
      seq('on_overflow', ':', $.overflow_policy),
      seq('layout', ':', $.identifier),
      seq('buffer_size', ':', $.integer_literal),
    ),

    overflow_policy: $ => choice('block', 'drop', 'fail'),

    adapter_transport: $ => seq(
      field('locus_name', $.qualified_name),
      '{',
      optional(seq(
        $.struct_init,
        repeat(seq(',', $.struct_init)),
        optional(','),
      )),
      '}',
    ),

    binding_where: $ => seq(
      'where',
      $.binding_constraint,
      repeat(seq(',', $.binding_constraint)),
    ),

    binding_constraint: $ => choice(
      'intra_process',
      'intra_machine',
      'cross_machine',
      'zero_copy',
    ),

    // ===========================================================
    // § 3. Params block
    // ===========================================================

    params_block: $ => seq(
      'params',
      '{',
      repeat($.param_decl),
      '}',
    ),

    param_decl: $ => seq(
      field('name', $.identifier),
      optional(seq(':', field('type', $._type_expr))),
      choice(
        seq('=', field('default', $._expression), ';'),
        seq(':', 'inferred', ';'),
        ';',   // required-shape: name: T;
      ),
    ),

    // ===========================================================
    // § 4. Contract block
    // ===========================================================

    contract_block: $ => seq(
      'contract',
      choice(
        seq(':', 'inferred', ';'),
        seq('{', repeat($.contract_member), '}'),
      ),
    ),

    // GH #1109: `@gated(role: R)` goes on an `expose` only — a `consume`
    // is the parent's read of its child, never a caller's, and hale's
    // parser refuses the pair.
    contract_member: $ => seq(
      choice(seq(optional($.gated_annotation), 'expose'), 'consume'),
      choice(
        seq(field('name', $.identifier), ':', field('type', $._type_expr), ';'),
        seq('inferred', ';'),
      ),
    ),

    // ===========================================================
    // § 5. Bus block
    // ===========================================================

    bus_block: $ => seq(
      'bus',
      '{',
      repeat($._bus_member),
      '}',
    ),

    _bus_member: $ => choice($.bus_subscribe, $.bus_publish),

    bus_subscribe: $ => seq(
      'subscribe',
      field('subject', $._bus_subject),
      'as',
      field('handler', $.identifier),
      optional(seq('of', 'type', field('type', $._type_expr))),
      optional($.bounded_clause),
      optional($.key_filter),
      ';',
    ),

    // Phase 3 routing keys: `where key == <rhs>` narrows delivery
    // to publishes carrying a matching key.
    //   `_`        — the catch-unmatched subscriber (only legal on a
    //                topic declaring `on_unmatched: fallback`)
    //   `replica`  — (2026-08-12) this instance's 0-based replica
    //                index, so K `pinned(replicas = K)` instances
    //                shard an Int-keyed topic with one subscribe
    //                line. Contextual in exactly this position.
    //   otherwise  — a literal, a const, or `self.<field>`.
    // Every filter shape requires a keyed topic; the typechecker
    // owns that, and which RHS forms a given topic admits.
    key_filter: $ => seq(
      'where',
      'key',
      '==',
      field('key', choice(
        $.wildcard_pattern,
        alias('replica', $.replica_key),
        $._expression,
      )),
    ),

    // GH #1109: a `publish` may carry `@gated(role: R)` — the role an
    // external watcher of the stream must hold. A subscription's gate
    // goes on the handler fn the `subscribe` names, not on the line.
    bus_publish: $ => seq(
      optional($.gated_annotation),
      'publish',
      field('subject', $._bus_subject),
      optional(seq('of', 'type', field('type', $._type_expr))),
      optional(seq('as', field('alias', $.identifier))),
      ';',
    ),

    _bus_subject: $ => choice($.string_literal, $.qualified_name),

    // ===========================================================
    // § 5b. Capacity block (F.22)
    // ===========================================================

    capacity_block: $ => seq(
      'capacity',
      '{',
      repeat($.capacity_slot),
      '}',
    ),

    capacity_slot: $ => seq(
      field('kind', choice('pool', 'heap')),
      field('name', $.identifier),
      'of',
      field('cell_type', $._type_expr),
      optional(seq('indexed_by', field('indexed_by', $.identifier))),
      optional(seq('as_parent_for', field('as_parent_for', $.identifier))),
      ';',
    ),

    // ===========================================================
    // § 6. Lifecycle blocks
    // ===========================================================

    lifecycle_decl: $ => seq(
      optional($.unbounded_annotation),
      field('kind', $._lifecycle_keyword),
      optional(seq('(', optional($._param_list), ')')),
      optional(seq('->', field('return_type', $._type_expr))),
      $.block,
    ),

    _lifecycle_keyword: $ => choice(
      'birth',
      'accept',
      // 2026-05-30: the death-side bookend of `accept` — one child
      // param, `release (c: Kid) { … }`. In the ebnf since then; never
      // modeled here until the lifecycle fixtures exercised it.
      'release',
      'run',
      'drain',
      'dissolve',
    ),

    // ===========================================================
    // § 7. Mode declarations
    // ===========================================================

    mode_decl: $ => seq(
      'mode',
      field('name', $._mode_name),
      optional(seq('(', optional($._param_list), ')')),
      optional(seq('->', field('return_type', $._type_expr))),
      $.block,
    ),

    _mode_name: $ => choice('bulk', 'harmonic', 'resolution'),

    // ===========================================================
    // § 8. Failure handler
    // ===========================================================

    failure_decl: $ => seq(
      'on_failure',
      '(',
      $._param_list,
      ')',
      $.block,
    ),

    // ===========================================================
    // § 9. Closure tests
    // ===========================================================

    closure_decl: $ => seq(
      'closure',
      field('name', $.identifier),
      '{',
      optional(seq($.closure_assertion, ';')),
      repeat($.closure_clause),
      '}',
    ),

    closure_assertion: $ => seq(
      $._expression,
      choice('~~', 'approx'),
      $._expression,
      'within',
      $._expression,
    ),

    closure_clause: $ => choice(
      seq('epoch', $._epoch_spec, ';'),
      seq('persists_through', '(', $._identifier_list, ')', ';'),
      seq('resets_on', '(', $._identifier_list, ')', ';'),
      // F.34 (2026-05-28, v1.x-WINDOWED): windowed reset — the
      // named captures reset once per epoch boundary.
      seq('resets_per_epoch', '(', $._identifier_list, ')', ';'),
      seq('captures', ':', $._identifier_list, ';'),
    ),

    _epoch_spec: $ => choice(
      'tick',
      seq('duration', '(', $._expression, ')'),
      'birth',
      'dissolve',
      'explicit',
      'inline',
    ),

    // ===========================================================
    // § 10. Perspective declaration
    // ===========================================================

    perspective_decl: $ => seq(
      'perspective',
      field('name', $.identifier),
      optional($.generic_params),
      '{',
      repeat($._perspective_member),
      '}',
    ),

    _perspective_member: $ => choice(
      $.params_block,
      seq('stable_when', $.block),
      seq('serialize_as', $._type_expr, ';'),
      // The perspective CONTRACT: bodyless method signatures (the
      // stable ABI a holder programs against, like an interface),
      // plus optional default-bodied methods and a bus surface
      // (Phase 2c bus contract).
      $.interface_method_sig,
      $.function_decl,
      $.bus_block,
    ),

    // ===========================================================
    // § 11. Type declarations
    // ===========================================================

    type_decl: $ => choice(
      // type T = type_expr;
      seq('type', field('name', $.identifier), optional($.generic_params),
          '=', field('aliased', $._type_expr), ';'),
      // type T { field: Type; ... }  (struct)
      seq('type', field('name', $.identifier), optional($.generic_params),
          '{', repeat($.struct_field), '}'),
      // type T = enum { A, B(int), ... };
      seq('type', field('name', $.identifier), optional($.generic_params),
          '=', 'enum', '{',
          $.enum_variant, repeat(seq(',', $.enum_variant)),
          optional(','), '}', ';'),
      // GH #1076: a scalar of the unit dialect — a quantity, a point,
      // an identity or a range. No generic params.
      seq('type', field('name', $.identifier), '=', $._scalar_body),
    ),

    // `[quantity | point | distinct] BASE [in DENOMINATION] [{ CLAUSE; … }]`
    // with at least one of the kind word, the `in` and the clause block
    // — with none of the three it is the alias form above, which is
    // where the shared `BASE` prefix splits (on `;`, `in` or `{`). A
    // clause block closes the declaration, so its `;` is optional.
    _scalar_body: $ => choice(
      seq(
        field('kind', $.scalar_kind),
        field('base', $._type_expr),
        optional(field('denomination', $.denomination)),
        $._scalar_end,
      ),
      seq(
        field('base', $._type_expr),
        field('denomination', $.denomination),
        $._scalar_end,
      ),
      seq(
        field('base', $._type_expr),
        field('clauses', $.scalar_clauses),
        optional(';'),
      ),
    ),

    _scalar_end: $ => choice(
      seq(field('clauses', $.scalar_clauses), optional(';')),
      ';',
    ),

    // CONTEXTUAL in hale: the kind only when a type expression follows
    // it, so `type P = point;` aliases a type named `point` there. Here
    // the word is a keyword right after `type X =`, which costs that
    // one alias spelling (see STATUS.md, 2026-10-06).
    scalar_kind: $ => choice('quantity', 'point', 'distinct'),

    // A unit and a positive integer multiple of it: `in ns`, `in 100ms`,
    // `in 100 ms` — the joined and the spaced spelling give one tree.
    denomination: $ => seq(
      'in',
      choice(
        field('unit', $._unit_name),
        seq(field('multiple', $.integer_literal), field('unit', $._unit_name)),
        seq(field('multiple', $._magnitude), field('unit', $._unit_name)),
      ),
    ),

    // Each clause at most once (hale's parser says so; the grammar
    // doesn't count). `range`, `round` and `origin` are words of this
    // block only.
    scalar_clauses: $ => seq(
      '{',
      repeat(choice($.range_clause, $.round_clause, $.origin_clause)),
      '}',
    ),

    // `range: 0..256;` / `range: 0..=255;` — today's range expression.
    range_clause: $ => seq('range', ':', field('range', $.range_expr), ';'),

    // `round: half_even;`. One of the five rounding policies reads as
    // the `policy` node the `or` position uses; any other name stays an
    // identifier, since hale parses one and refuses it in the checker
    // ("`flor` is not a rounding policy").
    round_clause: $ => seq(
      'round',
      ':',
      field('policy', choice($.policy, $.identifier)),
      ';',
    ),

    // `origin: 273_150 mK;` / `origin: 273150mK;` / `origin: -40 mK;` —
    // where a point's zero sits, as a count of its own denomination.
    origin_clause: $ => seq(
      'origin',
      ':',
      optional('-'),
      choice(
        seq(field('value', $.integer_literal), field('unit', $._unit_name)),
        seq(field('value', $._magnitude), field('unit', $._unit_name)),
      ),
      ';',
    ),

    struct_field: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type_expr),
      optional(seq('=', field('default', $._expression))),
      // Go-style metadata tag — a backtick raw string. Shares the
      // backtick token with time literals (which only appear in
      // expression position); here it's a field tag.
      optional(field('tag', $.time_literal)),
      ';',
    ),

    enum_variant: $ => seq(
      field('name', $.identifier),
      optional(seq('(', $._type_expr, repeat(seq(',', $._type_expr)), ')')),
    ),

    generic_params: $ => seq(
      '<',
      $.generic_param,
      repeat(seq(',', $.generic_param)),
      '>',
    ),

    generic_param: $ => seq(
      field('name', $.identifier),
      optional(seq(':', field('constraint', $._type_expr))),
    ),

    generic_args: $ => seq(
      '<',
      $._type_expr,
      repeat(seq(',', $._type_expr)),
      '>',
    ),

    // ===========================================================
    // § 12. Type expressions
    // ===========================================================

    _type_expr: $ => choice(
      $.primitive_type,
      $.named_type,
      $.projection_type,
      $.perspective_type,
      $.array_type,
      $.bounded_type,
      $.tuple_type,
      $.function_type,
      $.unit_type,
      seq('(', $._type_expr, ')'),
    ),

    // `()` — the unit type. Per spec/types.md: "If a fn omits
    // `-> T`, the return type defaults to `()`. Explicit `-> T`
    // is required for any non-unit return." Some stdlib fns
    // spell `-> ()` explicitly when paired with `fallible(E)`
    // so the fallible-success-type is unambiguous.
    unit_type: $ => seq('(', ')'),

    primitive_type: $ => choice(
      'Int', 'Uint', 'Float', 'Decimal', 'String', 'Bool',
      'Time', 'Duration', 'Bytes',
      'BytesView', 'StringView',
    ),

    named_type: $ => seq($.qualified_name, optional($.generic_args)),

    projection_type: $ => seq(
      choice('Rich', 'Chunked', 'Recognition'),
      '<',
      $._type_expr,
      '>',
    ),

    // Perspectives Phase 2a: `perspective(P)` — a live-rebindable
    // handle to the contract P, dispatched through a program-global
    // slot. Used as a param field type on a holder locus. GH #724: P
    // may be an imported contract, `perspective(lib::Routing)`.
    perspective_type: $ => seq(
      'perspective',
      '(',
      field('contract', $.qualified_name),
      ')',
    ),

    array_type: $ => seq(
      '[',
      $._type_expr,
      optional(seq(';', $._expression)),
      ']',
    ),

    // `bounded[T; N]` (2026-07-02) — the fixed-capacity counted
    // collection, laid out inline as `{ i64 len, [N x T] }`.
    // Capacity is a positive integer literal, not an expression.
    // Distinct from the `bounded(N)` topic/subscribe clause, which
    // shares the word: this one is `bounded` followed by `[`, in
    // type position only.
    bounded_type: $ => seq(
      'bounded',
      '[',
      $._type_expr,
      ';',
      field('capacity', $.integer_literal),
      ']',
    ),

    tuple_type: $ => seq(
      '(',
      $._type_expr,
      ',',
      $._type_expr,
      repeat(seq(',', $._type_expr)),
      ')',
    ),

    function_type: $ => seq(
      'fn',
      '(',
      optional(seq($._type_expr, repeat(seq(',', $._type_expr)))),
      ')',
      optional(seq('->', $._type_expr)),
    ),

    qualified_name: $ => seq(
      $.identifier,
      repeat(seq('::', $.identifier)),
    ),

    // ===========================================================
    // § 13. Const and function decls
    // ===========================================================

    const_decl: $ => seq(
      'const',
      field('name', $.identifier),
      ':',
      field('type', $._type_expr),
      '=',
      field('value', $._expression),
      ';',
    ),

    function_decl: $ => seq(
      optional($.fn_decorators),
      'fn',
      field('name', $.identifier),
      optional($.generic_params),
      '(',
      optional($._param_list),
      ')',
      optional(seq('->', field('return_type', $._type_expr))),
      optional($.fallible_marker),
      $.block,
    ),

    // @ffi("c") fn name(params) -> ret ;
    ffi_function_decl: $ => seq(
      $.ffi_annotation,
      'fn',
      field('name', $.identifier),
      '(',
      optional($._param_list),
      ')',
      optional(seq('->', field('return_type', $._type_expr))),
      ';',
    ),

    ffi_annotation: $ => seq(
      '@',
      'ffi',
      '(',
      $.string_literal,
      ')',
    ),

    // fn decorators (hale >= v0.11.x): `@export fn` (wasm module
    // export), `@unbounded fn` (memory-bound carve-out — also valid
    // on a lifecycle hook), `@budget(alloc_per_call = N) fn` (the
    // enforced allocation ceiling), `@hot fn` (hot-path
    // certification; the hale parser lets a `@budget` follow it:
    // `@hot @budget(alloc_per_call = 0) fn`). The editor grammar is
    // deliberately permissive — any sequence of decorators parses;
    // stacking legality is the compiler's job.
    fn_decorators: $ => repeat1(choice(
      $.export_annotation,
      $.unbounded_annotation,
      $.budget_annotation,
      $.hot_annotation,
      $.effects_annotation,
      $.no_effect_annotation,
      $.no_panic_annotation,
      $.deterministic_annotation,
      $.gated_annotation,
    )),

    // GH #1109: `@gated(role: R)` — the role a caller through the api
    // binding must hold. On a subscribed handler (here, as a fn
    // decorator), an `expose` member or a `publish` member; on any
    // other fn the checker refuses it, the parser does not.
    gated_annotation: $ => seq(
      '@',
      'gated',
      '(',
      'role',
      ':',
      field('role', $.identifier),
      ')',
    ),

    // #265 / #345: `@effects(<clause>: {A, B})`. Clause names are
    // bare idents rather than a fixed choice — `none` / `publish` /
    // `causes` / `depends` / `is` today, and the compiler owns which
    // are legal. Class names include user-declared ones, so the set
    // members cannot be an enumerated keyword list either.
    effects_annotation: $ => seq(
      '@',
      'effects',
      '(',
      $._effects_clause,
      repeat(seq(',', $._effects_clause)),
      ')',
    ),

    _effects_clause: $ => seq(
      field('clause', $.identifier),
      ':',
      $.effect_class_set,
    ),

    // Members are effect_class_refs, not bare identifiers: an
    // indexed family names its index here — `@effects(is: {
    // knowledge(delta) })`, or `knowledge(*)` for the whole
    // family — the same shape a claim's `effects(<class>)` takes.
    effect_class_set: $ => seq(
      '{',
      optional(seq(
        $.effect_class_ref,
        repeat(seq(',', $.effect_class_ref)),
      )),
      '}',
    ),

    // `@no_syscall` / `@no_block` / `@no_ffi` / `@no_publish` /
    // `@no_spawn` / `@no_recursion` — parse-time sugar for the
    // `@effects(none: …)` forms.
    no_effect_annotation: $ => seq(
      '@',
      token(seq('no_', choice(
        'syscall', 'block', 'ffi', 'publish', 'spawn', 'recursion',
      ))),
    ),

    // A different analysis (disposition coverage), not effect sugar.
    no_panic_annotation: $ => seq('@', 'no_panic'),

    deterministic_annotation: $ => seq('@', 'deterministic'),

    unbounded_annotation: $ => seq('@', 'unbounded'),

    // `@budget(alloc_per_call = 0, stack_bytes = 4096)` — one or more
    // comma-separated dimensions, not just `alloc_per_call`. The
    // documented set is alloc_per_call / stack_bytes / block_points /
    // publish / fanout, plus user effect-class dimensions which may be
    // parameterized (`knowledge(delta) = 0`). Keys stay idents rather
    // than a keyword list: the compiler owns which are legal, and
    // hard-coding one name here is what made `@budget(stack_bytes = N)`
    // an ERROR node in the corpus.
    budget_annotation: $ => seq(
      '@',
      'budget',
      '(',
      $.budget_dim,
      repeat(seq(',', $.budget_dim)),
      optional(','),
      ')',
    ),

    budget_dim: $ => seq(
      field('key', choice($.identifier, 'publish')),
      optional(seq('(', field('arg', choice($.identifier, '*')), ')')),
      '=',
      field('value', $.integer_literal),
    ),

    hot_annotation: $ => seq('@', 'hot'),

    secret_annotation: $ => seq('@', 'secret'),

    fallible_marker: $ => seq(
      'fallible',
      '(',
      field('payload_type', $._type_expr),
      ')',
    ),

    _param_list: $ => seq(
      $.parameter,
      repeat(seq(',', $.parameter)),
    ),

    // GH #265: `@secret name: T` taints the parameter. It is the one
    // attribute hale's `parse_param` reads.
    parameter: $ => seq(
      optional($.secret_annotation),
      field('name', $.identifier),
      ':',
      field('type', $._type_expr),
      optional(seq('=', field('default', $._expression))),
    ),

    // ===========================================================
    // § 14. Statements + blocks
    // ===========================================================

    block: $ => seq(
      '{',
      repeat($._statement),
      optional($._expression),     // trailing expression (Phase 2b)
      '}',
    ),

    _statement: $ => choice(
      $.let_stmt,
      $.assign_stmt,
      $.send_stmt,
      $.each_stmt,
      $.shm_write_stmt,
      $.if_stmt,
      $.match_stmt,
      $.for_stmt,
      $.while_stmt,
      $.return_stmt,
      $.break_stmt,
      $.continue_stmt,
      $.yield_stmt,
      $.terminate_stmt,
      $.reperspective_stmt,
      $.recovery_stmt,
      $.violate_stmt,
      $.fail_stmt,
      // A statement that starts with `{` is a nested block, never an
      // expression — hale's `parse_stmt` — so it wins over the block
      // expression wherever both fit (`{ {x} }`, `{ a } (b)`).
      prec(1, $.block),
      $.expr_stmt,
    ),

    // 2026-05-30 per-child terminate: ends this locus's own
    // lifecycle from within a handler/run body.
    terminate_stmt: $ => seq('terminate', ';'),

    // Perspectives Phase 2b (2026-06): `reperspective self.slot
    // as NewImpl;` — the live redeploy. Swaps the implementation
    // behind a perspective slot at pointer-flip cost. GH #724: the
    // impl may be an imported locus, `as lib::Double`.
    reperspective_stmt: $ => seq(
      'reperspective',
      'self',
      '.',
      field('slot', $.identifier),
      'as',
      field('impl', $.qualified_name),
      ';',
    ),

    let_stmt: $ => seq(
      'let',
      optional('mut'),
      choice(
        field('name', $.identifier),
        // Tuple destructure: `let (q, r) = divmod(23, 4);`. Names
        // only — hale's parse_let_stmt takes idents here, not
        // nested patterns — with an optional trailing comma.
        field('names', $.let_tuple_names),
      ),
      optional(seq(':', field('type', $._type_expr))),
      '=',
      field('value', $._expression),
      ';',
    ),

    let_tuple_names: $ => seq(
      '(',
      $.identifier,
      repeat(seq(',', $.identifier)),
      optional(','),
      ')',
    ),

    assign_stmt: $ => seq(
      field('target', $.lvalue),
      field('op', $._assign_op),
      field('value', $._expression),
      ';',
    ),

    _assign_op: $ => choice(
      '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
    ),

    lvalue: $ => seq(
      choice($.identifier, 'self'),
      repeat(choice(
        seq('.', $.identifier),
        seq('[', $._expression, ']'),
      )),
    ),

    send_stmt: $ => prec(PREC.SEND, seq(
      field('subject', $._expression),
      '<-',
      field('payload', $._expression),
      ';',
    )),

    // The `each { … }` chain terminal — the one place a block is an
    // argument. `users.filter(it.age >= 18).each { … }` is
    // block-shaped, so like `while` / `if` it stands as a statement
    // with the trailing `;` optional.
    //
    // Deliberately NOT keyed on the literal word `each`: a rule led
    // by that token would reserve it, and `x.each` as an ordinary
    // field read would stop parsing — the trap `sum` / `prod` fell
    // into. So the shape is "any field access followed by a block,"
    // which accepts a little more than hale does (hale claims the
    // block only after `.each`). Over-acceptance is the safe
    // direction here: it costs a highlighter nothing, and hale owns
    // the rejection.
    each_stmt: $ => seq(
      field('chain', $.field_expr),
      field('body', $.block),
      optional(';'),
    ),

    // Zero-copy ring producer: `Recs.write(max) { w => … ; len }`.
    // Reserves up to `max` bytes, binds a writable view over the
    // slot, and commits the byte count the body's tail expression
    // yields. Same reasoning as each_stmt on not reserving `write`:
    // the `IDENT =>` header is what distinguishes this from a
    // block-argument call, and that's enough.
    shm_write_stmt: $ => seq(
      field('target', $.call_expr),
      '{',
      field('binding', $.identifier),
      '=>',
      repeat($._statement),
      optional($._expression),
      '}',
      optional(';'),
    ),

    if_stmt: $ => prec.right(seq(
      'if',
      field('condition', $._expression),
      field('then', $.block),
      repeat(seq('else', 'if', $._expression, $.block)),
      optional(seq('else', field('else', $.block))),
    )),

    match_stmt: $ => seq(
      'match',
      field('scrutinee', $._expression),
      '{',
      $.match_arm,
      repeat(seq(',', $.match_arm)),
      optional(','),
      '}',
    ),

    match_arm: $ => seq(
      field('pattern', $._pattern),
      optional(seq('if', field('guard', $._expression))),
      '->',
      // A block body is an `_expression` (see there).
      field('body', $._expression),
    ),

    _pattern: $ => choice(
      $.literal_pattern,
      $.wildcard_pattern,
      $.binding_pattern,
      $.constructor_pattern,
      $.tuple_pattern,
    ),

    literal_pattern: $ => choice(
      $.integer_literal,
      $.float_literal,
      $.string_literal,
      'true',
      'false',
      'nil',
    ),

    wildcard_pattern: $ => '_',

    binding_pattern: $ => $.identifier,

    constructor_pattern: $ => seq(
      $.qualified_name,
      optional(seq('(', $._pattern_list, ')')),
    ),

    tuple_pattern: $ => seq(
      '(',
      $._pattern,
      ',',
      $._pattern,
      repeat(seq(',', $._pattern)),
      ')',
    ),

    _pattern_list: $ => seq($._pattern, repeat(seq(',', $._pattern))),

    for_stmt: $ => seq(
      'for',
      field('var', $.identifier),
      'in',
      field('iter', $._expression),
      field('body', $.block),
    ),

    while_stmt: $ => seq(
      'while',
      field('condition', $._expression),
      field('body', $.block),
    ),

    return_stmt: $ => seq('return', optional($._expression), ';'),

    break_stmt: $ => seq('break', ';'),

    continue_stmt: $ => seq('continue', ';'),

    yield_stmt: $ => seq('yield', ';'),

    fail_stmt: $ => seq('fail', $._expression, ';'),

    recovery_stmt: $ => seq(
      $._recovery_op,
      '(',
      optional($._argument_list),
      ')',
      optional($.recovery_modifier),
      ';',
    ),

    _recovery_op: $ => choice(
      'restart',
      'restart_in_place',
      'drain',
      'dissolve',
      'quarantine',
      'reorganize',
      'bubble',
    ),

    recovery_modifier: $ => choice(
      seq('for', $._expression),
      seq('until', $._expression),
    ),

    violate_stmt: $ => seq(
      'violate',
      field('closure_name', $.identifier),
      optional(seq('with', field('payload', $._expression))),
      ';',
    ),

    expr_stmt: $ => seq($._expression, ';'),

    // ===========================================================
    // § 15. Expressions — precedence ordered
    // ===========================================================

    _expression: $ => choice(
      $.or_disposition_expr,
      $.range_expr,
      $.binary_expr,
      $.unary_expr,
      $.call_expr,
      $.conversion,
      $.field_expr,
      $.index_expr,
      $.path_expr,
      $.struct_literal,
      // locus instantiation is syntactically identical to a
      // struct literal — both lower to `Name { field: val, ... }`.
      // The distinction is semantic (does Name resolve to a
      // locus or a type?), not syntactic. Consumers
      // (lotus_viz, semantic-analyzer) make the call at
      // tree-walk time.
      $.tuple_expr,
      $.array_expr,
      $.if_expr,
      // Gap C (hale 67-match-expression): match in value position.
      // A distinct rule from match_stmt, mirroring if_expr /
      // if_stmt — the two overlap for a whole `match … { … }`, so
      // the pair is a declared conflict.
      $.match_expr,
      // A block is a primary expression in hale (`parse_primary` takes
      // `{` as `Expr::Block`): `let x = { …; v };`, a field default
      // `= { …; Slot { } }`, an `or { … }` substitute. At the start of
      // a statement `{` is a block STATEMENT, as in hale's
      // `parse_stmt`; see `_statement`.
      $.block,
      $.parenthesized,
      $.self_expr,
      $.identifier,
      $._literal,
    ),

    parenthesized: $ => seq('(', $._expression, ')'),

    self_expr: $ => 'self',

    // Range — used inside index brackets for slicing, e.g.
    // `s[from..total]`. Per spec/precedence.md range is level 1
    // non-assoc; we use prec.left for tree-sitter happiness
    // since GLR doesn't need explicit non-assoc enforcement at
    // this level. Half-open ranges (`..end` / `start..`) are
    // not in stdlib usage today; add them when a workload
    // surfaces the need.
    range_expr: $ => prec.left(1, seq(
      field('start', $._expression),
      field('op', choice('..', '..=')),
      field('end', $._expression),
    )),

    or_disposition_expr: $ => prec.right(PREC.OR_DISP, seq(
      field('expr', $._expression),
      'or',
      field('disposition', choice(
        $.raise_disposition,
        $.discard_disposition,
        $.fail_disposition,
        // GH #1076: after a narrowing (`d.in(s) or floor`, `Session(n)
        // or clamp`, `spread / 2 or half_even`) a bare policy word says
        // what becomes of the remainder or of the value outside.
        $.policy,
        // Includes a BLOCK substitute, `or { seen = err.kind; -1 }`:
        // hale parses the substitute with the general expression
        // parser, and a block is an expression there.
        $._expression,
      )),
    )),

    raise_disposition:   $ => 'raise',
    discard_disposition: $ => 'discard',
    fail_disposition:    $ => seq('fail', $._expression),

    // The five roundings a ratio's narrowing takes and the two a
    // range's does. hale's parser reads the word as a bare identifier
    // and the checker treats it as the policy only where it ENDS the
    // `or` — a local of that name is written `or (floor)`. Here the
    // word is a keyword right after `or`: `or (floor)` stays an
    // identifier in parentheses, but a CALL of a fn named like a
    // policy right after `or` (`or floor(x)`) no longer parses —
    // see STATUS.md, 2026-10-06. `raise` keeps its own node above.
    policy: $ => choice(
      'floor', 'ceil', 'trunc', 'half_even', 'half_up', 'clamp', 'wrap',
    ),

    // GH #1076: `x.in(D)` — `x` at `D`'s denomination, a unit (`.in(s)`)
    // or a multiple of one (`.in(100ms)`). `in` is a hard keyword, so
    // this is its own form rather than a field access; hale reads it as
    // a method call whose name is `in`. (`x.split(u)` is NOT keyed here:
    // it is an ordinary method call, indistinguishable from
    // `line.split(",")`, and a rule led by `split` would steal the word
    // — the `sum` / `prod` trap.)
    conversion: $ => prec(PREC.CALL, seq(
      field('value', $._expression),
      '.',
      'in',
      '(',
      field('unit', choice($._unit_name, $.quantity_literal)),
      ')',
    )),

    binary_expr: $ => {
      const table = [
        [PREC.OR,      '||'],
        [PREC.AND,     '&&'],
        [PREC.EQ,      '=='],
        [PREC.EQ,      '!='],
        [PREC.CMP,     '<'],
        [PREC.CMP,     '>'],
        [PREC.CMP,     '<='],
        [PREC.CMP,     '>='],
        [PREC.BIT_OR,  '|'],
        [PREC.BIT_XOR, '^'],
        [PREC.BIT_AND, '&'],
        [PREC.SHIFT,   '<<'],
        [PREC.SHIFT,   '>>'],
        [PREC.ADD,     '+'],
        [PREC.ADD,     '-'],
        [PREC.MUL,     '*'],
        [PREC.MUL,     '/'],
        [PREC.MUL,     '%'],
      ];
      return choice(...table.map(([p, op]) =>
        prec.left(p, seq(
          field('left', $._expression),
          field('op', op),
          field('right', $._expression),
        )),
      ));
    },

    unary_expr: $ => prec.right(PREC.UNARY, seq(
      field('op', choice('-', '!', '~')),
      field('operand', $._expression),
    )),

    call_expr: $ => prec(PREC.CALL, seq(
      field('callee', $._expression),
      '(',
      optional($._argument_list),
      ')',
    )),

    field_expr: $ => prec(PREC.CALL, seq(
      field('object', $._expression),
      '.',
      field('member', $._member_name),
    )),

    index_expr: $ => prec(PREC.CALL, seq(
      field('object', $._expression),
      '[',
      field('index', $._expression),
      ']',
    )),

    path_expr: $ => prec(PREC.CALL, seq(
      field('object', $._expression),
      '::',
      field('member', $._member_name),
    )),

    // member_name admits framework-vocabulary keywords post-dot.
    _member_name: $ => choice(
      $.identifier,
      // Numeric tuple-field access: `pair.0`, `pair.1`. hale lexes
      // the digits as an IntLit and hands the digit string on as
      // the member name; the tree keeps it as the literal it lexed.
      $.integer_literal,
      'bulk', 'harmonic', 'resolution',
      'closure', 'locus', 'params', 'contract',
      'bus', 'capacity', 'tier', 'projection',
      'perspective', 'type',
    ),

    if_expr: $ => prec.right(seq(
      'if',
      field('condition', $._expression),
      field('then', $.block),
      'else',
      field('else', choice($.if_expr, $.block)),
    )),

    // `match` in value position (hale 67-match-expression). Same
    // body as match_stmt — hale's own grammar.ebnf spells it
    // `match_expr = match_stmt` — but a separate rule, so the
    // statement and expression readings stay distinguishable in
    // the tree the way if_stmt / if_expr do.
    match_expr: $ => seq(
      'match',
      field('scrutinee', $._expression),
      '{',
      $.match_arm,
      repeat(seq(',', $.match_arm)),
      optional(','),
      '}',
    ),

    // `sum(x)` / `prod(x)` — the reduction expressions closure
    // assertions and capacity computations use — deliberately have
    // NO rule of their own: they parse as ordinary calls.
    //
    // They used to, and the keyword stole the word. `sum` and
    // `prod` are CONTEXTUAL in hale, but a rule led by the literal
    // token makes tree-sitter prefer the keyword wherever an
    // expression may start — so `sum = sum + n;` and `f(sum)` were
    // hard parse errors, and a local named `sum` is ordinary in the
    // corpus (07, 22, 50, 55 all failed on exactly this). A call
    // shape costs nothing: highlights.scm colours the callee by
    // name instead, and consumers that cared about the node can
    // match `call_expr` with a `sum`/`prod` callee.

    tuple_expr: $ => seq(
      '(',
      $._expression,
      ',',
      $._expression,
      repeat(seq(',', $._expression)),
      ')',
    ),

    array_expr: $ => seq(
      '[',
      choice(
        optional(seq($._expression, repeat(seq(',', $._expression)))),
        seq($._expression, ';', $.integer_literal),
      ),
      ']',
    ),

    struct_literal: $ => seq(
      field('name', $.qualified_name),
      '{',
      optional(seq(
        $.struct_init,
        repeat(seq(',', $.struct_init)),
        optional(','),
      )),
      '}',
    ),

    struct_init: $ => seq(
      field('field', $.identifier),
      ':',
      field('value', $._expression),
    ),

    _argument_list: $ => seq(
      $._expression,
      repeat(seq(',', $._expression)),
    ),

    _identifier_list: $ => seq(
      $.identifier,
      repeat(seq(',', $.identifier)),
    ),

    // ===========================================================
    // § 16. Lexical tokens
    // ===========================================================

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    _literal: $ => choice(
      $.integer_literal,
      $.float_literal,
      $.decimal_literal,
      $.string_literal,
      $.fstring_literal,
      $.bytes_literal,
      $.quantity_literal,
      $.time_literal,
      $.boolean_literal,
      $.nil_literal,
    ),

    integer_literal: $ => token(choice(
      /[0-9][0-9_]*/,
      /0x[0-9a-fA-F_]+/,
      /0o[0-7_]+/,
      /0b[01_]+/,
    )),

    // `3.14`, `1.0e-3`, and (as hale's lexer reads it) an exponent with
    // no fraction, `3e5`: an `e` / `E` is an exponent only when a digit,
    // or a sign and a digit, follows it — any other `e` begins a
    // quantity literal's unit (`2EUR`), which src/scanner.c decides.
    float_literal: $ => token(choice(
      seq(
        /[0-9][0-9_]*/,
        '.',
        /[0-9][0-9_]*/,
        optional(/[eE][+-]?[0-9]+/),
        optional(/f32|f64/),
      ),
      seq(/[0-9][0-9_]*/, /[eE][+-]?[0-9]+/),
    )),

    // Decimal — `d` suffix on a numeric literal. `3d` stays the Decimal
    // `3`: the scanner declines a `d` with no word character after it,
    // and `3day` (the unit `day`) never reaches this token.
    decimal_literal: $ => token(seq(
      /[0-9][0-9_]*/,
      optional(seq('.', /[0-9][0-9_]*/)),
      optional(/[eE][+-]?[0-9]+/),
      'd',
    )),

    // String / bytes literals MUST be token() so the lexer
    // consumes them atomically — otherwise `//` inside a URL
    // string is matched as a `line_comment` from `extras` and
    // the parse blows up.
    string_literal: $ => token(choice(
      // Triple-quoted multi-line: """...""".
      seq('"""', repeat(choice(/[^"]/, /"[^"]/, /""[^"]/)), '"""'),
      // Raw string: r"..." — no escape processing.
      seq('r"', repeat(/[^"]/), '"'),
      // Regular string with escapes. hale's `lex_string` runs to the
      // next unescaped `"`, newlines included: a string may span lines.
      seq('"', repeat(choice(
        /[^"\\]/,
        seq('\\', /./),
      )), '"'),
    )),

    // Same body as a string (`lex_bytes`), newlines included.
    bytes_literal: $ => token(seq(
      'b"',
      repeat(choice(
        /[^"\\]/,
        seq('\\', /./),
      )),
      '"',
    )),

    // GH #1076: a quantity literal — a decimal integer written against
    // a unit's name with no space: `500ms`, `3bp`, `1_250_000USD`,
    // `1day`. It replaces the duration literal: the time units are the
    // stdlib's ordinary `unit` declarations (`ns us ms s min h day`), so
    // `m` and `d` are no longer time suffixes (`3d` is the Decimal `3`,
    // `5m` the unit `m` the checker refuses), and the old compound
    // `1h30m` reads, as in hale, as ONE literal of the unit `h30m`.
    // `1_250_000 USD`, two tokens, is a parse error, as in hale.
    quantity_literal: $ => seq(
      field('magnitude', $._magnitude),
      field('unit', $._unit_name),
    ),

    // ISO-8601 in backticks.
    time_literal: $ => token(seq('`', /[^`]+/, '`')),

    boolean_literal: $ => choice('true', 'false'),

    nil_literal: $ => 'nil',

    // ---- Comments ----

    line_comment: $ => token(seq('//', /[^\n]*/)),

    block_comment: $ => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),

    doc_comment: $ => token(choice(
      seq('///', /[^\n]*/),
      seq('/**', /[^*]*\*+([^/*][^*]*\*+)*/, '/'),
    )),
  },
});
