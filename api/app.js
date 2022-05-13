const dotenv = require('dotenv')
dotenv.config()

// Helpers
const bodyParser = require('body-parser')
const express = require('express')
const compression = require('compression')
const app = express()
const cors = require('cors')
const helmet = require('helmet');

app.use(cors())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(compression())
app.use(helmet())

const API = require("./API")

app.get("/escrow/:index", API.Escrow.getEscrow)

app.post("/escrow", API.Escrow.createEscrow)
app.post("/escrow/fund", API.Escrow.fundEscrow)
app.post("/escrow/release", API.Escrow.releaseEscrow)
app.post("/escrow/reject", API.Escrow.rejectEscrow)
app.post("/escrow/refundExpired", API.Escrow.refundAllExpired)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`))