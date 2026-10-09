// Thesis, sections 4.3, 5.5 and 6 - Interaction between the two contracts and security tests related to the project
const ReentrancyProbe = artifacts.require("ReentrancyProbe");
const ForceSend = artifacts.require("ForceSend");
const { tokens, eth, big, deadline, ethBalance, expectRevert, deploySystem, reserves } = require("./helpers");

contract("Sportract + SportExchange - integration and security", (accounts) => {
  const [athlete, sponsor, trader] = accounts;
  let sp, ex;

  async function openPool(ethAmount = 2, tokenAmount = 1000) {
    await sp.approve(ex.address, tokens(tokenAmount), { from: athlete });
    await ex.offerSponsorship(sponsor, tokens(tokenAmount), { from: athlete });
    return ex.sponsorLiquidity(0, await deadline(), { from: sponsor, value: eth(ethAmount) });
  }

  beforeEach(async () => {
    ({ sp, ex } = await deploySystem(athlete));
  });

  describe("value rule and pool (4.3)", () => {
    it("a high performance reduces the athlete's balance and the supply, not the reserves or the price of the pool", async () => {
      await openPool();
      const r0 = await reserves(sp, ex);
      const p0 = (await ex.getEthToTokenInputPrice(eth("0.1"))).toString();
      const b0 = big(await sp.balanceOf(athlete));
      await sp.registerNewContest(8, 1, "ipfs://doc-1", { from: athlete });
      assert.equal(big(await sp.balanceOf(athlete)).toString(), (b0 - b0 / 10n).toString());
      const r1 = await reserves(sp, ex);
      assert.equal(r1.x.toString(), r0.x.toString());
      assert.equal(r1.y.toString(), r0.y.toString());
      assert.equal((await ex.getEthToTokenInputPrice(eth("0.1"))).toString(), p0);
    });

    it("a low performance mints q tokens to the athlete without touching the pool", async () => {
      await openPool();
      const r0 = await reserves(sp, ex);
      const b0 = big(await sp.balanceOf(athlete));
      await sp.registerNewContest(2, 1, "ipfs://doc-1", { from: athlete });
      assert.equal((big(await sp.balanceOf(athlete)) - b0).toString(), tokens(500).toString());
      assert.equal((await reserves(sp, ex)).y.toString(), r0.y.toString());
    });

    it("offered tokens remain subject to the value rule", async () => {
      await sp.approve(ex.address, tokens(10000), { from: athlete });
      await ex.offerSponsorship(sponsor, tokens(10000), { from: athlete });
      await sp.registerNewContest(9, 1, "ipfs://doc-1", { from: athlete });   // balance 10,000 -> 9,000
      await expectRevert(ex.sponsorLiquidity(0, await deadline(), { from: sponsor, value: eth(1) }), "athlete balance too low");
    });
  });

  describe("reentrancy (6.3)", () => {
    it("a recipient trying to re-enter while receiving ether is blocked", async () => {
      await openPool();
      const probe = await ReentrancyProbe.new(ex.address, sp.address, { from: trader });
      await sp.transfer(probe.address, tokens(100), { from: athlete });
      await probe.sell(tokens(10), { from: trader });
      assert.isTrue(await probe.attempted(), "the contract did not receive ether");
      assert.isFalse(await probe.reentered(), "the re-entering call was executed");
      assert.isTrue((await ethBalance(probe.address)) > 0n);
      assert.equal((await sp.balanceOf(probe.address)).toString(), tokens(90).toString());  // a single sale
    });
  });

  describe("forced ether transfers (6.7)", () => {
    it("ether forced before the first deposit: initial shares depend only on the ether sent", async () => {
      const f = await ForceSend.new({ from: trader, value: eth(1) });
      await f.forceSend(ex.address, { from: trader });
      assert.equal((await ethBalance(ex.address)).toString(), eth(1));
      assert.equal((await ex.totalSupply()).toString(), "0");
      await openPool(2, 1000);
      assert.equal((await ex.totalSupply()).toString(), eth(2));             // not 3
      const tx = await ex.removeLiquidity(eth(1), 1, 1, await deadline(), { from: sponsor });
      const ev = tx.logs.find((l) => l.event === "RemoveLiquidity");
      assert.equal(ev.args.eth_amount.toString(), eth("1.5"));             // the forced ether goes to the liquidity providers
    });

    it("ether forced into an active pool: raises the price and is shared among the providers", async () => {
      await openPool();
      const p0 = big(await ex.getTokenToEthInputPrice(tokens(10)));
      const f = await ForceSend.new({ from: trader, value: eth(2) });
      await f.forceSend(ex.address, { from: trader });
      assert.isTrue(big(await ex.getTokenToEthInputPrice(tokens(10))) > p0, "token price unchanged");
      const tx = await ex.removeLiquidity(eth(1), 1, 1, await deadline(), { from: athlete });
      assert.equal(tx.logs.find((l) => l.event === "RemoveLiquidity").args.eth_amount.toString(), eth(2));
    });
  });

  describe("checked arithmetic (6.4)", () => {
    it("rejects outputs equal to or above the reserve and withdrawals above the shares owned", async () => {
      await openPool();
      const { x, y } = await reserves(sp, ex);
      await expectRevert(ex.getEthToTokenOutputPrice(y.toString()));                 // division by zero
      await expectRevert(ex.getEthToTokenOutputPrice((y + 1n).toString()));          // underflow
      await expectRevert(ex.tokenToEthSwapOutput(x.toString(), tokens(100000), await deadline(), { from: athlete }));
      await expectRevert(ex.removeLiquidity(eth(5), 1, 1, await deadline(), { from: sponsor }));
    });
  });

  describe("gas costs (informative)", () => {
    it("reports the gas of the main operations", async () => {
      const g = {};
      g["deploy SportExchange"] = (await web3.eth.getTransactionReceipt(ex.transactionHash)).gasUsed;
      g["approve"] = (await sp.approve(ex.address, tokens(3200), { from: athlete })).receipt.gasUsed;
      g["offerSponsorship"] = (await ex.offerSponsorship(sponsor, tokens(2000), { from: athlete })).receipt.gasUsed;
      g["sponsorLiquidity (first)"] = (await ex.sponsorLiquidity(0, await deadline(), { from: sponsor, value: eth(2) })).receipt.gasUsed;
      await ex.offerSponsorship(sponsor, tokens(1100), { from: athlete });
      g["sponsorLiquidity (later)"] = (await ex.sponsorLiquidity(1, await deadline(), { from: sponsor, value: eth(1) })).receipt.gasUsed;
      g["ethToTokenSwapInput"] = (await ex.ethToTokenSwapInput(1, await deadline(), { from: trader, value: eth("0.1") })).receipt.gasUsed;
      await sp.approve(ex.address, tokens(10), { from: trader });
      g["tokenToEthSwapInput"] = (await ex.tokenToEthSwapInput(tokens(5), 1, await deadline(), { from: trader })).receipt.gasUsed;
      g["removeLiquidity"] = (await ex.removeLiquidity(eth("0.5"), 1, 1, await deadline(), { from: sponsor })).receipt.gasUsed;
      g["registerNewContest (burn)"] = (await sp.registerNewContest(8, 1, "ipfs://doc-1", { from: athlete })).receipt.gasUsed;
      for (const [op, gas] of Object.entries(g)) console.log("        " + op.padEnd(32) + gas);
    });
  });
});
