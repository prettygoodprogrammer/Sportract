// Helper functions shared by the tests (contains no tests).
const { toBN, toWei } = web3.utils;

// Amount of tokens with 18 decimals, as BN
const tokens = (n) => toBN(toWei(String(n), "ether"));

// Amount of ether in wei, as a string (to be used in { value: ... })
const eth = (n) => toWei(String(n), "ether");

// Converts any numeric value returned by Truffle (BN, string, number) to BigInt.
// Computations in the tests use BigInt; values passed to the contracts are always strings (.toString()).
const big = (x) => BigInt(x.toString());

// Deadline for the functions of the exchange: timestamp of the latest block + s seconds
async function deadline(s = 300) {
  return (await web3.eth.getBlock("latest")).timestamp + s;
}

// Ether balance (wei) of an address, as BigInt
const ethBalance = async (a) => BigInt(await web3.eth.getBalance(a));

// Checks that the transaction reverts; if reason is given, checks the revert message
async function expectRevert(promise, reason) {
  try {
    await promise;
  } catch (e) {
    assert.include(e.message, "revert", "error other than a revert: " + e.message);
    if (reason) assert.include(e.message, reason, "unexpected revert message");
    return;
  }
  assert.fail("the transaction should have reverted" + (reason ? " (" + reason + ")" : ""));
}

// interfaceId = XOR of the selectors of the functions declared in the interface
function interfaceId(signatures) {
  let id = 0n;
  for (const s of signatures) id ^= BigInt(web3.eth.abi.encodeFunctionSignature(s));
  return "0x" + id.toString(16).padStart(8, "0");
}

// Uniswap V1 pricing formulas (thesis, section 3.2), in integer arithmetic as in the contract
const inputPrice = (dx, x, y) => (dx * 997n * y) / (x * 1000n + dx * 997n);
const outputPrice = (dy, x, y) => (x * dy * 1000n) / ((y - dy) * 997n) + 1n;

// Deploys the system as the migration does: Sportract, SportExchange, link
async function deploySystem(owner, supply = 10000) {
  const Sportract = artifacts.require("Sportract");
  const SportExchange = artifacts.require("SportExchange");
  const sp = await Sportract.new("Sportract Athlete Token", "SPRT", tokens(supply), { from: owner });
  const ex = await SportExchange.new("Sportract LP", "SPRT-LP", sp.address, { from: owner });
  await sp.setExchangeAddress(ex.address, { from: owner });
  return { sp, ex };
}

// Reserves of the pool: x (ether) and y (tokens), as BigInt
async function reserves(sp, ex) {
  return { x: await ethBalance(ex.address), y: big(await sp.balanceOf(ex.address)) };
}

module.exports = {
  tokens, eth, big, deadline, ethBalance, expectRevert, interfaceId,
  inputPrice, outputPrice, deploySystem, reserves,
};
