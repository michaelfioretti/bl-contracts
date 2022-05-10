require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-solhint");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-abi-exporter");
require("hardhat-tracer");
require("hardhat-gas-reporter");
require("solidity-coverage");

const etherscanApiKey = getEtherscanApiKey();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    mainnet: mainnetNetworkConfig(),
    goerli: goerliNetworkConfig()
  },
  abiExporter: {
    path: "./build/abi",
    clear: true,
    flat: true,
    spacing: 2,
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 30,
    coinmarketcap: '291218cf-542d-4b86-811f-151478225782'
  },
  etherscan: {
    apiKey: `${etherscanApiKey}`,
  },
};

function mainnetNetworkConfig() {
  let url = "https://mainnet.infura.io/v3/";
  let accountPrivateKey =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (process.env.MAINNET_ENDPOINT) {
    url = `${process.env.MAINNET_ENDPOINT}`;
  }

  if (process.env.MAINNET_PRIVATE_KEY) {
    accountPrivateKey = `${process.env.MAINNET_PRIVATE_KEY}`;
  }

  return {
    url: url,
    accounts: [accountPrivateKey],
  };
}

function goerliNetworkConfig() {
  let url = "https://goerli.infura.io/v3/";
  let accountPrivateKey =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (process.env.GOERLI_ENDPOINT) {
    url = `${process.env.GOERLI_ENDPOINT}`;
  }

  if (process.env.GOERLI_PRIVATE_KEY) {
    accountPrivateKey = `${process.env.GOERLI_PRIVATE_KEY}`;
  }

  return {
    url: url,
    accounts: [accountPrivateKey],
  };
}

function getEtherscanApiKey() {
  let apiKey = "";
  if (process.env.ETHERSCAN_API_KEY) {
    apiKey = `${process.env.ETHERSCAN_API_KEY}`;
  }
  return apiKey;
}