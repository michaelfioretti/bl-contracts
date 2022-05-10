const Web3 = require("web3")
const web3 = new Web3(process.env.INFURA_LINK)
const Helpers = require("../helpers")

const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS
const ESCROW_ABI = require("../abi/escrow.json")

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

module.exports = {
    /**
     * Fetches an escrow account from the contract
     *
     * @param   {Request}   req
     * @param   {Response}  res
     *
     */
    getEscrow: async (req, res) => {
        const EscrowContract = new web3.eth.Contract(ESCROW_ABI, ESCROW_CONTRACT_ADDRESS)
        const escrowData = await EscrowContract.methods.activeEscrows(req.params.address).call()
        let escrow

        if (escrowData.total === '0' && escrowData.destination === ZERO_ADDRESS) {
            escrow = null
        } else {
            escrow = Helpers.formatEscrow(escrowData)
        }

        return res.status(200).send({
            escrow
        })
    }
}