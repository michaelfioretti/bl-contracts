// Load dependencies and set constants
const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const DAY_IN_SECONDS = 86400
const DAY_IN_BLOCKS = 5760;

// Helper functions

/**
 * Increases Hardhat's local blockchain by X blocks
 * This is used for time dependant tests
 * *
 * @param   {Int}   blocks  The number of blocks to increase by
 *
 * @return  {void}          
 */
async function increaseTime(blocks) {
    await ethers.provider.send("hardhat_mine", [`0x${(blocks).toString("16")}`]);
}

describe("Managed Escrow Service", async (accounts) => {
    let owner;
    let alice;
    let bob;
    let addrs;
    let EscrowInstance

    before(async function () {
        const ManagedEscrowService = await ethers.getContractFactory("EscrowService");
        [owner, alice, bob, ...addrs] = await ethers.getSigners();

        EscrowInstance = await ManagedEscrowService.deploy()
    });

    describe("Initialization", () => {
        it("Should set the admin/owner as owner address", async () => {
            const admin = await EscrowInstance.owner();
            expect(owner.address).to.equal(admin);
        });
    })

    describe("Escrow Creation", () => {
        it(`Should only allow the owner to create an escrow`, async () => {
            expect(
                EscrowInstance.connect(alice).createEscrow(
                    alice.address,
                    bob.address,
                    ethers.utils.parseEther("0.01"),
                    DAY_IN_SECONDS
                )
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it(`Should not allow escrow to be created if amount <= 0`, async () => {
            expect(
                EscrowInstance.connect(owner).createEscrow(
                    alice.address,
                    bob.address,
                    ethers.utils.parseEther("0.00"),
                    DAY_IN_SECONDS
                )
            ).to.be.revertedWith("Escrow: Total cannot be 0");
        });

        it(`Should not allow escrow to be created destination is 0x00 or empty`, async () => {
            expect(
                EscrowInstance.connect(owner).createEscrow(
                    alice.address,
                    "0x00",
                    ethers.utils.parseEther("0.01"),
                    DAY_IN_SECONDS
                )
            ).to.be.revertedWith("Escrow: Total cannot be 0");
        });

        it(`Should not allow escrow to be created if time horizon is <= 0`, async () => {
            expect(
                EscrowInstance.connect(owner).createEscrow(
                    alice.address,
                    bob.address,
                    ethers.utils.parseEther("0.01"),
                    0
                )
            ).to.be.revertedWith("Escrow: Total cannot be 0");
        });

        it(`Should create an escrow`, async () => {
            await EscrowInstance.connect(owner).createEscrow(
                alice.address,
                bob.address,
                ethers.utils.parseEther("0.01"),
                DAY_IN_SECONDS
            )

            const newEscrow = await EscrowInstance.activeEscrows(alice.address)

            expect(newEscrow.total.toString()).to.be.equal(ethers.utils.parseEther("0.01"))
            expect(newEscrow.destination.toString()).to.be.equal(bob.address)
            expect(newEscrow.timeHorizon.toNumber()).to.be.equal(DAY_IN_SECONDS)
            expect(newEscrow.amountInEscrow.toNumber()).to.be.equal(0)
            expect(newEscrow.created.toNumber()).to.be.greaterThan(0)
        });
    });

    describe("Escrow Funding", async () => {
        it(`Should not fund if msg.value is <= 0`, async () => {
            expect(
                EscrowInstance.connect(alice).fundEscrow({
                    value: ethers.utils.parseEther("0")
                })
            ).to.be.revertedWith("Escrow: Cannot fund escrow with 0 ETH");
        });

        it("Should partially fund the escrow", async () => {
            await EscrowInstance.connect(alice).fundEscrow({
                value: ethers.utils.parseEther("0.001")
            })

            const currentServiceBalance = await ethers.provider.getBalance(EscrowInstance.address)
            expect(currentServiceBalance.toString()).to.be.equal(ethers.utils.parseEther("0.001"))

            const aliceEscrow = await EscrowInstance.activeEscrows(alice.address)
            expect(aliceEscrow.amountInEscrow.toString()).to.be.equal(ethers.utils.parseEther("0.001"))
        })

        it("Should emit the 'funded' event", async () => {
            await expect(
                EscrowInstance.connect(alice).fundEscrow({
                    value: ethers.utils.parseEther("0.01")
                })
            ).to.emit(EscrowInstance, 'funded')
        })

        it("Should not let a user keep funding a fully funded escrow", async () => {
            expect(
                EscrowInstance.connect(alice).fundEscrow({
                    value: ethers.utils.parseEther("0.01")
                })
            ).to.be.revertedWith("Escrow: Already fully funded");
        })
    })

    describe("Escrow Refunds", async () => {
        // Claim previous escrow to start fresh
        await EscrowInstance.connect(owner).releaseEscrow(alice.address)
        await EscrowInstance.connect(owner).createEscrow(
            alice.address,
            bob.address,
            ethers.utils.parseEther("0.01"),
            DAY_IN_SECONDS
        )

        it(`Should refund the amount in the escrow if it is expired`, async () => {
            await increaseTime(DAY_IN_BLOCKS * 3)

            const aliceBalanceBefore = await ethers.provider.getBalance(alice.address)

            await EscrowInstance.connect(alice).fundEscrow({
                value: ethers.utils.parseEther("0.01")
            })

            const aliceBalanceAfter = await ethers.provider.getBalance(alice.address)
            const contractBalance = await ethers.provider.getBalance(EscrowInstance.address)

            expect(contractBalance).to.be.equal("0")
            expect(aliceBalanceBefore).to.be.greaterThan(aliceBalanceBefore)
        });

        it("Should emit the 'refunded' event if expired when funding", async () => {
            // First, create new escrow, wait for expiration,
            // then check for event
            await EscrowInstance.connect(owner).createEscrow(
                alice.address,
                bob.address,
                ethers.utils.parseEther("0.01"),
                DAY_IN_SECONDS
            )

            await increaseTime(DAYS * 2)

            await expect(
                EscrowInstance.connect(alice).fundEscrow({
                    value: ethers.utils.parseEther("0.01")
                })
            ).to.emit(EscrowInstance, 'refunded')
        })

        it("Should emit the 'refunded' event if expired when releasing to destination", async () => {
            // Create and fund escrow
            await EscrowInstance.connect(owner).createEscrow(
                alice.address,
                bob.address,
                ethers.utils.parseEther("0.01"),
                DAY_IN_SECONDS
            )

            await EscrowInstance.connect(alice).fundEscrow({
                value: ethers.utils.parseEther("0.02")
            })

            await expect(
                EscrowInstance.connect(owner).releaseEscrow(alice.address)
            ).to.emit(EscrowInstance, 'refunded')
        })

        it("Should emit the 'refunded' event if admin rejects transfer", async () => {
            // Create and fund escrow
            await EscrowInstance.connect(owner).createEscrow(
                alice.address,
                bob.address,
                ethers.utils.parseEther("0.01"),
                DAY_IN_SECONDS
            )

            await EscrowInstance.connect(alice).fundEscrow({
                value: ethers.utils.parseEther("0.01")
            })

            await expect(
                EscrowInstance.connect(owner).rejectEscrow(alice.address)
            ).to.emit(EscrowInstance, 'refunded')
        })
    });

    describe("Releasing Escrow", () => {
        it(`Should only allow the owner to release funds`, async () => {
            await EscrowInstance.connect(owner).createEscrow(
                alice.address,
                bob.address,
                ethers.utils.parseEther("0.01"),
                DAY_IN_SECONDS
            )

            await EscrowInstance.connect(alice).fundEscrow({
                value: ethers.utils.parseEther("0.01")
            })

            expect(
                EscrowInstance.connect(alice).releaseEscrow(alice.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should not send funds if escrow hasn't been met yet", async () => {
            // Create and fund escrow
            await EscrowInstance.connect(owner).createEscrow(
                alice.address,
                bob.address,
                ethers.utils.parseEther("0.01"),
                DAY_IN_SECONDS
            )

            await EscrowInstance.connect(alice).fundEscrow({
                value: ethers.utils.parseEther("0.0001")
            })

            expect(
                EscrowInstance.connect(owner).releaseEscrow(alice.address)
            ).to.be.revertedWith("Escrow: Escrow total has not been met yet");
        })

        it("Should send funds to destination upon release", async () => {
            // Create and fund escrow
            await EscrowInstance.connect(owner).createEscrow(
                alice.address,
                bob.address,
                ethers.utils.parseEther("0.01"),
                DAY_IN_SECONDS
            )

            await EscrowInstance.connect(alice).fundEscrow({
                value: ethers.utils.parseEther("0.01")
            })

            const destinationBalanceBefore = await ethers.provider.getBalance(bob.address)

            await EscrowInstance.connect(owner).releaseEscrow(alice.address)

            const destinationBalanceAfter = await ethers.provider.getBalance(bob.address)

            expect(destinationBalanceAfter.gte(destinationBalanceBefore)).to.be.eq(true)
            expect(destinationBalanceBefore.add(ethers.utils.parseEther("0.01"))).to.be.eq(destinationBalanceAfter)
        })
    })
});
