# s-cli
This project is a convenient high-level CLI tool for common Stellar operations. It can be used to manage multiple Stellar accounts. Besides payments, it also supports multiple assets, custom asset management, path payments and trading.

# Basic Usage
By default, s-cli uses Stellar testnet. To use livenet (production network), simply set environment variable LIVE=1

Any Stellar accounts s-cli creates is persisted in `config/wallets.json` (for devnet) and `config/wallets_live.json` (for testnet). You could import other wallets by adding them to these files. Accounts without seeds can only receive assets and be queried.

Custom assets that you trust must be defined in `config/assets.json` (for devnet) and `config/assets_live.json` (for testnet). To resolve ambiguity (in case of multiple assets with same code), assign aliases to assets.

`
{
    "btc-strong" : {
        "code": "BTC",
        "issuer": "GBSTRH4QOTWNSVA6E4HFERETX4ZLSR3CIUBLK7AXYII277PFJC4BBYOG"
    }
}
`


All account specific commands follows this format:

*node scli.js <account_alias> <command_name> [additional args]*

#### For a list of all supported operations:
`node scli.js help`

# Basic Examples
#### Create an account with alias "master"
`node scli.js master create`

#### Get balance for "master"
`node scli.js master balance`

#### Send 1 XLM from "master" to "bob"
`node scli.js master pay bob 1`

#### Send 0.001 BTC from "master" to "bob"
`node scli.js master pay bob 1 btc-strong`

#### Create an offer (trade XLM for MOBI)
`node scli.js trader offer xlm mobi 4.75 100`

# Installation
*git submodule init*

*git submodule update --remote*

*npm install*

