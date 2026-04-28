import { lex } from "./lexer.ts";
import { parse } from "./parser.ts";
import { sema } from "./sema.ts";
import { lowerIR, optimizeIR } from "./csgIR.ts";
import { Warnings } from "./warnings.ts";


/**
 * Compiles the given source code and returns the IR as a JSON object.
 * @param source Source code to compile
 * @throws CompilerError if there are any compilation errors (lexer, parser, or IR generation)
 * @returns A promise resolving to the compiled IR
 */
export async function compile(source: string): Promise<{ ir: string, warnings: Warnings }> {
  try {
    console.log("Compiling source code:\n", source);
    const tokens = lex(source);
    const ast = parse(tokens);
    const { program, warnings } = sema(ast); 
    const ir = lowerIR(program);
    const optimIR = optimizeIR(ir);
    return { ir: optimIR, warnings };
  } catch (err) {
    throw err;
  }
}

export default compile;