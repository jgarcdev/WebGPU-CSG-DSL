// There are three main types of errors: lexer errors, parser errors, and other errors
// All of them will be unified under a CompilerError type that includes the line and column information for better error reporting in the editor
// These error types will be exported from this file and used across the compiler modules
// An error (either lexer, parser, or other) will be thrown either by the lexer, parser, or ir-generator
// The frontend (what called `compile`) will catch the errors and display them in the UI

export class CompilerError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "CompilerError";
  }
}

export class LexerError extends CompilerError {
  constructor(message: string, line: number, column: number) {
    super(message, line, column);
    this.name = "LexerError";
  }
}

export class ParserError extends CompilerError {
  constructor(message: string, line: number, column: number) {
    super(message, line, column);
    this.name = "ParserError";
  }
}

export class IRGenerationError extends CompilerError {
  constructor(message: string, line: number, column: number) {
    super(message, line, column);
    this.name = "IRGenerationError";
  }
}