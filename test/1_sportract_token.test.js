// Thesis, section 5.4 - Functional tests of the token: registration of the results and mint/burn cycle
const Sportract = artifacts.require("Sportract");
const { tokens, expectRevert } = require("./helpers");

contract("Sportract - token and value rule", (accounts) => {
  const [owner, other] = accounts;
  let sp;

  beforeEach(async () => {
    sp = await Sportract.new("Sportract Athlete Token", "SPRT", tokens(10000), { from: owner });
  });

  describe("initial state", () => {
    it("assigns the initial supply to the owner", async () => {
      assert.equal(await sp.name(), "Sportract Athlete Token");
      assert.equal(await sp.symbol(), "SPRT");
      assert.equal((await sp.totalSupply()).toString(), tokens(10000).toString());
      assert.equal((await sp.balanceOf(owner)).toString(), tokens(10000).toString());
      assert.equal(await sp.owner(), owner);
    });

    it("uses the default parameters (6, 4, 500 tokens)", async () => {
      assert.equal((await sp.getscorelimitup()).toNumber(), 6);
      assert.equal((await sp.getscorelimitdown()).toNumber(), 4);
      assert.equal((await sp.getShare()).toString(), tokens(500).toString());
    });
  });

  describe("registration of the results", () => {
    it("score above the upper bound: burns 10% of the owner's balance", async () => {
      await sp.registerNewContest(8, 1, "ipfs://doc-1", { from: owner });
      assert.equal((await sp.balanceOf(owner)).toString(), tokens(9000).toString());
      assert.equal((await sp.totalSupply()).toString(), tokens(9000).toString());
    });

    it("burning never brings the owner's balance below the share q (520 -> 500)", async () => {
      await sp.transfer(other, tokens(9480), { from: owner });             // the owner keeps 520 tokens
      await sp.registerNewContest(8, 1, "ipfs://doc-1", { from: owner });
      assert.equal((await sp.balanceOf(owner)).toString(), tokens(500).toString());
      assert.equal((await sp.totalSupply()).toString(), tokens(9980).toString());
    });

    it("with a balance at or below q nothing is burned", async () => {
      await sp.transfer(other, tokens(9500), { from: owner });             // the owner keeps 500 tokens
      await sp.registerNewContest(9, 1, "ipfs://doc-1", { from: owner });
      assert.equal((await sp.balanceOf(owner)).toString(), tokens(500).toString());
      await sp.transfer(other, tokens(400), { from: owner });              // the owner keeps 100 tokens
      await sp.registerNewContest(9, 2, "ipfs://doc-2", { from: owner });
      assert.equal((await sp.balanceOf(owner)).toString(), tokens(100).toString());
      assert.equal((await sp.totalSupply()).toString(), tokens(10000).toString());
    });

    it("score below the lower bound: mints 500 tokens", async () => {
      await sp.registerNewContest(2, 2, "ipfs://doc-2", { from: owner });
      assert.equal((await sp.totalSupply()).toString(), tokens(10500).toString());
    });

    it("scores between the bounds, bounds included: supply unchanged", async () => {
      await sp.registerNewContest(4, 10, "ipfs://n", { from: owner });
      await sp.registerNewContest(5, 11, "ipfs://n", { from: owner });
      await sp.registerNewContest(6, 12, "ipfs://n", { from: owner });
      assert.equal((await sp.totalSupply()).toString(), tokens(10000).toString());
    });

    it("rejects scores outside [1, 10]", async () => {
      await expectRevert(sp.registerNewContest(0, 1, "x", { from: owner }));
      await expectRevert(sp.registerNewContest(11, 2, "x", { from: owner }));
    });

    it("rejects registrations from accounts other than the owner", async () => {
      await expectRevert(sp.registerNewContest(8, 1, "x", { from: other }), "Ownable: caller is not the owner");
    });
  });

  describe("value rule parameters", () => {
    it("only the owner can change them", async () => {
      await expectRevert(sp.setValueOptions(8, 3, 1000, { from: other }), "Ownable: caller is not the owner");
    });

    it("rejects invalid bounds and a zero share", async () => {
      await expectRevert(sp.setValueOptions(10, 2, 1, { from: owner }));   // up = 10
      await expectRevert(sp.setValueOptions(6, 1, 1, { from: owner }));    // down = 1
      await expectRevert(sp.setValueOptions(5, 5, 1, { from: owner }));    // down = up
      await expectRevert(sp.setValueOptions(8, 3, 0, { from: owner }));    // share = 0
    });

    it("applies the new parameters (share in whole tokens)", async () => {
      await sp.setValueOptions(8, 3, 1000, { from: owner });
      assert.equal((await sp.getscorelimitup()).toNumber(), 8);
      assert.equal((await sp.getscorelimitdown()).toNumber(), 3);
      assert.equal((await sp.getShare()).toString(), tokens(1000).toString());
      await sp.registerNewContest(9, 1, "ipfs://doc-1", { from: owner });
      assert.equal((await sp.totalSupply()).toString(), tokens(9000).toString());
    });
  });

  describe("athlete profile", () => {
    it("setUserData is restricted to the owner", async () => {
      await expectRevert(sp.setUserData("X", "M", "IT", 1990, { from: other }), "Ownable: caller is not the owner");
      await sp.setUserData("Test Athlete", "M", "IT", 1995, { from: owner });
      assert.equal(await sp.getName(), "Test Athlete");
      assert.equal((await sp.getYearOfBirth()).toNumber(), 1995);
    });
  });

  describe("link to the exchange", () => {
    it("is set only once, only by the owner and with a non-zero address", async () => {
      await expectRevert(sp.setExchangeAddress(other, { from: other }), "Ownable: caller is not the owner");
      await expectRevert(sp.setExchangeAddress("0x0000000000000000000000000000000000000000", { from: owner }));
      const tx = await sp.setExchangeAddress(accounts[2], { from: owner });
      assert.ok(tx.logs.find((l) => l.event === "ExchangeLinked"), "missing ExchangeLinked event");
      await expectRevert(sp.setExchangeAddress(accounts[3], { from: owner }));
    });
  });

  describe("gas costs (informative)", () => {
    it("reports the gas of deployment and registration", async () => {
      const deploy = await web3.eth.getTransactionReceipt(sp.transactionHash);
      const tx = await sp.registerNewContest(8, 1, "ipfs://doc-1", { from: owner });
      console.log("        gas deploy Sportract:   " + deploy.gasUsed);
      console.log("        gas registerNewContest: " + tx.receipt.gasUsed);
    });
  });
});
