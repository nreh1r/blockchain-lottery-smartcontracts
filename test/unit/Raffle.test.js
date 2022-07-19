const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle,
              vrfCoordinatorV2Mock,
              raffleEntranceFee,
              deployer,
              interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              // how to get the deployer account and save it globally
              deployer = (await getNamedAccounts()).deployer
              // this is how you delpoy with specific tags
              await deployments.fixture(["all"])
              // get raffle contract and connect it to the deployer
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  deployer
              )
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constsructor", function () {
              it("initializes the raffle correctly", async function () {
                  // Ideally we make our tst have just 1 aaert per "it"
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId]["interval"]
                  )
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEntered"
                  )
              })
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("emits event on enter", async function () {
                  // How to write a test for events being emmitted
                  // emit(contract, "name of event")
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.emit(raffle, "RaffleEnter")
              })
              it("doesn't allow entrance when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  // increase time by whatever our interval is to ensure
                  // that we can get checkUpkeep to return true
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  // need to mine the block after we increase the time to
                  // get the keeper to fire
                  await network.provider.send("evm_mine", [])
                  // await network.provider.request({method: "evm_mine", params: []})
                  // ^ is the same as the line above it (the top is just a little quicker to write)

                  // We pretend to be a Chainlink Keeper
                  // we can do this now that we have set checkUpkeep to true
                  // the empty array is how you pass it some empty calldata with nothing in it
                  await raffle.performUpkeep([])
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.be.revertedWith("Raffle__NotOpen")
              })
          })
          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  // How to call checkUpkeep without running a transaction
                  // callStatic simulates sending the transaction to see what the return
                  // will be
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      []
                  )
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  // A blank bytes object can also be sent as "0x"
                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      []
                  )
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() - 1,
                  ])
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      "0x"
                  )
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      "0x"
                  )
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("it can only run if checkUpkeep us true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("reverts when checkUpkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      // revert in raffle.sol has more things being reverted than just the error
                      // the test will know that the name is good enough but if we wanted to we can
                      // string interpolate to add all the revert elements
                      "Raffle__UpkeepNotNeeded"
                  )
              })
              it("updates the raffle state, emits an event, and calls the vrf coordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await raffle.performUpkeep([])
                  const txReceipt = await txResponse.wait()
                  const requestId = txReceipt.events[1].args.requestId
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState.toString() == "1")
              })
          })
          describe("fullfillRandomWords", function () {
              // want to make sure someone has entered the raffle before
              // doing any tests in here
              beforeEach(async function () {
                  // make checkUpkeep true
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpkeep", async function () {
                  // fulfillRandomWords needs an Id and an address
                  // the address is the contract address?
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })
              // Wayyyyy to big
              it("picks a winner, resets the lottery, and sends money", async function () {
                  // Add three more people to the raffle
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 // deployer = 0
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({
                          value: raffleEntranceFee,
                      })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  // performUpkeep (mock being chainlink keepers)
                  // fulfillRandomWords (mock being the Chainlink VRF)
                  // We will have to wait for the fulfillRandomWords to be called

                  // Setting a timeout in hardhat config will make this fail in 200 seconds
                  // if raffle.once is not called within 200 seconds
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event!")
                          try {
                              const recentWinner =
                                  await raffle.getRecentWinner()
                              // Find which account is the winner
                              console.log(recentWinner)
                              console.log(accounts[2].address)
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[3].address)
                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp =
                                  await raffle.getLatestTimeStamp()
                              // Assert that s_players[] has been reset to zero
                              const numPlayers =
                                  await raffle.getNumberOfPlayers()
                              const winnerEndingBalance =
                                  await accounts[1].getBalance()
                              assert.equal(numPlayers.toString(), "0")
                              // Raffle state should be back to open
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)

                              // Make sure the winner got paid
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      raffleEntranceFee
                                          .mul(additionalEntrants)
                                          .add(raffleEntranceFee)
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      // Setting up the listener

                      // below, we will fire the event, and the listeneer will pick it
                      // up, and resolve
                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance =
                          await accounts[1].getBalance()
                      // when this function is called it should emit "WinnerPicked"
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                      // This code calls for the random number
                      // The promise is required because on a testnet we don't really know
                      // when a transaction is going to finish and therefore we have
                      // to setup a promise with a listener
                  })
              })
          })
      })
