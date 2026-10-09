// Thesis, sections 6.3 and 6.5 - Denial of service and reentrancy on SportExchange
const EtherRejecter = artifacts.require("EtherRejecter");
const ReentrancyProbe = artifacts.require("ReentrancyProbe");
const { tokens, eth, big, deadline, ethBalance, expectRevert, deploySystem, reserves } = require("./helpers");

contract("SportExchange - denial of service and reentrancy", (accounts) => {
  const [athlete, sponsor, trader] = accounts;
  const others = accounts.slice(3, 9);       // six more sponsors for the gas test
  let sp, ex;

  beforeEach(async () => {
    ({ sp, ex } = await deploySystem(athlete));
    // Pool opened with a joint deposit: 1,000 SPRT from the athlete, 2 ETH from the sponsor
    await sp.approve(ex.address, tokens(1000), { from: athlete });
    await ex.offerSponsorship(sponsor, tokens(1000), { from: athlete });
    await ex.sponsorLiquidity(0, await deadline(), { from: sponsor, value: eth(2) });
    await sp.transfer(trader, tokens(1000), { from: athlete });
    await sp.approve(ex.address, tokens(1000), { from: trader });
  });

  describe("denial of service (6.5)", () => {
    it("a recipient that rejects ether makes only its own sale revert", async () => {
      const rejecter = await EtherRejecter.new({ from: trader });
      const r0 = await reserves(sp, ex);
      await expectRevert(
        ex.tokenToEthTransferInput(tokens(10), 1, await deadline(), rejecter.address, { from: trader }),
        "ETH transfer failed");
      const r1 = await reserves(sp, ex);
      assert.equal(r1.x.toString(), r0.x.toString());
      assert.equal(r1.y.toString(), r0.y.toString());
      await ex.tokenToEthSwapInput(tokens(10), 1, await deadline(), { from: trader });   // the pool keeps working
    });

    it("a liquidity provider that rejects ether cannot withdraw, but cannot block the others", async () => {
      const rejecter = await EtherRejecter.new({ from: trader });
      await sp.transfer(rejecter.address, tokens(600), { from: athlete });
      await rejecter.provideLiquidity(ex.address, sp.address, tokens(600), { from: trader, value: eth(1) });
      const lp = (await ex.balanceOf(rejecter.address)).toString();
      assert.equal(lp, eth(1));
      await expectRevert(rejecter.withdrawLiquidity(ex.address, lp, { from: trader }), "ETH transfer failed");
      await ex.removeLiquidity(eth(1), 1, 1, await deadline(), { from: sponsor });
      await ex.removeLiquidity(eth(1), 1, 1, await deadline(), { from: athlete });
      assert.equal((await ex.totalSupply()).toString(), lp);                 // only the rejecter's shares are left
    });

    it("the gas of a joint deposit does not grow with the number of sponsors (no unbounded loops)", async () => {
      await sp.approve(ex.address, tokens(5000), { from: athlete });
      const gas = [];
      for (const s of others) {
        await ex.offerSponsorship(s, tokens(1000), { from: athlete });
        const tx = await ex.sponsorLiquidity(1, await deadline(), { from: s, value: eth("0.5") });
        gas.push(tx.receipt.gasUsed);
      }
      console.log("        sponsorLiquidity gas, sponsors 2-7: " + gas.join(", "));
      const spread = Math.max(...gas) - Math.min(...gas);
      assert.isTrue(spread <= Math.min(...gas) / 100, "gas grows with the number of sponsors: " + gas.join(", "));
    });
  });

  describe("reentrancy (6.3)", () => {
    it("a seller re-entering while receiving the payment is stopped by the guard", async () => {
      const probe = await ReentrancyProbe.new(ex.address, sp.address, { from: trader });
      await sp.transfer(probe.address, tokens(100), { from: athlete });
      await probe.sell(tokens(10), { from: trader });
      assert.isTrue(await probe.attempted(), "the contract did not receive ether");
      assert.isFalse(await probe.reentered(), "the re-entering call was executed");
      assert.equal(await probe.reason(), "ReentrancyGuard: reentrant call");
      assert.equal((await sp.balanceOf(probe.address)).toString(), tokens(90).toString());  // a single sale
    });

    it("a buyer re-entering while receiving the refund is stopped by the guard", async () => {
      const probe = await ReentrancyProbe.new(ex.address, sp.address, { from: trader });
      const r0 = await reserves(sp, ex);
      await probe.buyExact(tokens(10), { from: trader, value: eth(1) });
      assert.isTrue(await probe.attempted(), "the contract did not receive the refund");
      assert.isFalse(await probe.reentered(), "the re-entering call was executed");
      assert.equal(await probe.reason(), "ReentrancyGuard: reentrant call");
      assert.equal((await sp.balanceOf(probe.address)).toString(), tokens(10).toString());  // a single purchase
      const r1 = await reserves(sp, ex);
      const paid = r1.x - r0.x;
      assert.equal(((await ethBalance(probe.address)) + paid).toString(), eth(1));  // refund + cost = 1 ETH
    });
  });
});
