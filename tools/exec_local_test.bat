setlocal
set bitcoin_bin_dir=C:\bitcoin\bin
set bitcoin_data_dir=C:\bitcoin\local_bitcoind_datadir

call rmdir /S /Q %bitcoin_data_dir%\regtest
start %bitcoin_bin_dir%\bitcoind.exe -regtest -datadir=%bitcoin_data_dir%
call npm install
call %bitcoin_bin_dir%\bitcoin-cli.exe -datadir=%bitcoin_data_dir% help
call npm run test
call %bitcoin_bin_dir%\bitcoin-cli.exe -datadir=%bitcoin_data_dir% stop
pause
