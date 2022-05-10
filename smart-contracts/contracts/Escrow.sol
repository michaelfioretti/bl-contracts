// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/*
 * Escrow Contract
 *
 * This contract implements a managed Escrow service that allows a source user
 * to send currencies to a destination user with ACL.
 */
contract EscrowService is Ownable, ReentrancyGuard {
    /* ======== EVENTS ======== */

    // Emitted when escrow is fully funded and ready to send to receiver
    event funded(
        address indexed source,
        address indexed destination,
        uint256 indexed created,
        uint256 timeHorizon,
        uint256 amountInEscrow
    );

    // Emitted when escrow is released to user
    event completed(
        address indexed source,
        address indexed destination,
        uint256 indexed created,
        uint256 timeHorizon,
        uint256 amountInEscrow
    );

    // Emitted when an escrow's horizon expires
    event refund(
        address indexed source,
        address indexed destination,
        uint256 indexed created,
        uint256 timeHorizon,
        uint256 amountInEscrow
    );

    uint256 total; // Total amount of ETH in wei
    address destination; // Receiver address
    uint256 timeHorizon; // Time in seconds that the escrow will exist before being refunded
    uint256 amountInEscrow; // The current amount of ETH in the escrow
    uint256 created; // Epoch when escrow was created

    /* ======== STRUCTS ======== */

    // Define an escrow
    struct Escrow {
        uint256 total; // Total amount of ETH in wei
        address destination; // Receiver address
        uint256 timeHorizon; // Time in seconds that the escrow will exist before being refunded
        uint256 amountInEscrow; // The current amount of ETH in the escrow
        uint256 created; // Epoch when escrow was created
    }

    /* ======== STATE VARIABLES ======== */

    mapping(address => Escrow) public activeEscrows;

    constructor() {
        require(msg.sender != address(0));
    }

    /**
     * @notice Initialize a Escrow service.
     * @param _source         The user sending ETH to the escrow
     * @param _destination    The destination address
     * @param _total          The amount of ETH going into the Escrow
     * @param _timeHorizon    How long in seconds before the escrow expires
     */
    function createEscrow(
        address _source,
        address _destination,
        uint256 _total,
        uint256 _timeHorizon
    ) external onlyOwner nonReentrant {
        require(_total > 0, "Escrow: Total cannot be 0");
        require(
            _destination != address(0),
            "Escrow: Destination address cannot be empty"
        );
        require(_timeHorizon > 0, "Escrow: Time horizon cannot be 0");

        // Now that we have validated, we will store the escrow
        activeEscrows[_source] = Escrow({
            total: _total,
            destination: _destination,
            timeHorizon: _timeHorizon,
            amountInEscrow: 0,
            created: block.timestamp
        });
    }

    function fundEscrow() public payable nonReentrant {
        require(msg.sender != address(0));

        Escrow storage escrow = activeEscrows[msg.sender];
        require(escrow.total > 0, "Escrow: No active escrow for msg.sender");
        require(
            escrow.destination != address(0),
            "Escrow: No active escrow for msg.sender"
        );

        require(escrow.amountInEscrow < escrow.total, "Escrow: Already fully funded");

        // Now that the escrow has been loaded in, we will add the funds
        // that the user is sending to the escrow, emitting the 'funded' event
        // if it equals or exceeds the escrow's total
        if (escrowHasExpired(msg.sender)) {
            issueRefund(msg.sender);
        } else {
            // Add the funds to the escrow
            require(msg.value > 0, "Escrow: Cannot fund escrow with 0 ETH");
            escrow.amountInEscrow += msg.value;
            if (escrow.amountInEscrow > escrow.total) {
                // Escrow is funded and ready to be sent to the destination
                emit funded(
                    msg.sender,
                    escrow.destination,
                    escrow.created,
                    escrow.timeHorizon,
                    escrow.amountInEscrow
                );
            }
        }
    }

    /**
        @notice Releases a completed escrow to the destination address
        @param _source The source address of the escrow account
    */
    function releaseEscrow(address _source)
        public
        onlyOwner
        nonReentrant
        isSourceValid(_source)
        refundOnExpired(_source)
    {
        Escrow storage escrow = activeEscrows[_source];
        require(
            escrow.amountInEscrow >= escrow.total,
            "Escrow: Escrow total has not been met yet"
        );
        require(
            address(this).balance >= escrow.amountInEscrow,
            "Escrow: Not enough ETH to cover payment"
        );
        require(
            escrow.destination != address(0),
            "Escrow: No active escrow for msg.sender"
        );

        // Release funds and remove escrow from management
        uint256 amount = escrow.amountInEscrow;
        escrow.amountInEscrow = 0;
        payable(escrow.destination).transfer(amount);

        emit completed(
            _source,
            escrow.destination,
            escrow.created,
            escrow.timeHorizon,
            escrow.amountInEscrow
        );

        delete activeEscrows[_source];
    }

    function rejectEscrow(address _source)
        public
        onlyOwner
        nonReentrant
        isSourceValid(_source)
    {
        issueRefund(_source);
    }

    /* ======== CUSTOM MODIFIER FUNCTIONS ======== */

    /**
        @notice Checks to make sure the address passed in is not 0x00
     */
    modifier isSourceValid(address _source) {
        require(_source != address(0), "Escrow: Source address cannot be 0");
        _;
    }

    /**
        @notice Checks an escrow to see if it has expired. If it has, then it
        will refund the _source address. Otherwise it will continue 
    */
    modifier refundOnExpired(address _source) {
        if (escrowHasExpired(_source)) {
            issueRefund(_source);
        } else {
            _;
        }
    }

    /* ======== INTERNAL HELPER FUNCTIONS ======== */

    /**
     *  @notice Checks to see if an escrow has expired
     *  @param _source  The source address for the escrow
     *  @return bool
     */
    function escrowHasExpired(address _source) internal view returns (bool) {
        Escrow storage escrow = activeEscrows[_source];
        uint256 currentTime = block.timestamp;
        return (currentTime -= escrow.created) > escrow.timeHorizon;
    }

    function issueRefund(address _source) internal {
        Escrow memory escrow = activeEscrows[_source];
        uint256 amount = escrow.amountInEscrow;
        escrow.amountInEscrow = 0;
        payable(msg.sender).transfer(amount);

        emit refund(
            msg.sender,
            escrow.destination,
            escrow.created,
            escrow.timeHorizon,
            amount
        );

        delete activeEscrows[msg.sender];
    }
}
