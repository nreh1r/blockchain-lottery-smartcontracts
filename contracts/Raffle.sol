// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

// A virtual function means it expects to be overriden
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

// Raffle

// Enter the lotter (paying some amount)
// Pick a random winner (verifiably random)
// Winner to be selected every X minutes -> completely automated

// Chainlink Oracle -> Randomness, Automated Execution

error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(
    uint256 currentBalance,
    uint256 numPlayers,
    uint256 raffleState
);

/** @title A sample Raffle Contract
 *  @author Andre Tobias
 *  @notice This contract is for creating an untamperable decentralized smart contract
 *  @dev This implements Chainlink VRF v2 and Chainlink Keepers
 */
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Type declarations */
    enum RaffleState {
        OPEN,
        CALCULATING
    } // uint256 0 = OPEN, 1 = CALCULATING

    /* State variables */
    uint256 private immutable i_entranceFee;
    // need to be able to pay the players
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 1;

    // Lottery Variables
    address private s_recentWinner;
    //uint256 private s_state; // to pending, open, closed, calculating
    // ^ use an enum instead
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    /* Events */
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    /* Functions */
    constructor(
        address vrfCoordinatorV2, // contract (address --> mocks)
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        // require (msg.value > i_entranceFee, "Not enough ETH!")
        // using revert below is more gas efficient than the error above
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }

        // need to wrap msg.sender in payable because it is not
        // a payable address at the start
        // "typecast"
        s_players.push(payable(msg.sender));

        // Events
        // Emit an event when we update a dynamic array or mapping
        // Named events with the function name reversed
        emit RaffleEnter(msg.sender);
    }

    /**
     *  @dev This is the function that the Chainlink Keeper nodes call
     *  they look for the "upkeepNeeded" to return true.
     *  The following should be true in order to reutrn true:
     *  1. Our time interval should have passed
     *  2. The lottery should have at least 1 player, and have some ETH
     *  3. Our subscription is funded with LINK
     *  4. The lottery should be in an "open" state.
     */
    function checkUpkeep(
        bytes memory /*checkData*/
    )
        public
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        // (block.timestamp - last block timestamp) > interval
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    // External functions are cheper because the contract can't call it
    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        // Request the random number
        // Once we get it, do something with it
        // 2 transactrion process

        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, // gasLane (set a ceiliing if gas goes too high)
            i_subscriptionId, // uint64
            REQUEST_CONFIRMATIONS, // uint16 (constant of 3)
            i_callbackGasLimit, // Limit for how much computation our fullfil randomwords can be
            NUM_WORDS // How many random numbers you want to get
        );
        // This is redundant!!
        // The VRFCoordinator also emits the same requestId
        emit RequestedRaffleWinner(requestId);
    }

    function fulfillRandomWords(
        // How to sorta void out an unused but required parameter?
        // idk?
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        // modulo function (modulus)
        // randomNumber 202
        // 202 % 10 what doesn't divide evenly into 202?
        // 20 * 10 = 200
        // 2
        // 202 % 10 = 2
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0);
        s_lastTimeStamp = block.timestamp;
        // How to send all the money to the recentWinner
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        // require(success)
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    /* View / Pure Functions */
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    // Pure function because constants are in the byte code
    // so the return is the same as return 1;
    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
