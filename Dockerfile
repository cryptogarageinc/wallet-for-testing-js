FROM cryptogarageinc/elements-testing:v0.18.1.7

RUN bitcoin-cli --version && elements-cli --version
