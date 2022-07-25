# blockchain-lottery-smartcontracts

To view the frontend code please [click here](https://github.com/nreh1r/blockchain-lottery)

## Project Summary

**Currently the Rinkeby Testnet is unreliable and the lottery is not live as a result, this will be fixed shortly.**

This repository features the smart contracts for the blockchain lottery. I used Solidity to develop the smart contracts, so that they can be compatible with any EVM blockchain. Hardhat was used as the development and testing framework. Unit testing, and some staging tests, was performed in hardhat on the hardhat local network, which is while you will find mocks included with the lottery contract, the Rinkeby test net, and a forked mainnet. The contract that the front end is connected to is live on the rinkeby test net. 

The lottery functions by utilizing Chainlink Keepers and Chainlink VRF. Together these external smart contracts communicate with the lottery contract to decide if a winner needs to be selected and if they do the Keepers will call the VRF and the VRF will provide a verifiably random number back to the lottery smart contract. The lottery smart contract will then take that number and will use it to pick a winner from a list of current participants. Once the winner is selected the contract immediately sends the balance (in ETH) that is present in the smart contract to the winner, and saves the winner as the previous winner. 

## Technologies/Languages Used
- Hardhat
- Node.js
- JavaScript
- Solidity
- 
