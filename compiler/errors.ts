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

export class SemanticError extends CompilerError {
  constructor(message: string, line: number, column: number) {
    super(message, line, column);
    this.name = 'SemanticError';
  }
}

export class IRGenerationError extends CompilerError {
  constructor(message: string, line: number, column: number) {
    super(message, line, column);
    this.name = "IRGenerationError";
  }
}