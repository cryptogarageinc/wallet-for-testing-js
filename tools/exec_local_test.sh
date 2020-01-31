#!/bin/sh
export bitcoin_bin_dir=/usr/local/bin
export bitcoin_data_dir=~/.bitcoin

rm -rf ${bitcoin_data_dir}/regtest
${bitcoin_bin_dir}/bitcoind -regtest -datadir=${bitcoin_data_dir} &
npm install
${bitcoin_bin_dir}/bitcoin-cli -datadir=${bitcoin_data_dir} help
npm run test
${bitcoin_bin_dir}/bitcoin-cli -datadir=${bitcoin_data_dir} stop
