// Simulation of the complete Sportract + SportExchange scenario on the migrated contracts.
//
//   truffle migrate --network ganache --reset
//   truffle exec scripts/simulation.js --network ganache
//
// It contains no checks (those are in the tests): it runs a realistic sequence of operations,
// which stays recorded in Ganache (blocks, transactions and decoded events, useful for the
// screenshots), and saves in evidence/ a JSON summary with gas, reserves and price after each step.
const fs = require("fs");
const path = require("path");
const Sportract = artifacts.require("Sportract");
const SportExchange = artifacts.require("SportExchange");

module.exports = async function (callback) {
  try {
    const [athlete, sponsorA, sponsorB, trader] = await web3.eth.getAccounts();
    const sp = await Sportract.deployed();
    const ex = await SportExchange.deployed();
    const toW = (n) => web3.utils.toWei(String(n), "ether");
    const fromW = (v) => Number(web3.utils.fromWei(v.toString(), "ether"));
    const deadline = async () => (await web3.eth.getBlock("latest")).timestamp + 300;

    if ((await ex.totalSupply()).toString() !== "0") {
      console.log("The pool is not empty: run  truffle migrate --network ganache --reset  first");
      return callback();
    }

    // State of the system after each step
    async function state() {
      const x = fromW(await web3.eth.getBalance(ex.address));
      const y = fromW(await sp.balanceOf(ex.address));
      return {
        eth_reserve: x,
        sprt_reserve: y,
        price_eth_per_sprt: y > 0 ? x / y : null,
        k: x * y,
        sprt_supply: fromW(await sp.totalSupply()),
        athlete_sprt_balance: fromW(await sp.balanceOf(athlete)),
        lp_shares: {
          athlete: fromW(await ex.balanceOf(athlete)),
          sponsorA: fromW(await ex.balanceOf(sponsorA)),
          sponsorB: fromW(await ex.balanceOf(sponsorB)),
        },
      };
    }

    const steps = [];
    async function step(description, promise) {
      const tx = await promise;
      const s = await state();
      steps.push({ step: steps.length + 1, description, tx: tx.tx, block: tx.receipt.blockNumber,
                   gas: tx.receipt.gasUsed, events: tx.logs.map((l) => l.event), state: s });
      console.log(`${String(steps.length).padStart(2)}. ${description.padEnd(52)} gas ${String(tx.receipt.gasUsed).padStart(7)}` +
                  `   x=${s.eth_reserve.toFixed(4)} ETH  y=${s.sprt_reserve.toFixed(2)} SPRT  p=${s.price_eth_per_sprt ? s.price_eth_per_sprt.toFixed(6) : "-"}`);
    }

    console.log(`Sportract ${sp.address}\nSportExchange ${ex.address}\n`);

    await step("Athlete profile", sp.setUserData("Test Athlete", "M", "IT", 1995, { from: athlete }));

    // Opening of the pool with a joint deposit: 2,000 SPRT from the athlete, 4 ETH from sponsor A
    await step("Athlete: approve to the exchange (3,000 SPRT)", sp.approve(ex.address, toW(3000), { from: athlete }));
    await step("Athlete: offer of 2,000 SPRT to sponsor A", ex.offerSponsorship(sponsorA, toW(2000), { from: athlete }));
    await step("Sponsor A: joint deposit with 4 ETH (opening)", ex.sponsorLiquidity(0, await deadline(), { from: sponsorA, value: toW(4) }));

    // Contests and market
    await step("Contest: score 8 (burn of 10% of the balance)", sp.registerNewContest(8, 1, "ipfs://document-1", { from: athlete }));
    await step("Trader: purchase with 1 ETH", ex.ethToTokenSwapInput(1, await deadline(), { from: trader, value: toW(1) }));
    await step("Contest: score 2 (mint of 500 SPRT)", sp.registerNewContest(2, 2, "ipfs://document-2", { from: athlete }));
    await step("Contest: score 5 (supply unchanged)", sp.registerNewContest(5, 3, "ipfs://document-3", { from: athlete }));

    // Second sponsor: joint deposit at the current price
    await step("Athlete: offer of 1,000 SPRT to sponsor B", ex.offerSponsorship(sponsorB, toW(1000), { from: athlete }));
    await step("Sponsor B: joint deposit with 1 ETH", ex.sponsorLiquidity(1, await deadline(), { from: sponsorB, value: toW(1) }));

    await step("Trader: approve to the exchange", sp.approve(ex.address, toW(100), { from: trader }));
    await step("Trader: sale of 100 SPRT", ex.tokenToEthSwapInput(toW(100), 1, await deadline(), { from: trader }));
    await step("Sponsor A: withdrawal of half of its shares", ex.removeLiquidity(toW(1), 1, 1, await deadline(), { from: sponsorA }));

    const summary = {
      network: await web3.eth.net.getId(),
      date: new Date().toISOString(),
      contracts: { Sportract: sp.address, SportExchange: ex.address },
      accounts: { athlete, sponsorA, sponsorB, trader },
      steps,
      final_state: await state(),
    };
    const dir = path.join(__dirname, "..", "evidence");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `simulation_${summary.date.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(file, JSON.stringify(summary, null, 2));
    console.log(`\nSummary saved in ${file}`);
  } catch (e) {
    console.error(e);
  }
  callback();
};
