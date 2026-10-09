/**
 * Truffle configuration for Sportract.
 *
 * Networks:
 *  - ganache:     Ganache GUI (default workspace: 127.0.0.1:7545, network id 5777)
 *  - development: any local node on 127.0.0.1:8545 (e.g. ganache-cli or anvil)
 *
 * Usage:
 *   truffle compile
 *   truffle migrate --network ganache --reset
 *   truffle test --network ganache
 *   truffle exec scripts/simulation.js --network ganache
 */

module.exports = {
  networks: {
    ganache: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "5777",
    },
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
  },

  // Some tests send many transactions: a long timeout avoids false failures.
  // Colors are disabled so that the test output can be saved to a plain text file.
  mocha: {
    timeout: 100000,
    color: false,
  },

  compilers: {
    solc: {
      version: "0.8.18",
    },
  },
};
