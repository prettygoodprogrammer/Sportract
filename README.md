# Sportract

Ethereum smart contracts that tokenize the sport performances of an athlete.

Sportract was developed in 2023 during an internship at ORIMOS.DEV S.r.l. (Chioggia, Italy)
and completed in 2026 as the subject of a Bachelor's thesis in Computer Science at
Ca' Foscari University of Venice.

## Overview

The system is made of two contracts, each managing its own ERC-20 ledger.

- **Sportract** (`SPRT`) is the athlete's token. The owner of the contract is the athlete,
  who registers the result of every contest with a score from 1 to 10. Each registration
  notarizes a document through the ERC-5289 Ethereum Notary Interface and applies the
  value rule to the athlete's balance:
  - score above the upper bound (default 6): 10% of the athlete's balance is burned,
    without letting it fall below the share `q` (default 500 SPRT);
  - score below the lower bound (default 4): `q` tokens are minted to the athlete;
  - scores between the bounds leave the supply unchanged.

  The rule never touches the reserves of the exchange, so registering a result does not
  move the price of the pool.

- **SportExchange** (`SPRT-LP`) is a constant product market maker (x · y = k) for the
  ETH/SPRT pair, translated to Solidity from the Uniswap V1 exchange contract. Its own
  ERC-20 ledger records the share of the pool owned by each liquidity provider.
  Besides the standard `addLiquidity` / `removeLiquidity` and the swap functions, it adds
  a **joint deposit**: the athlete offers tokens to a specific sponsor
  (`offerSponsorship`), the sponsor sends the matching ether (`sponsorLiquidity`), and the
  minted shares are split in half between athlete and sponsor.

```
            Athlete (owner)                Sponsor              Trader
                 |  registerNewContest         |  sponsorLiquidity   |  swaps
                 v                             v                     v
   +-----------------------------+    +-----------------------------------+
   | Sportract (SPRT)            |    | SportExchange (SPRT-LP)           |
   | ledger: athlete, traders,   |<---| x = ether balance                 |
   |         SportExchange = y   |    | y = SPRT balance in Sportract     |
   | ERC-5289 notarization       |    | ledger: shares of the pool        |
   +-----------------------------+    +-----------------------------------+
```

## Repository structure

```
contracts/
  Sportract.sol               athlete token, value rule, profile, link to the exchange
  SportractInterface.sol
  ERC5289.sol                 implementation of the ERC-5289 notary interface
  IERC5289Library.sol         ERC-5289 interface, as defined by the proposal
  SportExchange.sol           market maker derived from Uniswap V1, joint deposit
  SportExchangeInterface.sol
  mocks/                      helper contracts used only by the tests
migrations/
  1_deploy_contracts.js       deploys Sportract, deploys SportExchange, links them
test/
  1_sportract_token.test.js   value rule, parameters, profile, link
  2_erc5289_notary.test.js    notarization
  3_known_defects.test.js     regression tests for the defects D1-D3 of the 2023 version
  4_sportexchange_liquidity.test.js   liquidity and joint deposit
  5_sportexchange_trades.test.js      pricing functions and swaps
  6_integration_security.test.js      interaction between the contracts, security checks
  7_dos_reentrancy.test.js            denial of service and reentrancy on the exchange
  helpers.js
scripts/
  simulation.js               end-to-end scenario on the migrated contracts
evidence/                     test output and simulation summary (2026), build artifacts and logs (2023)
```

## Requirements

The project was developed and tested with:

| Tool | Version |
|---|---|
| Node.js | 18.14.2 |
| Truffle | 5.8.1 (`npm install -g truffle@5.8.1`) |
| Ganache (GUI) | 2.7, workspace on 127.0.0.1:7545, network id 5777 |
| Solidity compiler | 0.8.18 (downloaded by Truffle) |
| OpenZeppelin Contracts | 4.8.1 |

Truffle and Ganache have since been sunset by ConsenSys; Hardhat or Foundry are the
current alternatives. The contracts themselves do not depend on Truffle.

## Usage

Install the dependencies, start Ganache and keep it open, then:

```
npm install
truffle compile
truffle test --network ganache
truffle migrate --network ganache --reset
truffle exec scripts/simulation.js --network ganache
```

- `truffle test` runs every file in `test/` on a clean state (each `contract()` block is
  isolated with a snapshot of the chain) and prints the result of each test. Nothing
  remains on the chain afterwards.
- `truffle migrate` deploys the system: Sportract with an initial supply of 10,000 SPRT
  assigned to the first account, SportExchange, and the link between them.
- `scripts/simulation.js` runs a realistic scenario on the migrated contracts (opening of
  the pool with a joint deposit, contests with high, low and neutral scores, trades, a
  second sponsor, a withdrawal). The transactions remain visible in Ganache, decoded, and
  a JSON summary with gas, reserves and price after each step is saved in `evidence/`.

To save the test output on Windows (PowerShell):

```
truffle test --network ganache *>&1 | Out-File -Encoding utf8 evidence\test_output.txt
```

## Security notes

- Every state-changing function of Sportract is restricted to the owner, who acts as a
  trusted oracle for the results. The notarization makes each result verifiable, not true.
- SportExchange sends ether with `call`, after updating its state and moving the tokens
  (checks-effects-interactions), and its public functions are `nonReentrant`.
- All the functions of the exchange that move funds take a deadline and a minimum or
  maximum amount, which limit the effect of front-running.
- The price of a small pool can be moved easily: it should not be used as an oracle by
  other contracts.

The project has not been audited and is not meant to be used with real value.

## History

- 2023: development of Sportract and SportExchange during the internship.
- 2026: completion of the project, test suite, fixes of the defects D1-D3, joint deposit.

The 2023 build artifacts and Ganache logs are kept in `evidence/2023/` as historical evidence.

## License

- `SportExchange.sol` and `SportExchangeInterface.sol` are derived from the Uniswap V1
  exchange contract (https://github.com/Uniswap/v1-contracts), released under the
  GNU General Public License v3.0, and are distributed under the same license.
- The rest of the project is released under the MIT License (see `LICENSE`).
- OpenZeppelin Contracts are used as a dependency under the MIT License.
