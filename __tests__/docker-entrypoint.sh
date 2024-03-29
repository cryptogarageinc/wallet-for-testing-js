#!/bin/bash -u

# while :; do sleep 10; done
export WORKDIR_ROOT=workspace
export WORK_DIR=wallet-test
export WORKDIR_PATH=/${WORKDIR_ROOT}/${WORK_DIR}

cd /${WORKDIR_ROOT}
if [ ! -d ${WORK_DIR} ]; then
  mkdir ${WORK_DIR}
fi

cd ${WORKDIR_PATH}
rm -rf bitcoind_datadir
rm -rf elementsd_datadir

mkdir bitcoind_datadir
chmod 777 bitcoind_datadir
# cp /root/.bitcoin/bitcoin.conf bitcoind_datadir/
cp ./__tests__/bitcoin.conf bitcoind_datadir/
mkdir elementsd_datadir
chmod 777 elementsd_datadir
# cp /root/.elements/elements.conf elementsd_datadir/
cp ./__tests__/elements.conf elementsd_datadir/

# boot daemon
bitcoind --regtest -datadir=${WORKDIR_PATH}/bitcoind_datadir
bitcoin-cli --regtest -datadir=${WORKDIR_PATH}/bitcoind_datadir ping > /dev/null 2>&1
while [ $? -ne 0 ]
do
  bitcoin-cli --regtest -datadir=${WORKDIR_PATH}/bitcoind_datadir ping > /dev/null 2>&1
done
echo "start bitcoin node"

elementsd -chain=liquidregtest -datadir=${WORKDIR_PATH}/elementsd_datadir -pak=02b6991705d4b343ba192c2d1b10e7b8785202f51679f26a1f2cdbe9c069f8dceb024fb0908ea9263bedb5327da23ff914ce1883f851337d71b3ca09b32701003d05
elements-cli -chain=liquidregtest -datadir=${WORKDIR_PATH}/elementsd_datadir ping > /dev/null 2>&1
while [ $? -ne 0 ]
do
  elements-cli -chain=liquidregtest -datadir=${WORKDIR_PATH}/elementsd_datadir ping > /dev/null 2>&1
done
echo "start elements node"

# load or create wallet
bitcoin-cli --regtest -datadir=${WORKDIR_PATH}/bitcoind_datadir createwallet wallet false false "" false false
elements-cli -chain=liquidregtest -datadir=${WORKDIR_PATH}/elementsd_datadir createwallet wallet false false "" false false

set -e

if [ -d node_modules ]; then
  rm -rf node_modules
fi
mkdir node_modules
chmod 777 node_modules
node --version
npm install
# When tests are run consecutively, the second test fails.
# Therefore, the tests are executed individually.
NODE_MAJOR_VER=$(node --version | sed -r 's/^v([0-9]+).([0-9]+).([0-9]+)(\..*)?$/\1/')
NODE_MINOR_VER=$(node --version | sed -r 's/^v([0-9]+).([0-9]+).([0-9]+)(\..*)?$/\2/')
if [ $NODE_MAJOR_VER -gt 18 ]; then
  echo "node version $NODE_MAJOR_VER" ;
  NODE_OPTIONS="--no-experimental-fetch" npm run ts-test ;
elif test "$NODE_MAJOR_VER" = "18" && test "$NODE_MINOR_VER" != "0"; then
  echo "node version $NODE_MAJOR_VER.$NODE_MINOR_VER" ;
  NODE_OPTIONS="--no-experimental-fetch" npm run ts-test ;
else
  npm run ts-test
fi

rm -rf node_modules
