const Web3 = require("web3")
const web3 = new Web3(process.env.INFURA_LINK)
const Helpers = require("../helpers")

const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS
const ESCROW_ABI = require("../abi/escrow.json")

// Define constants
const EscrowContract = new web3.eth.Contract(ESCROW_ABI, ESCROW_CONTRACT_ADDRESS)
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const PRIVATE_KEY = process.env.PRIVATE_KEY
const DAY_IN_SECONDS = 86400

// Add our admin's private key via the environment
web3.eth.accounts.wallet.add(PRIVATE_KEY)
const adminAccount = web3.eth.accounts.wallet[0].address

module.exports = {
    /**
     * Fetches an escrow account from the contract
     *
     * @param   {Request}   req
     * @param   {Response}  res
     *
     */
    getEscrow: async (req, res) => {
        let escrowData
        let escrow

        try {
            escrowData = await EscrowContract.methods.activeEscrows(req.params.index).call()
        } catch(e) {
            return res.status(200).send({
                escrow: null
            })
        }

        if (escrowData.total === '0' && escrowData.destination === ZERO_ADDRESS) {
            escrow = null
        } else {
            escrow = Helpers.formatEscrow(escrowData)
        }

        return res.status(200).send({
            escrow
        })
    },
    createEscrow: async (req, res) => {
        EscrowContract.methods.createEscrow(
            req.body.source,
            req.body.destination,
            web3.utils.toWei(req.body.total),
            req.body.timeHorizon
        ).send({
            from: adminAccount,
            gasLimit: 300000
        }).then(result => {
            return res.status(200).send(result)
        }).catch(err => {
            return res.status(500).send(err)
        })
    },
    fundEscrow: async (req, res) => {
        EscrowContract.methods.fundEscrow(
            req.body.index
        ).send({
            from: adminAccount,
            gasLimit: 300000,
            value: web3.utils.toWei(req.body.fundingAmount)
        }).then(result => {
            return res.status(200).send(result)
        }).catch(err => {
            return res.status(500).send(err)
        })
    },
    releaseEscrow: async(req, res) => {
        EscrowContract.methods.releaseEscrow(
            req.body.index
        ).send({
            from: adminAccount,
            gasLimit: 300000
        }).then(result => {
            return res.status(200).send(result)
        }).catch(err => {
            return res.status(500).send(err)
        })
    },
    rejectEscrow: async(req, res) => {
        EscrowContract.methods.rejectEscrow(
            req.body.index
        ).send({
            from: adminAccount,
            gasLimit: 300000
        }).then(result => {
            return res.status(200).send(result)
        }).catch(err => {
            return res.status(500).send(err)
        })
    },
    refundAllExpired: async(req, res) => {
        EscrowContract.methods.refundAllExpiredEscrows().send({
            from: adminAccount,
            gasLimit: 300000
        }).then(result => {
            return res.status(200).send(result)
        }).catch(err => {
            return res.status(500).send(err)
        })
    }
}