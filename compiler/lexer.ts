import { LexerError } from './errors.ts';


export type TokenType =
  | 'Identifier'
  | 'Number'
  | 'Keyword'
  | 'Plus'
  | 'Minus'
  | 'Star'
  | 'Slash'
  | 'LParen'
  | 'RParen'
  | 'LBrace'
  | 'RBrace'
  | 'Comma'
  | 'Equals'
  | 'Semicolon'
  | 'EOL'
  | 'EOF';

export type Token = {
  type: TokenType;
  lexeme: string;
  line: number;
  column: number;
};

export function lex(source: string): Token[] {
  console.log(`Lexing...`);

  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const peek = (offset = 0): string => source[index + offset] ?? '';

  const advance = (): string => {
    const ch = source[index++] ?? '';
    if (ch === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return ch;
  };

  const addToken = (type: TokenType, lexeme: string, tokenLine: number, tokenColumn: number) => {
    tokens.push({ type, lexeme, line: tokenLine, column: tokenColumn });
  };

  const isDigit = (ch: string) => ch >= '0' && ch <= '9';
  const isLower = (ch: string) => ch >= 'a' && ch <= 'z';
  const isUpper = (ch: string) => ch >= 'A' && ch <= 'Z';
  const isLetter = (ch: string) => isLower(ch) || isUpper(ch);
  const isIdentifierPart = (ch: string) => isLetter(ch) || isDigit(ch) || ch === '_';

  const readIdentifier = () => {
    const tokenLine = line;
    const tokenColumn = column;
    const start = index;
    const first = peek();
    if (!isLetter(first)) {
      throw new LexerError('Expected identifier', tokenLine, tokenColumn);
    }
    advance();
    while (isIdentifierPart(peek())) {
      advance();
    }
    const lexeme = source.slice(start, index);

    if (lexeme === 'let' || lexeme === 'Render' || lexeme === 'const') {
      addToken('Keyword', lexeme, tokenLine, tokenColumn);
      return;
    }

    addToken('Identifier', lexeme, tokenLine, tokenColumn);
  };

  const readNumber = () => {
    const tokenLine = line;
    const tokenColumn = column;
    const start = index;

    if (peek() === '-' || peek() === '+') {
      advance();
    }

    // two main forms: digits[.digits?]  OR  .digits
    if (isDigit(peek())) {
      // consume integer part
      while (isDigit(peek())) advance();

      // fractional part (optional). allow trailing dot (e.g., '1.')
      if (peek() === '.') {
        advance();
        if (isDigit(peek())) {
          while (isDigit(peek())) advance();
        }
        // else allow trailing dot without digits
      }
    } else if (peek() === '.') {
      // leading-dot float: must have digits after
      advance();
      if (!isDigit(peek())) {
        throw new LexerError('Invalid number literal', tokenLine, tokenColumn);
      }
      while (isDigit(peek())) advance();
    } else {
      // sign only or invalid start
      throw new LexerError('Invalid number literal', tokenLine, tokenColumn);
    }

    // disallow trailing letters like scientific notation '1e' or identifiers immediately after number
    const next = peek();
    // multiple dots are invalid (e.g. 1.2.3)
    if (next === '.') {
      throw new LexerError('Invalid number literal', tokenLine, tokenColumn);
    }
    if (isLetter(next) || next === '_') {
      throw new LexerError('Invalid number literal', tokenLine, tokenColumn);
    }

    const lexeme = source.slice(start, index);
    addToken('Number', lexeme, tokenLine, tokenColumn);
  };

  while (index < source.length) {
    const ch = peek();

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      if (ch === '\n') {
        addToken('EOL', ch, line, column);
      }

      advance();
      continue;
    }

    if (ch === '/' && peek(1) === '/') {
      while (peek() !== '\n' && peek() !== '') {
        advance();
      }
      continue;
    }

    if (ch === '/' && peek(1) === '*') {
      const commentLine = line;
      const commentColumn = column;
      advance();
      advance();
      while (!(peek() === '*' && peek(1) === '/')) {
        if (peek() === '') {
          throw new LexerError('Unterminated block comment', commentLine, commentColumn);
        }
        advance();
      }
      advance();
      advance();
      continue;
    }

    const tokenLine = line;
    const tokenColumn = column;

    switch (ch) {
      case '*':
        addToken('Star', ch, tokenLine, tokenColumn);
        advance();
        continue;
      case '/':
        // comments were handled earlier; here plain slash is an operator
        addToken('Slash', ch, tokenLine, tokenColumn);
        advance();
        continue;
      case '(':
        addToken('LParen', ch, tokenLine, tokenColumn);
        advance();
        continue;
      case '{':
        addToken('LBrace', ch, tokenLine, tokenColumn);
        advance();
        continue;
      case '}':
        addToken('RBrace', ch, tokenLine, tokenColumn);
        advance();
        continue;
      case ')':
        addToken('RParen', ch, tokenLine, tokenColumn);
        advance();
        continue;
      case ',':
        addToken('Comma', ch, tokenLine, tokenColumn);
        advance();
        continue;
      case '=':
        addToken('Equals', ch, tokenLine, tokenColumn);
        advance();
        continue;
      case ';':
        addToken('Semicolon', ch, tokenLine, tokenColumn);
        advance();
        continue;
      default:
        break;
    }

    // Handle plus/minus: decide whether operator or numeric sign based on previous token
    if (ch === '+' || ch === '-') {
      const prev = [...tokens].reverse().find(t => t.type !== 'EOL' && t.type !== 'Semicolon');
      if (prev && (prev.type === 'Number' || prev.type === 'Identifier' || prev.type === 'RParen')) {
        addToken(ch === '+' ? 'Plus' : 'Minus', ch, tokenLine, tokenColumn);
        advance();
        continue;
      }
      // otherwise treat as number sign
    }

    if (isLetter(ch)) {
      readIdentifier();
      continue;
    }

    if (ch === '-' || ch === '+' || ch === '.' || isDigit(ch)) {
      readNumber();
      continue;
    }

    throw new LexerError(`Unexpected character '${ch}'`, tokenLine, tokenColumn);
  }

  // addToken('EOF', '', line, column);
  return tokens;
}

export default lex;
