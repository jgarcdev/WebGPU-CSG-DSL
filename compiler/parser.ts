import { Token, TokenType } from './lexer.ts';
import { ParserError } from './errors.ts';
import type {
  ProgramNode,
  StatementNode,
  LetStatementNode,
  RenderStatementNode,
  ExpressionStatementNode,
  ExpressionNode,
  IdentifierNode,
  NumberLiteralNode,
  CallExpressionNode,
} from './ast.ts';

class Parser {
  private current = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseProgram(): ProgramNode {
    const statements: StatementNode[] = [];
    while (!this.isAtEnd()) {
      // detect common mistaken pattern: uppercase LET used as identifier followed by identifier and '='
      if (
        !this.isAtEnd() &&
        this.peek() &&
        this.peek().type === 'Identifier' &&
        this.tokens[this.current + 1] &&
        this.tokens[this.current + 1].type === 'Identifier' &&
        this.tokens[this.current + 2] &&
        this.tokens[this.current + 2].type === 'Equals'
      ) {
        const tk = this.peek();
        throw new ParserError('Expected expression', tk.line, tk.column);
      }
      this.skipSeparators();
      if (this.isAtEnd()) break;
      statements.push(this.parseStatement());
      this.skipSeparators();
    }
    return { type: 'Program', statements };
  }

  private parseStatement(): StatementNode {
    // `let` is a Keyword token with lexeme 'let'
    if (this.isKeyword('let')) {
      this.advance();
      return this.parseLetStatement();
    }

    // `Render` is a keyword (capitalized) similar to `let`
    if (this.isKeyword('Render')) {
      this.advance();
      return this.parseRenderStatement();
    }

    const expression = this.parseExpression();
    return {
      type: 'ExpressionStatement',
      expression,
    } as ExpressionStatementNode;
  }

  private parseLetStatement(): LetStatementNode {
    const name = this.parseIdentifierNode();
    this.consume('Equals', "Expected '=' after let identifier");
    this.skipSeparators();
    const value = this.parseExpression();
    if (value.type === "NumberLiteral") {
      throw new ParserError("Expected identifier or call expression, got number literal", this.previous().line, this.previous().column);
    }

    // ensure nothing unexpected follows this let value (require separator or end)
    if (!this.isAtEnd()) {
      const nxt = this.peek();
      if (!(nxt.type === 'Semicolon' || nxt.type === 'EOL')) {
        throw new ParserError('Expected end of input after expression', nxt.line, nxt.column);
      }
    }

    return {
      type: 'LetStatement',
      name,
      value,
    };
  }

  private parseRenderStatement(): RenderStatementNode {
    this.consume('LParen', "Expected '(' after Render");
    const argument = this.parseExpression();
    this.consume('RParen', "Expected ')' after Render argument");
    return {
      type: 'RenderStatement',
      argument,
    };
  }

  private parseExpression(inArg = false): ExpressionNode {
    this.skipSeparators();
    // number literal
    if (this.check('Number')) {
      const token = this.advance();
      const value = Number(token.lexeme);
      if (Number.isNaN(value)) {
        throw new ParserError('Invalid number literal', token.line, token.column);
      }
      return {
        type: 'NumberLiteral',
        raw: token.lexeme,
        value,
      } as NumberLiteralNode;
    }

    // identifier or call
    if (this.check('Identifier')) {
      const identifier = this.parseIdentifierNode();
      if (!this.check('LParen')) {
        // Only treat identifier-followed-by-expression as a missing '(' when
        // we're parsing a top-level expression (not when parsing call arguments)
        if (!inArg && !this.isAtEnd()) {
          const nxt = this.peek();
          if (nxt.type === 'Identifier' || nxt.type === 'Number' || nxt.type === 'Keyword') {
            throw new ParserError("Expected '(' after function name", nxt.line, nxt.column);
          }
        }
        return identifier;
      }

      // call expression
      this.consume('LParen', "Expected '(' after call identifier");
      const args: ExpressionNode[] = [];
      if (!this.check('RParen')) {
        args.push(this.parseExpression(true));
        while (this.check('Comma')) {
          this.advance();
          args.push(this.parseExpression(true));
        }

        // if after parsing arguments we don't have a right paren, but the next
        // token looks like the start of another argument, it's a missing comma
        if (!this.check('RParen')) {
          const nxt = this.peek();
          if (nxt.type === 'Identifier' || nxt.type === 'Number' || nxt.type === 'Keyword' || nxt.type === 'LParen') {
            throw new ParserError("Missing ',' between call arguments", nxt.line, nxt.column);
          }
        }
      }
      this.consume('RParen', "Expected ')' after call arguments");
      return {
        type: 'CallExpression',
        callee: identifier,
        args,
      } as CallExpressionNode;
    }

    const tk = this.peekOrLast();
    if (tk.type === 'LParen') {
      throw new ParserError("Expected '(' after function name", tk.line, tk.column);
    }
    throw new ParserError('Expected expression', tk.line, tk.column);
  }

  private parseIdentifierNode(): IdentifierNode {
    const token = this.consume('Identifier', 'Expected identifier');
    return {
      type: 'Identifier',
      name: token.lexeme,
    };
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    // skip separators (EOL / Semicolon) before attempting to consume
    while (!this.isAtEnd() && (this.peek().type === 'EOL' || this.peek().type === 'Semicolon')) {
      this.advance();
    }
    if (this.check(type)) {
      return this.advance();
    }
    const token = this.peekOrLast();
    throw new ParserError(message, token.line, token.column);
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    const t = this.tokens[this.current];
    this.current += 1;
    return t;
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private peekOrLast(): Token {
    if (this.isAtEnd()) {
      return this.tokens[this.tokens.length - 1] ?? { type: 'EOF' as TokenType, lexeme: '', line: 1, column: 1 };
    }
    return this.peek();
  }

  private isKeyword(lexeme: string) {
    if (this.isAtEnd()) return false;
    const tk = this.peek();
    return tk.type === 'Keyword' && tk.lexeme === lexeme;
  }

  private isIdentifierName(name: string) {
    if (this.isAtEnd()) return false;
    const tk = this.peek();
    return tk.type === 'Identifier' && tk.lexeme === name;
  }

  private skipSeparators() {
    while (!this.isAtEnd() && (this.peek().type === 'EOL' || this.peek().type === 'Semicolon')) {
      this.advance();
    }
  }
}

export function parse(tokens: Token[]): ProgramNode {
  const parser = new Parser(tokens);
  return parser.parseProgram();
}