require('app-module-path').addPath("./common_modules")

var stellarPay = require("stellar-pay"),
    log = require('tracer').colorConsole(),
    StellarSdk = require('stellar-sdk'),
    util = require('util'),
    StellarAssets = require("./stellarAssets").StellarAssets,
    fs = require('fs'),
    readline = require('readline'),
    exec = util.promisify(require('child_process').exec);

var stellarServer, WALLET_FILE, assets;
if (process.env.LIVE == "1") {
    log.info(`using live server`)
    stellarServer = stellarPay.liveServer()
    WALLET_FILE = "./config/wallets_live.json"
    assets = StellarAssets.getLive()
} else {
    log.info(`using test server`)
    stellarServer = stellarPay.testServer()
    WALLET_FILE = "./config/wallets.json"
    assets = StellarAssets.getTest()    
}

var wallets = {}

try {
    wallets = require(WALLET_FILE)
} catch (error)  {
    log.info("No existing wallet file.")
}

let nativeAsset = StellarSdk.Asset.native()

let asset

class Wallet {
    constructor(data) {
        this.seed = data.seed
        this.address = data.address
    }

    getDescription() {
        return this.address
    }

    async sendPayment(receiver, value) {
        await stellarServer.sendPayment(this.address, receiver, value)
        return
    }

    async getTransactions() {
        console.log("listing transactions for " + this.address)
        let transactions = await stellarServer.server.transactions().forAccount(this.address).order('desc').limit(25).call()
        for (let record of transactions.records) {
            let memo = record.memo
            let data = new StellarSdk.Transaction(record.envelope_xdr)
            // console.dir(data.operations[0])
            let firstOperation = data.operations[0]
            let destination = firstOperation.destination
            let amount, assetType
            if (firstOperation.type == "payment") {
                amount = firstOperation.amount
                assetType = firstOperation.asset.code
            } else if (firstOperation.type == "pathPayment") {
                console.dir(firstOperation)
            }
            log.info(`data type=${firstOperation.type} memo=${memo} dest=${destination} amt=${amount} asset=${assetType}`)
        }
        // console.dir(transactions)
    }
}

let arguments = process.argv
let walletName, walletOp, specialOp

if (!arguments[2]) {
    throw new Error("wallet name or special operation is required")
}

if (arguments[3]) {
    walletName = arguments[2]
    walletOp = arguments[3]    
} else {
    specialOp = arguments[2]
}

let operationMap = {
    "create": create,
    "import": importAccount,
    "balance": balance,
    "send": send,    
    "pay": send,
    "send": send,
    "info": info,
    "tx": tx,
    "encode": encode,
    "trust": trustAsset,
    "issue": issueAsset,
    "offer": createOffer,
    "offerdel": deleteOffer,
    "pathxlm": pathToNative,
    "test": test,
    "clearOffers": clearOffers,
    "domain": setDomain
}

if (walletName) {
    try {
        walletOp = operationMap[walletOp]
        walletOp(walletName, ...arguments.slice(4));
    } catch (error) {
        log.error(error)
    }
} else {
    if (specialOp == "help") {
        log.info("Supported wallet-specific commands:")
        for (let k in operationMap) {
            console.log(k)
        }
    } else if (specialOp=="xdr") {
        console.dir(JSON.stringify(StellarSdk.xdr.TransactionEnvelope.fromXDR(arguments[3])));
    }
    else {
        throw new Error("Special operation does not exist:" + specialOp)
    }
}

async function info(walletName) {
    if (!wallets[walletName]) {
        throw new Error("wallet not found:" + walletName)
    }

    let wallet = new Wallet(wallets[walletName])
    console.log(wallet.address)
    console.log(wallet.seed)
}

async function tx(walletName) {
    try {
        if (!wallets[walletName]) {
            throw new Error("wallet not found:" + walletName)
        }

        let wallet = wallets[walletName]
        let a = stellarServer.getAccount(wallet)
        let txs = await a.listIncomingTransactions()
        for (let t of txs) {
            console.dir(t)
        }

        // let wallet = new Wallet(wallets[walletName])
        // await wallet.getTransactions()
    } catch (error) {
        console.log(error)
    }
}

function saveWallets() {
    var json = JSON.stringify(wallets, null, 4);
    fs.writeFileSync(WALLET_FILE, json, 'utf8');
}

async function create(name) {
    if (wallets[name]) {
        throw new Error("already exist: " + name)
    }

    [seed, address] = await stellarServer.createAccount()
    wallets[name] = { "seed": seed, "address": address }
    saveWallets()
}

async function importAccount(name, seed) {
    if (wallets[name]) {
        throw new Error("already exist: " + name)
    }

    try {
        var sk = StellarSdk.Keypair.fromSecret(seed);
        wallets[name] = { "seed": seed, "address": sk.publicKey() }        
        console.log("imported account: " + sk.publicKey())            
    } catch (error) {
        if (!StellarSdk.StrKey.isValidEd25519PublicKey(seed)) {
            throw new Error("Must provide a valid address or seed for import")
        }
        wallets[name] = { "address": seed }
        console.log("imported account: " + seed)
    }
    
    saveWallets()
}

function getAccount(name) {
    let w = wallets[name]
    if (!w) {
        log.error("No account with name: " + name)
        process.exit()
    }

    return stellarServer.getAccount(w)
}

