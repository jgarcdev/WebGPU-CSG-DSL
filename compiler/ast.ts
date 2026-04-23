export type ProgramNode = {
  type: 'Program';
  statements: StatementNode[];
};

export type StatementNode =
  | LetStatementNode
  | RenderStatementNode
  | ConstBlockNode
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

export type ConstDeclarationNode = {
  type: 'ConstDeclaration';
  name: string;
  value: ExpressionNode;
};

export type ConstBlockNode = {
  type: 'ConstBlock';
  decls: ConstDeclarationNode[];
};

export type ExpressionNode =
  | IdentifierNode
  | NumberLiteralNode
  | CallExpressionNode
  | BinaryExpressionNode;

export type BinaryExpressionNode = {
  type: 'BinaryExpression';
  operator: '+' | '-' | '*' | '/';
  left: ExpressionNode;
  right: ExpressionNode;
};

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