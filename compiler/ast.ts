export type ProgramNode = {
  type: 'Program';
  statements: StatementNode[];
};

export type StatementNode =
  | LetStatementNode
  | RenderStatementNode
  | ExpressionStatementNode;

export type LetStatementNode = {
  type: 'LetStatement';
  name: IdentifierNode;
  value: ExpressionNode;
};

export type RenderStatementNode = {
  type: 'RenderStatement';
  argument: ExpressionNode;
};

export type ExpressionStatementNode = {
  type: 'ExpressionStatement';
  expression: ExpressionNode;
};

export type ExpressionNode =
  | IdentifierNode
  | NumberLiteralNode
  | CallExpressionNode;

export type IdentifierNode = {
  type: 'Identifier';
  name: string;
};

export type NumberLiteralNode = {
  type: 'NumberLiteral';
  raw: string;
  value: number;
};

export type CallExpressionNode = {
  type: 'CallExpression';
  callee: IdentifierNode;
  args: ExpressionNode[];
};

export { };