async function balance(name) {
    let account = getAccount(name)
    let balance = await account.getBalance()
    console.dir(balance)
}

async function send(name, destination, amount, assetName, memo) {
    let asset = assets.get(assetName)
    log.info(`sending ${amount} ${assetName} to ${destination}`)

    let srcWallet = wallets[name]
    let destWallet = wallets[destination]
    memo = memo || destWallet.memo

    let account = stellarServer.getAccount(srcWallet)
    
    console.log("Name:\n" + destination)
    console.log("\nAddress:\n" + destWallet.address)
    console.log("\nAmount:\n" + amount + " " + asset.code)
    console.log("\nMemo:\n" + memo + "\n")

    if (!destWallet.seed) {
        console.log("(Warning): It appears that you don't own the seed for the destination account")
    }    
    console.log("Please confirm send (y):")

    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    rl.on('line', async function (line) {
        if (line == 'y') {
            rl.close()
            let transactionId = await account.sendPayment(destWallet.address, amount, memo, asset)
            console.log(transactionId)
            process.exit()
        } else {
            console.log("Cancelled")
            process.exit()
        }
    })

    return null
}

async function issueAsset(name, amount) {
    amount = amount || "1000"
    let ws = getWallets(name)
    for (let w of ws) {
        try {
            console.dir(w)
            if (w.name == "a") {
                continue
            }

            let account = stellarServer.getAccount(wallets["a"])
            let transactionId = await account.sendPayment(w.address, amount, null, asset)
            console.log("transactionId: " + transactionId)
        } catch (error) {
            console.error(error)
            // log.error(error)
        }
    }
}

function getWallets(walletName) {
    if (walletName != "all") {
        return [wallets[walletName]]
    }

    let o = []
    for (let name in wallets) {
        o.push(wallets[name])
    }
    return o
}

async function trustAsset(walletName, assetName, limit) {
    limit = limit || '1000000'
    console.log("trust asset: " + walletName)
    let asset = assets.get(assetName)
    console.dir(assetName)

    let ws = getWallets(walletName)

    console.dir(ws)
    for (let w of ws) {
        try {
            console.dir(w)
            if (w.name == "a") {
                continue
            }

            let server = stellarServer.server
            let receiver = await server.loadAccount(w.address)
            console.dir(receiver)
            console.dir(asset)
            var transaction = new StellarSdk.TransactionBuilder(receiver)
                .addOperation(StellarSdk.Operation.changeTrust({
                    asset: asset,
                    limit: limit
                }))
                .build();
            var receivingKeys = StellarSdk.Keypair.fromSecret(w.seed);
            transaction.sign(receivingKeys);
            await server.submitTransaction(transaction);
        } catch (error) {
            console.error(error)
            // console.dir(error.data.extras.result_codes)
            // log.error(error)
        }
    }
}

function getMasterAccount() {
    return wallets["master"]
}

function getAsset(name) {
    name = name.toLowerCase()
    if (name == "native" || name == "xlm") {
        return nativeAsset
    } else {
        let masterAccount = getMasterAccount()
        if (!masterAccount) {
            throw new Error("No master account! Please create an account named master")
        }

        return new StellarSdk.Asset(name.toUpperCase(), masterAccount.address);
    }
}

async function setDomain(walletName, d) {
    console.log("setting home domain to " + d)
    let wallet = wallets[walletName]
    let a = await stellarServer.getAccount(wallet)
    await a.setHomeDomain(d)
}

async function clearOffers(walletName) {
    let wallet = wallets[walletName]    
    let a = stellarServer.getAccount(wallet)
    let o = await a.deleteAllOffers()
}

async function createOffer(walletName, selling, buying, price, amount) {
    try {
        let wallet = wallets[walletName]

        buying = assets.get(buying)
        selling = assets.get(selling)
        let a = stellarServer.getAccount(wallet)
        let o = await a.createOffer(selling, buying, price, amount)
    } catch (error) {
        log.error("Failed to create offer:")
        console.dir(error.code)
    }
}

async function deleteOffer(walletName, offerId) {
    try {
        let wallet = wallets[walletName]

        // buying = getAsset(buying)
        // selling = getAsset(selling)
        let a = stellarServer.getAccount(wallet)
        let o = await a.deleteOffer(offerId)
        console.dir(new StellarSdk.Transaction(o.envelope_xdr))
        // console.dir(new StellarSdk.Transaction(o.result_xdr))
        // console.dir(new StellarSdk.Transaction(o.result_meta_xdr))
    } catch (error) {
        console.error(error)
        // console.dir(error.data)
        console.dir(error.data.extras.result_codes)
    }
}

async function pathToNative(srcWallet, destWallet, amt) {
    try {
        let r = stellarServer.getPath(wallets[srcWallet].address, wallets[destWallet].address, nativeAsset, amt)
    } catch (error) {
        console.error(error)
        // console.dir(error.data)
        console.dir(error.data.extras.result_codes)
    }
}

async function test(walletName) {
}    

async function encode(walletName, f, pass) {
    let wallet = wallets[walletName]
    let o = `${wallet.address}.${wallet.seed}`
    let cmd = `echo ${o} | openssl enc -base64 -e -aes-256-cbc -a -salt -k ${pass} -out ${f}`
    let { out, err } = await exec(cmd);
}

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});