const Sportract = artifacts.require("Sportract");
const SportExchange = artifacts.require("SportExchange");

// Deployment of the system in three steps (thesis, section 5.2):
//  1. Sportract: name, symbol and initial supply of 10,000 tokens, assigned to the deploying account (owner)
//  2. SportExchange: name and symbol of the liquidity token (SPRT-LP) and address of Sportract
//  3. Sportract stores the address of the exchange (only once)
module.exports = async function (deployer) {
  await deployer.deploy(Sportract, "Sportract Athlete Token", "SPRT", web3.utils.toWei("10000", "ether"));
  const sportract = await Sportract.deployed();

  await deployer.deploy(SportExchange, "Sportract LP", "SPRT-LP", sportract.address);
  const exchange = await SportExchange.deployed();

  await sportract.setExchangeAddress(exchange.address);
};
