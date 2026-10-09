// Defects D1-D3 found in the 2023 version (thesis, section 6.8).
// The tests describe the correct behaviour: they failed on the original version,
// they pass after the fixes and remain as regression tests.
const Sportract = artifacts.require("Sportract");
const { tokens, expectRevert } = require("./helpers");

contract("Sportract - defects D1-D3 (regression)", (accounts) => {
  const [owner, other, holder] = accounts;
  let sp;

  beforeEach(async () => {
    sp = await Sportract.new("Sportract Athlete Token", "SPRT", tokens(10000), { from: owner });
  });

  // D1 - access control: the single setters of the profile had no onlyOwner,
  //      so anyone could bypass setUserData and overwrite the athlete's data.
  it("D1: a third party cannot change the profile data", async () => {
    await expectRevert(sp.setName("Intruso", { from: other }), "Ownable: caller is not the owner");
    await expectRevert(sp.setCountry("XX", { from: other }), "Ownable: caller is not the owner");
    await expectRevert(sp.setGender("X", { from: other }), "Ownable: caller is not the owner");
    await expectRevert(sp.setYearofbirth(1900, { from: other }), "Ownable: caller is not the owner");
  });

  // D2 - blocked registration: if the balance to burn from is insufficient,
  //      _burn reverts and a good result can be neither registered nor notarized.
  it("D2: a good result is registered even if the balance to burn from is insufficient", async () => {
    await sp.transfer(holder, tokens(9900), { from: owner });   // the owner keeps 100 tokens
    await sp.registerNewContest(9, 1, "ipfs://doc-1", { from: owner });
    assert.isTrue(await sp.documentSigned(owner, 1));
  });

  // D3 - denial of service: signDocument was public, so a third party could sign a
  //      documentId first and prevent the owner from registering that contest.
  it("D3: a third party cannot take a documentId and block the registration", async () => {
    const sign2 = sp.methods["signDocument(address,uint16)"];
    try { await sign2(other, 500, { from: other }); } catch (e) { /* rejected: signing is restricted to the owner */ }
    await sp.registerNewContest(5, 500, "ipfs://doc-500", { from: owner });
    assert.isTrue(await sp.documentSigned(owner, 500));
  });
});
