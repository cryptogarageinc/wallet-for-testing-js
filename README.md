# wallet-for-testing-js

## build

npm install

## use library

```nodejs
const WalletManager = require('wallet-for-testing-js');
```

## use wallet console app

```nodejs
node wallet-console.js
```

## use single console app

- windows

```bat
debug_tx.bat xxxxx
```

- macos or linux

```sh
debug_tx.sh xxxxx
```

## test

docker-compose run wallet-test

## note

### When using node.js 18 or higher

In node.js 18 or higher, emscripten for cfd-js-wasm does not work properly.
Therefore, it is necessary to run with the '--no-experimental-fetch' option.
