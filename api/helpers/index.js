const Web3 = require("web3")
const web3 = new Web3(process.env.INFURA_LINK)

module.exports = {
    formatEscrow: (escrow) => {
        return {
            total: web3.utils.fromWei(escrow.total),            
            destination: escrow.destination,
            timeHorizon: parseInt(escrow.timeHorizon),
            amountInEscrow: web3.utils.fromWei(escrow.amountInEscrow),
            created: new Date(escrow.created * 1000).toISOString()
        }
    }
}