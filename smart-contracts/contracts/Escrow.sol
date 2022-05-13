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

    // Emitted when an escrow is created
    event created(
        address indexed source,
        address indexed destination,
        uint256 indexed created,
        uint256 timeHorizon,
        uint256 amountInEscrow,
        uint256 escrowIndex
    );

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
    event refunded(
        address indexed source,
        address indexed destination,
        uint256 indexed created,
        uint256 timeHorizon,
        uint256 amountInEscrow
    );

    event newAdmin(
        address indexed newAdmin,
        uint256 indexed transferAt
    );

    /* ======== STRUCTS ======== */

    // Define an escrow
    struct Escrow {
        address source; // Originator
        address destination; // Receiver address
        uint256 total; // Total amount of ETH in wei
        uint256 timeHorizon; // Time in seconds that the escrow will exist before being refunded
        uint256 amountInEscrow; // The current amount of ETH in the escrow
        uint256 created; // Epoch when escrow was created
    }

    /* ======== STATE VARIABLES ======== */

    Escrow[] public activeEscrows;
    address public admin;

    constructor(address _admin) {
        require(msg.sender != address(0));
        require(_admin != address(0));
        admin = _admin;
    }

    function transferAdmin(address _newAdmin) onlyAdmin public {
        require(_newAdmin != address(0));
        admin = _newAdmin;
        emit newAdmin(_newAdmin, block.timestamp);
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
    ) external nonReentrant returns (uint256) {
        require(_total > 0, "Escrow: Total cannot be 0");
        require(
            _destination != address(0),
            "Escrow: Destination address cannot be empty"
        );
        require(_timeHorizon > 0, "Escrow: Time horizon cannot be 0");

        // Now that we have validated, we will store the escrow
        activeEscrows.push(
            Escrow({
                source: _source,
                destination: _destination,
                total: _total,
                timeHorizon: _timeHorizon,
                amountInEscrow: 0,
                created: block.timestamp
            })
        );

        emit created(
            _source,
            _destination,
            block.timestamp,
            _timeHorizon,
            0,
            activeEscrows.length - 1
        );

        return activeEscrows.length - 1;
    }

    event isItExpired(bool expired);

    function fundEscrow(uint256 _escrowIndex) public payable nonReentrant {
        require(msg.sender != address(0));

        if (escrowHasExpired(_escrowIndex)) {
            return issueRefund(_escrowIndex);
        }

        Escrow storage escrow = activeEscrows[_escrowIndex];

        require(escrow.total > 0, "Escrow: No active escrow for msg.sender");
        require(
            escrow.destination != address(0),
            "Escrow: No active escrow for msg.sender"
        );

        require(
            escrow.amountInEscrow < escrow.total,
            "Escrow: Already fully funded"
        );

        require(msg.value > 0, "Escrow: Cannot fund escrow with 0 ETH");

        escrow.amountInEscrow += msg.value;
        if (escrow.amountInEscrow >= escrow.total) {
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

    /**
        @notice Releases a completed escrow to the destination address
        @param _escrowIndex The index of the active escrow
    */
    function releaseEscrow(uint256 _escrowIndex)
        public
        onlyAdmin
        nonReentrant
        refundOnExpired(_escrowIndex)
    {
        Escrow storage escrow = activeEscrows[_escrowIndex];
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
            escrow.source,
            escrow.destination,
            escrow.created,
            escrow.timeHorizon,
            escrow.amountInEscrow
        );

        removeEscrowFromMap(_escrowIndex);
    }

    function rejectEscrow(uint256 _escrowIndex) public onlyAdmin nonReentrant {
        issueRefund(_escrowIndex);
    }

    function refundAllExpiredEscrows() public onlyAdmin {
        for (uint256 i = 0; i < activeEscrows.length; i++) {
            if (escrowHasExpired(i)) {
                issueRefund(i);
            }
        }
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
    modifier refundOnExpired(uint256 _escrowIndex) {
        if (escrowHasExpired(_escrowIndex)) {
            issueRefund(_escrowIndex);
        } else {
            _;
        }
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Escrow: User is not admin");
        _;
    }

    /* ======== INTERNAL HELPER FUNCTIONS ======== */

    function escrowHasExpired(uint256 _escrowIndex)
        internal
        view
        returns (bool)
    {
        Escrow storage escrow = activeEscrows[_escrowIndex];
        uint256 currentTime = block.timestamp;
        return (currentTime -= escrow.created) > escrow.timeHorizon;
    }

    function issueRefund(uint256 _escrowIndex) internal {
        Escrow memory escrow = activeEscrows[_escrowIndex];
        uint256 amount = escrow.amountInEscrow;
        escrow.amountInEscrow = 0;
        payable(msg.sender).transfer(amount);

        removeEscrowFromMap(_escrowIndex);

        emit refunded(
            msg.sender,
            escrow.destination,
            escrow.created,
            escrow.timeHorizon,
            amount
        );
    }

    function removeEscrowFromMap(uint256 _index) internal {
        require(activeEscrows.length > _index, "Escrow: Attempting to remove escrow will result in ut of bounds error");
        delete activeEscrows[_index];
    }
}
