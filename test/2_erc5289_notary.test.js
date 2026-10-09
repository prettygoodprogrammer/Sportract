// Thesis, section 5.6 - Tests of the ERC-5289 notarization
const Sportract = artifacts.require("Sportract");
const { tokens, expectRevert, interfaceId } = require("./helpers");

const ZERO = "0x0000000000000000000000000000000000000000";
const ERC5289_ID = interfaceId([
  "legalDocument(uint16)",
  "documentSigned(address,uint16)",
  "documentSignedAt(address,uint16)",
  "signDocument(address,uint16)",
]);
const ERC165_ID = "0x01ffc9a7";

contract("Sportract - ERC-5289 notarization", (accounts) => {
  const [owner, other] = accounts;
  let sp;

  beforeEach(async () => {
    sp = await Sportract.new("Sportract Athlete Token", "SPRT", tokens(10000), { from: owner });
  });

  it("every registration signs the document and emits DocumentSigned", async () => {
    const tx = await sp.registerNewContest(5, 7, "ipfs://doc-7", { from: owner });
    const ev = tx.logs.find((l) => l.event === "DocumentSigned");
    assert.ok(ev, "missing DocumentSigned event");
    assert.equal(ev.args.signer, owner);
    assert.equal(ev.args.documentId.toNumber(), 7);
  });

  it("documentSigned, documentSignedAt and legalDocument return the signature data", async () => {
    const tx = await sp.registerNewContest(5, 7, "ipfs://doc-7", { from: owner });
    const block = await web3.eth.getBlock(tx.receipt.blockNumber);
    assert.isTrue(await sp.documentSigned(owner, 7));
    assert.isFalse(await sp.documentSigned(other, 7));
    assert.equal((await sp.documentSignedAt(owner, 7)).toString(), String(block.timestamp));
    assert.equal((await sp.documentSignedAt(other, 7)).toString(), "0");
    assert.equal(await sp.legalDocument(7), "ipfs://doc-7");
  });

  it("a document never signed is not signed by anyone, not even address(0)", async () => {
    assert.isFalse(await sp.documentSigned(ZERO, 999));
    assert.equal(await sp.legalDocument(999), "");
  });

  it("a signed document cannot be overwritten", async () => {
    await sp.registerNewContest(5, 7, "ipfs://doc-7", { from: owner });
    await expectRevert(sp.registerNewContest(6, 7, "ipfs://altro", { from: owner }), "ERC5289: document already signed");
    assert.equal(await sp.legalDocument(7), "ipfs://doc-7");
  });

  it("nobody can sign on behalf of another address", async () => {
    const sign2 = sp.methods["signDocument(address,uint16)"];
    await expectRevert(sign2(other, 501, { from: owner }), "ERC5289: signer must be the caller");
    await expectRevert(sign2(owner, 502, { from: other }));   // after the fix of D3 the revert reason comes from onlyOwner
  });

  it("declares the ERC-5289 and ERC-165 interfaces (supportsInterface)", async () => {
    assert.isTrue(await sp.supportsInterface(ERC5289_ID));
    assert.isTrue(await sp.supportsInterface(ERC165_ID));
    assert.isFalse(await sp.supportsInterface("0xffffffff"));
  });
});
