// Thesis, sections 3.2 and 5.5 - SportExchange: pricing functions and trades in both directions
// Initial pool as in the example of section 3.2: x = 10 ETH, y = 500 SPRT.
const { tokens, eth, big, deadline, ethBalance, expectRevert, inputPrice, outputPrice,
        deploySystem, reserves } = require("./helpers");

contract("SportExchange - prices and trades", (accounts) => {
  const [athlete, sponsor, trader, recipient] = accounts;
  let sp, ex;

  beforeEach(async () => {
    ({ sp, ex } = await deploySystem(athlete));
    await sp.approve(ex.address, tokens(500), { from: athlete });
    await ex.offerSponsorship(sponsor, tokens(500), { from: athlete });
    await ex.sponsorLiquidity(0, await deadline(), { from: sponsor, value: eth(10) });
    await sp.transfer(trader, tokens(1000), { from: athlete });
    await sp.approve(ex.address, tokens(1000), { from: trader });
  });

  // The sponsor withdraws its shares after each test, so it does not run out of Ganache's 100 ETH
  afterEach(async () => {
    const lp = big(await ex.balanceOf(sponsor));
    if (lp > 0n) await ex.removeLiquidity(lp.toString(), 1, 1, await deadline(), { from: sponsor });
  });

  const k = (r) => r.x * r.y;

  describe("pricing functions", () => {
    it("the getters apply formula (3.2) and the fixed-output formula", async () => {
      const { x, y } = await reserves(sp, ex);
      const dx = big(eth(1)), dy = big(tokens(20));
      assert.equal((await ex.getEthToTokenInputPrice(dx.toString())).toString(), inputPrice(dx, x, y).toString());
      assert.equal((await ex.getEthToTokenOutputPrice(dy.toString())).toString(), outputPrice(dy, x, y).toString());
      assert.equal((await ex.getTokenToEthInputPrice(dy.toString())).toString(), inputPrice(dy, y, x).toString());
      assert.equal((await ex.getTokenToEthOutputPrice(dx.toString())).toString(), outputPrice(dx, y, x).toString());
    });

    it("example of section 3.2: 1 ETH buys 45.33 tokens against 50 at the marginal price", async () => {
      const out = big(await ex.getEthToTokenInputPrice(eth(1)));
      assert.equal(web3.utils.fromWei(out.toString(), "ether").slice(0, 5), "45.33");
    });
  });

  describe("ETH to SPRT", () => {
    it("ethToTokenSwapInput: fixed input, k does not decrease", async () => {
      const r0 = await reserves(sp, ex);
      const expected = inputPrice(big(eth(1)), r0.x, r0.y);
      const tx = await ex.ethToTokenSwapInput(1, await deadline(), { from: trader, value: eth(1) });
      const ev = tx.logs.find((l) => l.event === "TokenPurchase");
      assert.equal(ev.args.tokens_bought.toString(), expected.toString());
      assert.equal(big(await sp.balanceOf(trader)).toString(), (big(tokens(1000)) + expected).toString());
      const r1 = await reserves(sp, ex);
      assert.isTrue(k(r1) >= k(r0), "k decreased");
    });

    it("ethToTokenTransferInput: tokens go to the given recipient", async () => {
      await ex.ethToTokenTransferInput(1, await deadline(), recipient, { from: trader, value: eth(1) });
      assert.isTrue(big(await sp.balanceOf(recipient)) > 0n);
    });

    it("ethToTokenSwapOutput: exact amount of tokens, the excess ether is refunded to the buyer", async () => {
      const r0 = await reserves(sp, ex);
      const dy = big(tokens(20));
      const cost = outputPrice(dy, r0.x, r0.y);
      await ex.ethToTokenSwapOutput(dy.toString(), await deadline(), { from: trader, value: eth(2) });
      const r1 = await reserves(sp, ex);
      assert.equal((r1.x - r0.x).toString(), cost.toString());              // the pool keeps only the cost
      assert.equal((r0.y - r1.y).toString(), dy.toString());
      assert.isTrue(k(r1) >= k(r0), "k decreased");
    });

    it("sending ether directly to the pool is equivalent to ethToTokenSwapInput", async () => {
      const r0 = await reserves(sp, ex);
      const expected = inputPrice(big(eth(1)), r0.x, r0.y);
      await web3.eth.sendTransaction({ from: recipient, to: ex.address, value: eth(1), gas: 200000 });
      assert.equal((await sp.balanceOf(recipient)).toString(), expected.toString());
    });
  });

  describe("SPRT to ETH", () => {
    it("tokenToEthTransferInput: fixed amount of tokens, ether to the recipient", async () => {
      const r0 = await reserves(sp, ex);
      const dy = big(tokens(50));
      const expected = inputPrice(dy, r0.y, r0.x);
      const before = await ethBalance(recipient);
      const tx = await ex.tokenToEthTransferInput(dy.toString(), 1, await deadline(), recipient, { from: trader });
      assert.ok(tx.logs.find((l) => l.event === "EthPurchase"), "missing EthPurchase event");
      assert.equal(((await ethBalance(recipient)) - before).toString(), expected.toString());
      const r1 = await reserves(sp, ex);
      assert.isTrue(k(r1) >= k(r0), "k decreased");
    });

    it("tokenToEthTransferOutput: exact ether to the recipient, tokens taken according to the formula", async () => {
      const r0 = await reserves(sp, ex);
      const dx = big(eth("0.5"));
      const cost = outputPrice(dx, r0.y, r0.x);
      const before = await ethBalance(recipient);
      await ex.tokenToEthTransferOutput(dx.toString(), tokens(100), await deadline(), recipient, { from: trader });
      assert.equal(((await ethBalance(recipient)) - before).toString(), dx.toString());
      const r1 = await reserves(sp, ex);
      assert.equal((r1.y - r0.y).toString(), cost.toString());
    });

    it("tokenToEthSwapInput and tokenToEthSwapOutput pay the ether to the seller", async () => {
      const r0 = await reserves(sp, ex);
      await ex.tokenToEthSwapInput(tokens(10), 1, await deadline(), { from: trader });
      await ex.tokenToEthSwapOutput(eth("0.1"), tokens(10), await deadline(), { from: trader });
      const r1 = await reserves(sp, ex);
      assert.isTrue(r1.x < r0.x && r1.y > r0.y, "reserves not updated");
      assert.isTrue(k(r1) >= k(r0), "k decreased");
    });
  });

  describe("price limits and deadline", () => {
    it("rejects trades violating minimum, maximum or deadline", async () => {
      await expectRevert(ex.ethToTokenSwapInput(tokens(50), await deadline(), { from: trader, value: eth(1) }));
      await expectRevert(ex.ethToTokenSwapOutput(tokens(50), await deadline(), { from: trader, value: eth(1) }));
      await expectRevert(ex.tokenToEthSwapInput(tokens(50), eth(1), await deadline(), { from: trader }));
      await expectRevert(ex.tokenToEthSwapOutput(eth(1), tokens(10), await deadline(), { from: trader }));
      await expectRevert(ex.ethToTokenSwapInput(1, await deadline(-10), { from: trader, value: eth(1) }));
    });

    it("k grows along a sequence of trades in both directions", async () => {
      let prev = k(await reserves(sp, ex));
      for (let i = 0; i < 3; i++) {
        await ex.ethToTokenSwapInput(1, await deadline(), { from: trader, value: eth("0.5") });
        let cur = k(await reserves(sp, ex));
        assert.isTrue(cur >= prev, "k decreased after a purchase"); prev = cur;
        await ex.tokenToEthSwapInput(tokens(20), 1, await deadline(), { from: trader });
        cur = k(await reserves(sp, ex));
        assert.isTrue(cur >= prev, "k decreased after a sale"); prev = cur;
      }
    });
  });
});
