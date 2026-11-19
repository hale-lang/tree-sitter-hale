// External scanner for tree-sitter-hale. Five tokens.
//
// QUANTITY_MAGNITUDE: the MAGNITUDE of a quantity literal (`500ms`, `3bp`,
// `1_250_000USD`, GH #1076). The grammar reads the unit after it as an
// ordinary identifier, so a highlighter can colour the two halves
// differently; this scanner exists because deciding where a magnitude
// ends needs lookahead the tree-sitter DSL cannot express. It mirrors
// `lex_number` in hale's crates/hale-syntax/src/lexer.rs:
//
//   - `0x` / `0o` / `0b` (either case) starts a radix integer, never a
//     magnitude;
//   - a `.` after the digits makes a Float (or a range / field access),
//     never a magnitude;
//   - `e` / `E` followed by a digit, or by a sign and a digit, is a
//     Float's exponent (`3e5`); any other `e` begins a unit (`2EUR`);
//   - `d` with no letter, digit or `_` after it is the Decimal suffix
//     (`3d`); `3day` is a quantity of the unit `day`;
//   - any other letter right after the digits begins a unit.
//
// Returning false hands the text back to the internal lexer, which
// lexes the integer / float / decimal literal as before.
//
// FSTRING_LITERAL: a whole `f"…"`, mirroring `lex_fstring`. Outside
// braces it is a string (`\X` escapes, newlines allowed, `{{` / `}}`
// literal braces). A lone `{` opens an interpolation that runs to its
// depth-matched `}`; inside it a bare `"` is an ordinary character —
// it neither ends the f-string nor hides braces — and only `\"` toggles
// the "inside a string" state in which `{` / `}` don't count. So
// `f"tuple = {(1, "two", 3.5)}"` is one literal, as in hale.
//
// RAW_STRING: `r"…"`, `r#"…"#`, `r##"…"##` (tokens.md § Raw strings, GH
// #1948). No escapes; it closes at the first `"` followed by as many `#`
// as opened it, so `r#"say "hi""#` carries its quotes. The count is
// what the DSL can't express.
//
// BLOCK_STRING: a fence of three or more `"` that ends its line (spaces
// and tabs may follow it), raw lines, and the first line whose first
// characters after spaces and tabs are a run of exactly as many `"`
// (tokens.md § Block strings). Whatever follows that run is ordinary
// source (`""";`, `""")`). A fence not ending its line is not a block
// string, and the internal lexer reads the quotes as before (`""` is
// the empty string).
//
// RECOVERY_OP: `restart`, `restart_in_place`, `quarantine`,
// `reorganize` or `bubble`, when a `(` follows it. The words are
// contextual (F.43): a keyword at statement head before `(`, a name
// anywhere else (`restart = true;`). A literal token in grammar.js
// would take the word wherever a statement may start.

#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <wctype.h>

enum TokenType {
  QUANTITY_MAGNITUDE,
  FSTRING_LITERAL,
  RAW_STRING,
  BLOCK_STRING,
  RECOVERY_OP,
};

static inline bool is_digit(int32_t c) { return c >= '0' && c <= '9'; }

