// Thesis, sections 4.5 and 5.5 - SportExchange: providing and withdrawing liquidity, joint deposit athlete-sponsor
const { tokens, eth, big, deadline, ethBalance, expectRevert, deploySystem, reserves } = require("./helpers");

contract("SportExchange - liquidity and joint deposit", (accounts) => {
  const [athlete, sponsorA, sponsorB, other] = accounts;
  let sp, ex;

  beforeEach(async () => {
    ({ sp, ex } = await deploySystem(athlete));
  });

  describe("link with Sportract", () => {
    it("the exchange knows the token and recognizes the athlete as the owner of Sportract", async () => {
      assert.equal(await ex.token(), sp.address);
      assert.equal(await ex.athlete(), athlete);
      assert.equal(await ex.name(), "Sportract LP");
      assert.equal(await ex.symbol(), "SPRT-LP");
      assert.equal((await ex.totalSupply()).toString(), "0");
    });

    it("if the owner of Sportract changes, the athlete recognized by the exchange changes too", async () => {
      await sp.transferOwnership(other, { from: athlete });
      assert.equal(await ex.athlete(), other);
    });
  });

  describe("addLiquidity (Uniswap V1 scheme)", () => {
    it("the first deposit sets the price and mints shares equal to the ether deposited", async () => {
      await sp.approve(ex.address, tokens(500), { from: athlete });
      const tx = await ex.addLiquidity(0, tokens(500), await deadline(), { from: athlete, value: eth(1) });
      const r = await reserves(sp, ex);
      assert.equal(r.x.toString(), eth(1));
      assert.equal(r.y.toString(), tokens(500).toString());
      assert.equal((await ex.balanceOf(athlete)).toString(), eth(1));
      assert.ok(tx.logs.find((l) => l.event === "AddLiquidity"), "missing AddLiquidity event");
    });

    it("a later provider deposits at the current ratio and receives proportional shares (3.3)", async () => {
      await sp.approve(ex.address, tokens(500), { from: athlete });
      await ex.addLiquidity(0, tokens(500), await deadline(), { from: athlete, value: eth(1) });
      await sp.transfer(sponsorB, tokens(1000), { from: athlete });
      await sp.approve(ex.address, tokens(1000), { from: sponsorB });
      await ex.addLiquidity(1, tokens(1000), await deadline(), { from: sponsorB, value: eth("0.5") });
      // dy = dx * y / x + 1 (rounded in favour of the pool), dL = L * dx / x
      const r = await reserves(sp, ex);
      assert.equal(r.y.toString(), (big(tokens(750)) + 1n).toString());
      assert.equal((await ex.balanceOf(sponsorB)).toString(), eth("0.5"));
      assert.equal((await ex.totalSupply()).toString(), eth("1.5"));
    });

    it("rejects a deposit above max_tokens or after the deadline", async () => {
      await sp.approve(ex.address, tokens(5000), { from: athlete });
      await ex.addLiquidity(0, tokens(500), await deadline(), { from: athlete, value: eth(1) });
      await expectRevert(ex.addLiquidity(1, tokens(100), await deadline(), { from: athlete, value: eth(1) }));
      await expectRevert(ex.addLiquidity(1, tokens(1000), await deadline(-10), { from: athlete, value: eth(1) }));
    });
  });

  describe("removeLiquidity", () => {
    beforeEach(async () => {
      await sp.approve(ex.address, tokens(500), { from: athlete });
      await ex.addLiquidity(0, tokens(500), await deadline(), { from: athlete, value: eth(1) });
    });

    it("returns both reserves in proportion", async () => {
      const before = big(await sp.balanceOf(athlete));
      const tx = await ex.removeLiquidity(eth("0.5"), 1, 1, await deadline(), { from: athlete });
      const ev = tx.logs.find((l) => l.event === "RemoveLiquidity");
      assert.ok(ev, "missing RemoveLiquidity event");
      assert.equal(ev.args.eth_amount.toString(), eth("0.5"));
      assert.equal(ev.args.token_amount.toString(), tokens(250).toString());
      assert.equal((big(await sp.balanceOf(athlete)) - before).toString(), tokens(250).toString());
      const r = await reserves(sp, ex);
      assert.equal(r.x.toString(), eth("0.5"));
      assert.equal(r.y.toString(), tokens(250).toString());
      assert.equal((await ex.totalSupply()).toString(), eth("0.5"));
    });

    it("rejects withdrawing shares not owned or below the given minimums", async () => {
      await expectRevert(ex.removeLiquidity(eth("0.1"), 1, 1, await deadline(), { from: other }));
      await expectRevert(ex.removeLiquidity(eth("0.5"), eth(1), 1, await deadline(), { from: athlete }));
      await expectRevert(ex.removeLiquidity(eth("0.5"), 1, 1, await deadline(-10), { from: athlete }));
    });
  });

  describe("offerSponsorship", () => {
    it("is restricted to the athlete and requires a valid sponsor", async () => {
      await expectRevert(ex.offerSponsorship(sponsorA, tokens(100), { from: other }), "caller is not the athlete");
      await expectRevert(ex.offerSponsorship(athlete, tokens(100), { from: athlete }), "invalid sponsor");
      await expectRevert(ex.offerSponsorship("0x0000000000000000000000000000000000000000", tokens(100), { from: athlete }), "invalid sponsor");
    });

    it("registers the offer for a sponsor and revokes it with maxTokens = 0", async () => {
      const tx = await ex.offerSponsorship(sponsorA, tokens(1000), { from: athlete });
      assert.ok(tx.logs.find((l) => l.event === "SponsorshipOffered"), "missing SponsorshipOffered event");
      assert.equal((await ex.sponsorOffer(sponsorA)).toString(), tokens(1000).toString());
      assert.equal((await ex.sponsorOffer(sponsorB)).toString(), "0");
      await ex.offerSponsorship(sponsorA, 0, { from: athlete });
      assert.equal((await ex.sponsorOffer(sponsorA)).toString(), "0");
    });
  });

  describe("sponsorLiquidity (joint deposit)", () => {
    async function openPool() {
      await sp.approve(ex.address, tokens(1000), { from: athlete });
      await ex.offerSponsorship(sponsorA, tokens(1000), { from: athlete });
      return ex.sponsorLiquidity(0, await deadline(), { from: sponsorA, value: eth(2) });
    }

    it("first deposit: the offer sets the price and the shares are split in half", async () => {
      const before = big(await sp.balanceOf(athlete));
      const tx = await openPool();
      const ev = tx.logs.find((l) => l.event === "SponsorLiquidity");
      assert.ok(ev, "missing SponsorLiquidity event");
      assert.equal(ev.args.token_amount.toString(), tokens(1000).toString());
      const r = await reserves(sp, ex);
      assert.equal(r.x.toString(), eth(2));
      assert.equal(r.y.toString(), tokens(1000).toString());
      assert.equal((await ex.totalSupply()).toString(), eth(2));
      assert.equal((await ex.balanceOf(sponsorA)).toString(), eth(1));
      assert.equal((await ex.balanceOf(athlete)).toString(), eth(1));
      assert.equal((before - big(await sp.balanceOf(athlete))).toString(), tokens(1000).toString());
      assert.equal((await ex.sponsorOffer(sponsorA)).toString(), "0");
    });

    it("later deposit: follows the current ratio and leaves the price unchanged", async () => {
      await openPool();
      const r0 = await reserves(sp, ex);
      await sp.approve(ex.address, tokens(1000), { from: athlete });
      await ex.offerSponsorship(sponsorB, tokens(1000), { from: athlete });
      await ex.sponsorLiquidity(1, await deadline(), { from: sponsorB, value: eth(1) });
      const r1 = await reserves(sp, ex);
      assert.equal(r1.y.toString(), (big(tokens(1500)) + 1n).toString());   // dy = dx*y/x + 1
      assert.equal((r1.y * r0.x / r1.x).toString(), r0.y.toString());        // y/x unchanged
      assert.equal((await ex.balanceOf(sponsorB)).toString(), eth("0.5"));
      assert.equal((await ex.balanceOf(athlete)).toString(), eth("1.5"));
      assert.equal((await ex.sponsorOffer(sponsorB)).toString(), (big(tokens(500)) - 1n).toString());
    });

    it("the odd unit of the shares, if any, goes to the sponsor", async () => {
      await sp.approve(ex.address, tokens(1000), { from: athlete });
      await ex.offerSponsorship(sponsorA, tokens(1000), { from: athlete });
      const value = (big(eth(1)) + 1n).toString();
      await ex.sponsorLiquidity(0, await deadline(), { from: sponsorA, value });
      assert.equal((big(await ex.balanceOf(sponsorA)) - big(await ex.balanceOf(athlete))).toString(), "1");
    });

    it("is rejected without an offer, above the offer, or with insufficient allowance or balance", async () => {
      await expectRevert(ex.sponsorLiquidity(0, await deadline(), { from: sponsorB, value: eth(1) }), "no offer");

      await ex.offerSponsorship(sponsorA, tokens(1000), { from: athlete });
      await sp.approve(ex.address, tokens(100), { from: athlete });
      await expectRevert(ex.sponsorLiquidity(0, await deadline(), { from: sponsorA, value: eth(2) }), "allowance too low");

      await sp.approve(ex.address, tokens(1000), { from: athlete });
      await sp.transfer(other, tokens(9500), { from: athlete });            // the athlete keeps 500 tokens
      await expectRevert(ex.sponsorLiquidity(0, await deadline(), { from: sponsorA, value: eth(2) }), "athlete balance too low");

      await sp.transfer(athlete, tokens(9500), { from: other });
      await ex.sponsorLiquidity(0, await deadline(), { from: sponsorA, value: eth(2) });   // opens the pool
      await sp.approve(ex.address, tokens(1000), { from: athlete });
      await ex.offerSponsorship(sponsorB, tokens(10), { from: athlete });
      await expectRevert(ex.sponsorLiquidity(1, await deadline(), { from: sponsorB, value: eth(1) }), "offer exceeded");
    });

    it("if the deposit is rejected the ether stays with the sponsor and the pool does not change", async () => {
      await ex.offerSponsorship(sponsorA, tokens(1000), { from: athlete });   // no allowance
      const ethBefore = await ethBalance(sponsorA);
      await expectRevert(ex.sponsorLiquidity(0, await deadline(), { from: sponsorA, value: eth(2) }));
      const spent = ethBefore - (await ethBalance(sponsorA));
      assert.isTrue(spent < big(eth("0.01")), "the sponsor lost more than the gas cost: " + spent);
      assert.equal((await ethBalance(ex.address)).toString(), "0");
      assert.equal((await ex.totalSupply()).toString(), "0");
    });

    it("enforces the minimum shares and the deadline set by the sponsor", async () => {
      await openPool();
      await sp.approve(ex.address, tokens(1000), { from: athlete });
      await ex.offerSponsorship(sponsorB, tokens(1000), { from: athlete });
      await expectRevert(ex.sponsorLiquidity(eth(2), await deadline(), { from: sponsorB, value: eth(1) }), "slippage");
      await expectRevert(ex.sponsorLiquidity(1, await deadline(-10), { from: sponsorB, value: eth(1) }));
    });

    it("athlete and sponsor withdraw their shares with removeLiquidity", async () => {
      await openPool();
      const a = await ex.removeLiquidity(eth(1), 1, 1, await deadline(), { from: athlete });
      const s = await ex.removeLiquidity(eth(1), 1, 1, await deadline(), { from: sponsorA });
      for (const tx of [a, s]) {
        const ev = tx.logs.find((l) => l.event === "RemoveLiquidity");
        assert.equal(ev.args.eth_amount.toString(), eth(1));
        assert.equal(ev.args.token_amount.toString(), tokens(500).toString());
      }
      assert.equal((await ex.totalSupply()).toString(), "0");
    });
  });
});
