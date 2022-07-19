const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer

          beforeEach(async function () {
              // how to get the deployer account and save it globally
              deployer = (await getNamedAccounts()).deployer
              // get raffle contract and connect it to the deployer
              raffle = await ethers.getContract("Raffle", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fullfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
                  // enter the raffle (all we should need to do since the Chainlink Keepers and Chainlink VRF should do everything else)
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              // add our asserts here
                              const recentWinner =
                                  await raffle.getRecentWinner()
                              const raffleState = raffle.getRaffleState()
                              const winnerEndingBalance =
                                  await accounts[0].getBalance()
                              const endingTimeStamp =
                                  await raggle.getLatestTimeStamp()

                              // Checks if players array is reset
                              // since there shouldn't be an entry at the first index
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              // The deployer address should win
                              assert.equal(
                                  recentWinner.toString(),
                                  accounts[0].address
                              )
                              // Should be back in OPEN state
                              assert.equal(raffleState, 0)
                              assert
                                  .equal(
                                      winnerEndingBalance.toString(),
                                      winnerStartingBalance.add(
                                          raffleEntranceFee
                                      )
                                  )
                                  .toString()
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(e)
                          }
                      })
                  })

                  // Setup listener before we enter the raffle
                  // Just in case the blockchain moves really fast
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const winnerStartingBalance = await accounts[0].getBalance()

                  // and this code WONT complete until our listener has finished listening!
                  // it will get here and say "We're at the end of the code are we done running?"
                  // No we aren't because resolve() or reject() has not been called yet
                  // and neither of them can be called until the listner is fired
                  // so it waits for the listener to fire and then do the assert
                  // because the promise can't return until the resolve() or reject() is reached
                  // and we have placed those in our try catch after all the asserts (or if it fails obviously)
              })
          })
      })
