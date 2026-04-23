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
      "let", "const"
    ],
    // Recognize constructors / primitive names (capitalized)
    primitives: ["Sphere", "Cube", "Cylinder", "Pyramid", "Cone", "Torus", "Octahedron"],
    tokenizer: {
      root: [
        // Constructors / primitive types (capitalized identifiers)
        [/[A-Z][\w]*/, {
          cases: {
            '@primitives': 'type',
            '@default': 'type'
          }
        }],
        // identifiers and keywords
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier'
          }
        }],
        // numbers: integers, floats, .5, -2.0, -.5
        [/-?(?:\d+\.\d*|\.\d+|\d+)/, 'number'],
        // comments
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        // brackets, delimiters, operators
        [/[{}()\[\]]/, '@brackets'],
        [/[;,]/, 'delimiter'],
        [/[+\-*/%=<>!]+/, 'operator']
      ],
      comment: [
        [/[^*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment']
      ]
    }
  });

  monaco.languages.setLanguageConfiguration('csgl', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '(', close: ')' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '(', close: ')' }
    ],
  });

  monaco.editor.defineTheme('csglTheme', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '#af0e49', fontStyle: 'bold' },
      { token: 'number', foreground: '#d232a7' },
      { token: 'comment', foreground: '#d991bb', fontStyle: 'italic' },
      { token: 'identifier', foreground: '#9a51cd' },
      { token: 'type', foreground: '#6f26c3' }
    ],
    colors: {
      'editor.foreground': '#FFFFFF',
      'editor.background': '#1e1e1e'
    }
  });
}

export default setupCSGLLanguage;