var StellarSdk = require('stellar-sdk'),
    log = require('tracer').colorConsole();

class StellarAssets {
    constructor(assetsFile) {
        try {
            this.assets = require(assetsFile)
        } catch (error) {
            log.warn("Custom asset file not found: " + assetsFile)
            this.assets = {}
        }        
    }

    static getLive() {
        return new StellarAssets("./config/assets_live.json")
    }

    static getTest() {
        return new StellarAssets("./config/assets.json")
    }

    get(name) {
        if (!name) {
            return StellarSdk.Asset.native()            
        }

        name = name.toUpperCase()
        if (name == "XLM") {
            return StellarSdk.Asset.native()
        }

        let a = this.assets[name]
        if (!a) {
            console.dir(this.assets)
            throw new Error("Asset does not exist: " + name)
        }
        return new StellarSdk.Asset(a.code, a.issuer);
    }
}

module.exports.StellarAssets = StellarAssets