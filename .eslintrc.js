module.exports = {
  env: {
    commonjs: true,
    es6: true,
    node: true,
  },
  extends: [
    'google',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
    "ts-jest": {
      tsConfig: "tsconfig.json",
    },
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  'rules': {
    'new-cap': ['off'],
    'max-len': ['error', {
      'ignoreComments': true,
      'ignoreStrings': true,
      'ignoreTemplateLiterals': true 
    }],
  },
  testMatch: [
    "<rootDir>/__tests__/*.spec.ts",
  ],
  transform: {
    "^.+\\.ts?$": "ts-jest",
  },
};
