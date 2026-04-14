import { lex } from './lexer.ts';
import { parseTokens } from './parser.ts';
import { lowerIR } from './csgIR.ts';


/**
 * Compiles the given source code and returns the IR as a JSON object.
 * @param source Source code to compile
 * @throws CompilerError if there are any compilation errors (lexer, parser, or IR generation)
 * @returns A promise resolving to the compiled IR
 */
export async function compile(source: string) {
  try {
    console.log('Compiling source code:', source);
    const tokens = lex(source);
    const ast = parseTokens(tokens);
    const ir = lowerIR(ast);
    return ir;
  } catch (err) {
    throw err;
  }
}

export default compile;