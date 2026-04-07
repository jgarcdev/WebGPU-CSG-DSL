export type MonacoLike = {
  languages: {
    getLanguages?: () => Array<{ id: string }>;
    register: (desc: { id: string }) => void;
    setMonarchTokensProvider: (id: string, provider: unknown) => void;
    setLanguageConfiguration: (id: string, config: unknown) => void;
  };
  editor: {
    create: (el: HTMLElement, opts: {
      value: string;
      language: string;
      theme?: string;
      automaticLayout?: boolean;
      minimap?: { enabled: boolean };
      fontSize?: number;
    }) => unknown;
    defineTheme: (name: string, theme: unknown) => void;
  };
};

export function setupCSGLLanguage(monaco: MonacoLike) {
  if (!monaco || !monaco.languages) return;
  // avoid double-registration
  const exists = (monaco.languages.getLanguages && monaco.languages.getLanguages()) || [] as Array<{id:string}>;
  if (exists.some((l) => l.id === 'csgl')) return;

  monaco.languages.register({ id: 'csgl' });

  monaco.languages.setMonarchTokensProvider('csgl', {
    defaultToken: '',
    tokenPostfix: '.csgl',
    keywords: [
      'difference', 'union', 'translate', 'rotate', 'scale', 'cube', 'sphere', 'cylinder',
      'module', 'import', 'export', 'let', 'in', 'if', 'else', 'for', 'return', 'function'
    ],
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier'
          }
        }],
        [/\d+\.?\d*/, 'number'],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/\'([^'\\]|\\.)*\'/, 'string'],
        [/[{}()\[\]]/, '@brackets'],
        [/[,;]/, 'delimiter'],
        [/[+\-*/%=<>!]+/, 'operator']
      ],
      comment: [
        [/[^^*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment']
      ]
    }
  });

  monaco.languages.setLanguageConfiguration('csgl', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '\'', close: '\'' }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' }
    ]
  });

  monaco.editor.defineTheme('csglTheme', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'identifier', foreground: '9CDCFE' }
    ],
    colors: {
      'editor.foreground': '#FFFFFF',
      'editor.background': '#1e1e1e'
    }
  });
}

export default setupCSGLLanguage;