static inline bool is_ascii_alpha(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

static inline bool is_word_char(int32_t c) {
  return is_ascii_alpha(c) || is_digit(c) || c == '_';
}

void *tree_sitter_hale_external_scanner_create(void) { return NULL; }

void tree_sitter_hale_external_scanner_destroy(void *payload) { (void)payload; }

unsigned tree_sitter_hale_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_hale_external_scanner_deserialize(void *payload, const char *buffer,
                                                   unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

// At `f`. An unterminated literal is not a token (hale refuses it too).
static bool scan_fstring(TSLexer *lexer) {
  lexer->advance(lexer, false);
  if (lexer->lookahead != '"') return false;
  lexer->advance(lexer, false);

  for (;;) {
    if (lexer->eof(lexer)) return false;
    switch (lexer->lookahead) {
      case '"':
        lexer->advance(lexer, false);
        lexer->mark_end(lexer);
        lexer->result_symbol = FSTRING_LITERAL;
        return true;
      case '\\':
        lexer->advance(lexer, false);
        if (lexer->eof(lexer)) return false;
        lexer->advance(lexer, false);
        break;
      case '{': {
        lexer->advance(lexer, false);
        if (lexer->lookahead == '{') {  // `{{`: a literal brace
          lexer->advance(lexer, false);
          break;
        }
        unsigned depth = 1;
        bool in_str = false;
        while (depth > 0) {
          if (lexer->eof(lexer)) return false;
          int32_t c = lexer->lookahead;
          if (c == '\\') {
            lexer->advance(lexer, false);
            if (lexer->eof(lexer)) return false;
            if (lexer->lookahead == '"') in_str = !in_str;
          } else if (!in_str && c == '}') {
            depth--;
          } else if (!in_str && c == '{') {
            depth++;
          }
          lexer->advance(lexer, false);
        }
        break;
      }
      default:
        // `}}` and a stray `}` (which hale refuses) both pass as text.
        lexer->advance(lexer, false);
        break;
    }
  }
}

static const char *const RECOVERY_OPS[] = {
    "restart", "restart_in_place", "quarantine", "reorganize", "bubble",
};

// The rest of a word whose first `len` characters are already in
// `word`; true when it is a recovery op with a `(` after it.
static bool finish_recovery_op(TSLexer *lexer, char *word, unsigned len) {
  while (is_word_char(lexer->lookahead)) {
    if (len >= 31) return false;
    word[len++] = (char)lexer->lookahead;
    lexer->advance(lexer, false);
  }
  word[len] = '\0';
  bool known = false;
  for (unsigned i = 0; i < sizeof(RECOVERY_OPS) / sizeof(RECOVERY_OPS[0]); i++) {
    if (strcmp(word, RECOVERY_OPS[i]) == 0) known = true;
  }
  if (!known) return false;
  lexer->mark_end(lexer);
  while (iswspace(lexer->lookahead)) lexer->advance(lexer, false);
  if (lexer->lookahead != '(') return false;
  lexer->result_symbol = RECOVERY_OP;
  return true;
}

// At `r`, past it. Anything but N `#` and a `"` is not a raw string (an
// identifier starting with `r`, which the internal lexer reads).
static bool scan_raw_string(TSLexer *lexer) {
  unsigned hashes = 0;
  while (lexer->lookahead == '#') {
    hashes++;
    lexer->advance(lexer, false);
  }
  if (lexer->lookahead != '"') return false;
  lexer->advance(lexer, false);
  for (;;) {
    if (lexer->eof(lexer)) return false;
    if (lexer->lookahead == '"') {
      lexer->advance(lexer, false);
      unsigned seen = 0;
      while (seen < hashes && lexer->lookahead == '#') {
        seen++;
        lexer->advance(lexer, false);
      }
      if (seen == hashes) {
        lexer->mark_end(lexer);
        lexer->result_symbol = RAW_STRING;
        return true;
      }
      continue;
    }
    lexer->advance(lexer, false);
  }
}

static inline bool is_blank(int32_t c) { return c == ' ' || c == '\t'; }

// At `"`. Fewer than three quotes, or a fence with more than blanks
// after it on its line, is left to the internal lexer.
static bool scan_block_string(TSLexer *lexer) {
  unsigned fence = 0;
  while (lexer->lookahead == '"') {
    fence++;
    lexer->advance(lexer, false);
  }
  if (fence < 3) return false;
  while (is_blank(lexer->lookahead)) lexer->advance(lexer, false);
  if (lexer->lookahead == '\r') lexer->advance(lexer, false);
  if (lexer->lookahead != '\n') return false;
  lexer->advance(lexer, false);

  // At the start of a line of the text, or of the closing line.
  for (;;) {
    if (lexer->eof(lexer)) return false;
    while (is_blank(lexer->lookahead)) lexer->advance(lexer, false);
    unsigned run = 0;
    while (lexer->lookahead == '"') {
      run++;
      lexer->advance(lexer, false);
    }
    if (run == fence) {
      lexer->mark_end(lexer);
      lexer->result_symbol = BLOCK_STRING;
      return true;
    }
    while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
      lexer->advance(lexer, false);
    }
    if (lexer->eof(lexer)) return false;
    lexer->advance(lexer, false);
  }
}

bool tree_sitter_hale_external_scanner_scan(void *payload, TSLexer *lexer,
                                            const bool *valid_symbols) {
  (void)payload;
  while (iswspace(lexer->lookahead)) lexer->advance(lexer, true);

  if (valid_symbols[FSTRING_LITERAL] && lexer->lookahead == 'f') {
    return scan_fstring(lexer);
  }

  if (lexer->lookahead == 'r' &&
      (valid_symbols[RAW_STRING] || valid_symbols[RECOVERY_OP])) {
    lexer->advance(lexer, false);
    if (lexer->lookahead == '#' || lexer->lookahead == '"') {
      return valid_symbols[RAW_STRING] && scan_raw_string(lexer);
    }
    if (!valid_symbols[RECOVERY_OP]) return false;
    char word[32] = {'r'};
    return finish_recovery_op(lexer, word, 1);
  }

  if (valid_symbols[RECOVERY_OP] &&
      (lexer->lookahead == 'q' || lexer->lookahead == 'b')) {
    char word[32];
    return finish_recovery_op(lexer, word, 0);
  }

  if (valid_symbols[BLOCK_STRING] && lexer->lookahead == '"') {
    return scan_block_string(lexer);
  }

  if (!valid_symbols[QUANTITY_MAGNITUDE]) return false;
  if (!is_digit(lexer->lookahead)) return false;

  if (lexer->lookahead == '0') {
    lexer->advance(lexer, false);
    switch (lexer->lookahead) {
      case 'x': case 'X':
      case 'o': case 'O':
      case 'b': case 'B':
        return false;
      default:
        break;
    }
  }
  while (is_digit(lexer->lookahead) || lexer->lookahead == '_') {
    lexer->advance(lexer, false);
  }

  // `3.5`, `3..5`, `t.0`: not a magnitude.
  if (lexer->lookahead == '.') return false;

  // The magnitude ends here; anything read past this point is lookahead.
  lexer->mark_end(lexer);

  int32_t c = lexer->lookahead;
  if (c == 'e' || c == 'E') {
    lexer->advance(lexer, false);
    if (is_digit(lexer->lookahead)) return false;
    if (lexer->lookahead == '+' || lexer->lookahead == '-') {
      lexer->advance(lexer, false);
      if (is_digit(lexer->lookahead)) return false;
    }
    lexer->result_symbol = QUANTITY_MAGNITUDE;
    return true;
  }
  if (c == 'd') {
    lexer->advance(lexer, false);
    if (!is_word_char(lexer->lookahead)) return false;
    lexer->result_symbol = QUANTITY_MAGNITUDE;
    return true;
  }
  if (is_ascii_alpha(c)) {
    lexer->result_symbol = QUANTITY_MAGNITUDE;
    return true;
  }
  return false;
}
